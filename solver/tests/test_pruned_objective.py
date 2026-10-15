import pytest

from app.model import Weights, solve
from app.schemas import Calendar, Employee, Fault, Machine, Now, Order, Product, Snapshot, Step
from app.validate import check


@pytest.mark.parametrize('enabled,expected', [('1', 500), ('0', 0)])
def test_pruning_does_not_erase_employee_switch_cost(monkeypatch, enabled, expected):
    monkeypatch.setenv('SOLVER_SWITCH_COST', enabled)
    snap = Snapshot(
        calendar=Calendar(week=[False] + [True] * 6),
        machines=[
            Machine(id='cut', factory=1, process='cut', products=['p']),
            Machine(id='pack-other', factory=1, process='pack', products=['p']),
            Machine(id='pack-same', factory=1, process='pack', products=['p']),
        ],
        employees=[
            Employee(id='e1', name='One', factory=1, skills=['cut', 'pack-same']),
            Employee(id='e2', name='Two', factory=1, skills=['pack-other']),
        ],
        products=[Product(id='p', name='Product', steps=[
            Step(process='cut', rate=1, batch=0), Step(process='pack', rate=1, batch=0)
        ])],
        orders=[Order(id='o', code='Order', product='p', qty=60, due='2026-10-01')],
    )
    now = Now(date='2026-09-28', min=480)
    weights = Weights(tard=0, comp=0, sw_emp=500)
    full = solve(snap, now, weights, time_limit=3, workers=1)
    restricted = solve(snap, now, weights, time_limit=3, workers=1, pair_cap=1)
    for result in [full, restricted]:
        assert result.status in ('OPTIMAL', 'FEASIBLE')
        assert not result.unplaced
        assert check(snap, result.blocks, now) == []
    if enabled == '1':
        assert {b.employee for b in full.blocks} == {'e1'}
    assert {b.employee for b in restricted.blocks} == {'e1', 'e2'}
    assert full.objective == 0
    assert restricted.objective == expected


def test_pruning_does_not_erase_machine_switch_cost(monkeypatch):
    monkeypatch.setenv('SOLVER_SWITCH_COST', '1')
    day = '2026-09-28'
    snap = Snapshot(
        calendar=Calendar(week=[False] + [True] * 6),
        machines=[
            Machine(id='m1', factory=1, process='cut', products=['p'],
                    faults=[Fault(date=day, start=600, end=1020)]),
            Machine(id='m2', factory=1, process='cut', products=['p']),
        ],
        employees=[Employee(id='e', name='Worker', factory=1, skills=['m1', 'm2'])],
        products=[Product(id='p', name='Product', steps=[
            Step(process='cut', rate=1, batch=0), Step(process='cut', rate=0.25, batch=0)
        ])],
        orders=[Order(id='o', code='Order', product='p', qty=60, due=day)],
    )
    now = Now(date=day, min=480)
    weights = Weights(tard=1000, comp=0, sw_mach=80)
    full = solve(snap, now, weights, time_limit=3, workers=1)
    restricted = solve(snap, now, weights, time_limit=3, workers=1, pair_cap=1)
    for result in [full, restricted]:
        assert result.status in ('OPTIMAL', 'FEASIBLE')
        assert not result.unplaced
        assert check(snap, result.blocks, now) == []
    assert {b.machine for b in full.blocks} == {'m2'}
    assert {b.machine for b in restricted.blocks} == {'m1', 'm2'}
    assert full.objective == 0
    assert restricted.objective == 80
