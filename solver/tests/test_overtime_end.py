"""Daily overtime endpoints survive frontend/DB snapshots and constrain solving."""
import copy

import pytest
from pydantic import ValidationError

from app.schemas import Block, Now, Snapshot
from app.timeline import Timeline
from app.model import PRESETS, solve
from app.validate import check

DAY = '2026-11-06'


def raw(end=1080):
    return dict(calendar=dict(week=[False, True, True, True, True, True, False],
                              overtime={DAY: True}), ot_ends={DAY: end},
                employees=[dict(id='e', name='Employee', skills=['m'])],
                machines=[dict(id='m', process='cut', products=['p'])],
                products=[dict(id='p', name='Product', steps=[dict(process='cut', rate=1)])],
                orders=[dict(id='o', code='ORDER', product='p', qty=120, due=DAY)])


def windows(snapshot, extra=frozenset()):
    return [(w.start, w.end) for w in Timeline(snapshot.calendar, DAY, 1, extra).wins]


@pytest.mark.parametrize('end', [1020, 1080, 1140, 1200, 1260, 1320])
def test_saved_daily_endpoint(end):
    expected = [(480, 720), (780, 1020)] + ([(1020, end)] if end > 1020 else [])
    snap = Snapshot(**raw(end))
    assert windows(snap) == expected
    assert windows(snap, {DAY}) == expected


def test_snapshot_copy_and_dump_preserve_cutoff_without_mutating_input():
    payload = raw()
    original = copy.deepcopy(payload)
    snap = Snapshot(**payload)
    assert payload == original
    for candidate in [snap.model_copy(deep=True), Snapshot(**snap.model_dump())]:
        assert windows(candidate)[-1] == (1020, 1080)
    payload['ot_ends'][DAY] = 1320
    assert windows(snap)[-1] == (1020, 1080)


@pytest.mark.parametrize('mode', ['missing', 'null-map', 'null-end'])
def test_legacy_endpoints(mode):
    payload = raw(None)
    if mode == 'missing':
        del payload['ot_ends']
    elif mode == 'null-map':
        payload['ot_ends'] = None
    assert windows(Snapshot(**payload))[-1] == (1020, 1200)


@pytest.mark.parametrize('end', [1019, 1321, 1080.5, True])
def test_invalid_endpoint_rejected(end):
    with pytest.raises(ValidationError):
        Snapshot(**raw(end))


def test_disabled_overtime_and_explicit_extra_do_not_reopen_closed_day():
    payload = raw()
    payload['calendar']['overtime'][DAY] = False
    snap = Snapshot(**payload)
    assert windows(snap) == [(480, 720), (780, 1020)]
    assert windows(snap, {DAY})[-1] == (1020, 1200)
    payload['calendar']['overrides'] = {DAY: False}
    assert windows(Snapshot(**payload), {DAY}) == []


@pytest.mark.parametrize('end,expected', [(1080, [(1020, 1080)]),
                                          (1320, [(1020, 1110), (1140, 1260)])])
def test_custom_windows_keep_breaks_and_never_extend(end, expected):
    payload = raw(end)
    payload['calendar']['windows'] = [dict(start=480, end=720),
                                     dict(start=1020, end=1110, overtime=True),
                                     dict(start=1140, end=1260, overtime=True),
                                     dict(start=1260, end=1380)]
    assert windows(Snapshot(**payload)) == [(480, 720)] + expected + [(1260, 1380)]


def test_solver_and_independent_validator_respect_cutoff():
    snap = Snapshot(**raw())
    now = Now(date=DAY, min=1020)
    result = solve(snap, now, PRESETS['min_change'], time_limit=1, days=4, workers=1)
    assert result.status in ('OPTIMAL', 'FEASIBLE')
    assert sum(b.qty for b in result.blocks) == 120
    assert all(b.end <= 1080 for b in result.blocks if b.date == DAY)
    assert not check(snap, result.blocks, now)
    bad = Block(order='o', step=0, machine='m', employee='e', date=DAY,
                start=1020, end=1140, qty=120)
    assert any('不在上班時段內' in issue for issue in check(snap, [bad], now))


def test_api_accepts_boolean_overtime_with_endpoint(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    monkeypatch.delenv('SOLVER_DISABLE_SNAPSHOT_API', raising=False)
    monkeypatch.delenv('SOLVER_API_KEY', raising=False)
    with TestClient(app) as client:
        response = client.post('/plans', json=dict(snapshot=raw(), event=dict(type='auto'),
                                                   now=dict(date=DAY, min=1020), time_limit=1))
    assert response.status_code == 200
    options = [option for option in response.json()['options'] if option['applicable']]
    assert options
    assert all(b['end_min'] <= 1080 for option in options for b in option['blocks'] if b['date'] == DAY)


def test_database_api_preserves_snapshot_endpoint_in_saved_preview(monkeypatch):
    from fastapi.testclient import TestClient
    from app import main as api

    saved = []

    class FakeSupabase:
        configured = True

        async def user_id(self, jwt):
            return 'synthetic-user'

        async def permission(self, jwt, permission):
            return permission == 'schedule.manage'

        async def snapshot(self, jwt):
            return raw()

        async def save_preview(self, plan, user_id):
            saved.append((copy.deepcopy(plan), user_id))
            return 'synthetic-preview'

    monkeypatch.setattr(api, 'supa', FakeSupabase())
    with TestClient(api.app) as client:
        response = client.post('/plans/db', headers={'Authorization': 'Bearer synthetic'},
                               json=dict(event=dict(type='auto'), now=dict(date=DAY, min=1020), time_limit=1))
    assert response.status_code == 200
    assert response.json()['preview_id'] == 'synthetic-preview'
    assert len(saved) == 1 and saved[0][1] == 'synthetic-user'
    options = [option for option in saved[0][0]['options'] if option['applicable']]
    assert options
    assert all(b['end_min'] <= 1080 for option in options for b in option['blocks'] if b['date'] == DAY)


@pytest.mark.parametrize('end', [1260, 1320])
def test_solver_can_use_extended_standard_overtime(end):
    payload = raw(end)
    payload['orders'][0]['qty'] = end - 1020
    snap = Snapshot(**payload)
    now = Now(date=DAY, min=1020)
    result = solve(snap, now, PRESETS['min_change'], time_limit=1, days=1, workers=1)
    assert result.status in ('OPTIMAL', 'FEASIBLE')
    assert sum(b.qty for b in result.blocks) == end - 1020
    assert max(b.end for b in result.blocks if b.date == DAY) == end
    assert not check(snap, result.blocks, now)


def test_explicit_standard_windows_work_regardless_of_input_order():
    from app.schemas import DEFAULT_WINDOWS
    payload = raw(1320)
    payload['calendar']['windows'] = [w.model_dump() for w in reversed(DEFAULT_WINDOWS)]
    assert windows(Snapshot(**payload))[-1] == (1020, 1320)
