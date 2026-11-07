"""The displayed preview must be bound to the exact DB read used to compute it."""
from copy import deepcopy
from fastapi.testclient import TestClient
from app import main as api


def test_db_plan_returns_exact_single_source_read_without_persisting_extra_payload(demo, monkeypatch):
    snap, now = demo
    raw = snap.model_dump()
    # These fields survive the HTTP response, even though Snapshot ignores them.
    raw['ot_ends'] = {now.date: 1140}
    raw['schedule_memos'] = [{'id': 'memo', 'text': 'Visible metadata'}]
    raw['employees'][0]['source_notes'] = 'Original catalog note'
    captured = deepcopy(raw)
    calls = []

    class Fake:
        configured = True

        async def user_id(self, jwt):
            return 'tester'

        async def permission(self, jwt, key):
            return True

        async def snapshot(self, jwt):
            calls.append('snapshot')
            return raw

        async def save_preview(self, plan, uid):
            calls.append('save')
            assert 'source_snapshot' not in plan
            assert plan['options']
            return 'preview-id'

    monkeypatch.setattr(api, 'supa', Fake())
    response = TestClient(api.app).post('/plans/db', json={
        'event': {'type': 'auto'}, 'now': now.model_dump(), 'time_limit': 0.1,
        'hints': {'keep_people': True},
    }, headers={'Authorization': 'Bearer synthetic'})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['source_snapshot'] == captured
    assert result['preview_id'] == 'preview-id'
    assert calls == ['snapshot', 'save']
    assert raw == captured  # Solver event/application must not mutate the receipt.
