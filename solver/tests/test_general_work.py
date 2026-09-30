import pytest
from pydantic import ValidationError
from app.schemas import Snapshot,Calendar,Employee,Machine,Product,Step,Order,Now,WorkAssignment
from app.model import solve,PRESETS
from app.validate import check

def case(resource=None):
    return Snapshot(calendar=Calendar(week=[False,True,True,True,True,True,False]),
        employees=[Employee(id='e',name='E',skills=['m','m2'],max_concurrent_machines=2)],
        machines=[Machine(id=k,process='切',products=['p']) for k in ['m','m2']],
        products=[Product(id='p',name='P',steps=[Step(process='切',rate=1)])],
        orders=[Order(id='o',code='O',product='p',qty=60,due='2025-01-02')],
        work_assignments=[WorkAssignment(id='w',workId='catalog',emp='e',resourceId=resource,date='2025-01-02',s=480,e=540)])

@pytest.mark.parametrize('pair_cap',[None,1])
def test_manual_work_blocks_all_employee_capacity_without_a_machine(pair_cap):
    snap=case();r=solve(snap,Now(date='2025-01-02',min=480),weights=PRESETS['on_time'],time_limit=1,pair_cap=pair_cap)
    assert r.blocks
    assert min(b.start for b in r.blocks)>=540
    assert check(snap,r.blocks)==[]
    assert snap.work_assignments[0].s==480

def test_equipment_work_uses_resource_and_one_unit_of_person_capacity():
    snap=case('m');r=solve(snap,Now(date='2025-01-02',min=480),weights=PRESETS['on_time'],time_limit=1)
    assert r.blocks
    assert all(b.machine!='m' or b.start>=540 for b in r.blocks)
    assert check(snap,r.blocks)==[]
    # At cap 2, the other machine may run alongside the general equipment work.
    assert min(b.start for b in r.blocks)==480

@pytest.mark.parametrize('change',[{'emp':'missing'},{'resourceId':'unknown'},{'date':'2025-02-30'},{'e':470}])
def test_invalid_work_cannot_be_silently_ignored(change):
    raw=case().model_dump();raw['work_assignments'][0].update(change)
    with pytest.raises(ValidationError):Snapshot(**raw)

def test_validator_rejects_production_over_manual_even_with_multiple_machine_capacity():
    snap=case();r=solve(case('m'),Now(date='2025-01-02',min=480),weights=PRESETS['on_time'],time_limit=1)
    assert any('上限' in issue for issue in check(snap,r.blocks))

def test_invalid_fixed_work_marks_plan_inapplicable_instead_of_moving_it():
    snap=case();snap.employees[0].leaves=['2025-01-02']
    assert any('手動調整' in issue for issue in check(snap,[]))

def test_historical_work_is_not_reinterpreted_using_a_changed_calendar():
    snap=case();snap.calendar.week=[False]*7
    assert not any(issue.startswith('一般工作') for issue in check(snap,[],Now(date='2025-01-03',min=480)))
