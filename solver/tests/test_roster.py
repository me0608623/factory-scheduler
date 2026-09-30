from copy import deepcopy
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.roster import RosterRequest, solve_roster


def request(regime='fixed', people=1):
    n={'fixed':7,'two':14,'four':28,'eight':56}[regime]
    start=date(2026,9,28)
    dates=[start+timedelta(days=i) for i in range(n)]
    return {'roster':{'id':'draft','regime':regime,'start':str(start),'anchor':str(start),'eligibilityRef':'測試企業核定','consentRef':'測試紀錄',
        'shifts':[{'id':'day','name':'日班','segments':[[480,720],[780,1020]]}],
        'positions':[{'id':'pos','name':'人工檢查','employeeIds':['a','b'],'rate':10}],
        'employees':[{'emp':emp,'shiftIds':['day'],'weekdays':[1,2,3,4,5]} for emp in ('a','b')],
        'cells':[{'emp':emp,'date':str(d),'type':'regular' if d.weekday()==6 else 'rest' if d.weekday()==5 else 'work','shiftId':None,'positionId':None,'pin':False} for emp in ('a','b') for d in dates],
        'demands':[{'date':str(d),'shiftId':'day','positionId':'pos','people':people,'target':people*80} for d in dates if d.weekday()<5]},
        'workers':[{'id':emp,'leaves':[]} for emp in ('a','b')], 'time_limit':1}


@pytest.mark.parametrize('regime',['fixed','two','four','eight'])
def test_complete_regimes_and_fairness(regime):
    req=RosterRequest(**request(regime));res=solve_roster(req)
    assert res['status'] in ('OPTIMAL','FEASIBLE')
    assert res['engine']=='OR-Tools CP-SAT'
    assert sum(c['shiftId'] is not None for c in res['cells'])==len(req.roster.demands)
    assert abs(sum(c['emp']=='a' and c['shiftId'] is not None for c in res['cells'])-sum(c['emp']=='b' and c['shiftId'] is not None for c in res['cells']))<=1


def test_shortages_are_not_filled_by_unqualified_or_leave_staff():
    r=request(people=2);r['workers'][0]['leaves']=['2026-09-28'];r['roster']['positions'][0]['employeeIds']=['a']
    res=solve_roster(RosterRequest(**r))
    assert not any(c['shiftId'] for c in res['cells'] if c['date']=='2026-09-28')
    assert not any(c['shiftId'] for c in res['cells'] if c['emp']=='b')


def test_pinned_unavailable_is_rejected_not_unpinned():
    r=request();r['roster']['cells'][0].update(shiftId='day',positionId='pos',pin=True);r['workers'][0]['leaves']=['2026-09-28']
    with pytest.raises(ValueError,match='固定班格'):solve_roster(RosterRequest(**r))


def test_occupancy_outside_shift_cannot_be_ignored():
    r=request();r['occupied']=[{'emp':'a','date':'2026-09-28','s':1080,'e':1140}]
    assert solve_roster(RosterRequest(**r))['cells'] is None


def test_unknown_capacity_and_unapproved_regime_rejected():
    r=request();r['roster']['positions'][0]['rate']=None
    with pytest.raises(ValueError,match='產能'):solve_roster(RosterRequest(**r))
    r=request('two');r['roster']['consentRef']=''
    with pytest.raises(ValueError,match='同意'):solve_roster(RosterRequest(**r))


def test_incomplete_cycles_duplicate_and_excess_working_days_rejected():
    r=request();r['roster']['cells'].pop()
    with pytest.raises(ValueError,match='完整'):solve_roster(RosterRequest(**r))
    r=request();r['roster']['anchor']='2026-09-29'
    with pytest.raises(ValueError,match='對齊'):solve_roster(RosterRequest(**r))


def test_night_shift_does_not_invade_next_rest_day():
    r=request();r['roster']['shifts'][0]['segments']=[[1320,1560],[1590,1830]]
    res=solve_roster(RosterRequest(**r))
    assert not any(c['shiftId'] for c in res['cells'] if c['date']=='2026-10-02')


def test_snapshot_endpoint_reuses_auth_and_computation_guards(monkeypatch):
    client=TestClient(app)
    monkeypatch.setenv('SOLVER_API_KEY','secret')
    assert client.post('/roster/plans',json=request()).status_code==401
    assert client.post('/roster/plans',json=request(),headers={'X-API-Key':'secret'}).status_code==200
    monkeypatch.setenv('SOLVER_DISABLE_SNAPSHOT_API','true')
    assert client.post('/roster/plans',json=request(),headers={'X-API-Key':'secret'}).status_code==403


def test_database_endpoint_uses_authoritative_leave_and_date_range(monkeypatch, demo):
    import app.main as api
    raw=demo[0].model_dump(mode='json');raw['blocks']=[];raw['work_assignments']=[]
    ids=[e['id'] for e in raw['employees'][:2]]
    raw['employees'][0]['leaves']=['2026-09-28']
    raw['employees'][1]['leaves']=['2026-09-28']
    r=request();mapping=dict(zip(('a','b'),ids))
    for e in r['roster']['employees']:e['emp']=mapping[e['emp']]
    for c in r['roster']['cells']:c['emp']=mapping[c['emp']]
    r['roster']['positions'][0]['employeeIds']=ids
    # Client-supplied leave/occupancy is untrusted and must not override DB data.
    r['workers']=[{'id':emp,'leaves':[]} for emp in ids]
    calls=[]
    class Fake:
        configured=True
        async def permission(self,jwt,key):
            assert jwt=='test-token' and key=='rosters.manage';return True
        async def snapshot(self,jwt,**bounds):
            calls.append(bounds);return deepcopy(raw)
    monkeypatch.setattr(api,'supa',Fake())
    response=TestClient(app).post('/roster/plans/db',json=r,headers={'Authorization':'Bearer test-token'})
    assert response.status_code==200,response.text
    assert not any(c['shiftId'] for c in response.json()['cells'] if c['date']=='2026-09-28')
    assert calls==[{'start':'2026-09-22','end':'2026-10-05'}]
    assert raw['blocks']==[]  # endpoint has no write operation


def test_database_endpoint_denies_viewer_before_snapshot(monkeypatch):
    import app.main as api
    class Fake:
        configured=True
        async def permission(self,jwt,key):return False
        async def snapshot(self,*args,**kwargs):raise AssertionError('must not read after denial')
    monkeypatch.setattr(api,'supa',Fake())
    client=TestClient(app)
    assert client.post('/roster/plans/db',json=request()).status_code==422
    assert client.post('/roster/plans/db',json=request(),headers={'Authorization':'Bearer viewer'}).status_code==403


def test_bounded_eight_week_40_employee_roster():
    r=request('eight',people=20);base=deepcopy(r['roster']['cells'][:56])
    ids=[f'worker-{i}' for i in range(40)]
    r['roster']['employees']=[{'emp':emp,'shiftIds':['day'],'weekdays':[1,2,3,4,5]} for emp in ids]
    r['roster']['positions'][0]['employeeIds']=ids
    r['roster']['cells']=[dict(c,emp=emp) for emp in ids for c in base]
    r['workers']=[{'id':emp,'leaves':[]} for emp in ids];r['time_limit']=3
    result=solve_roster(RosterRequest(**r))
    assert result['status'] in ('OPTIMAL','FEASIBLE')
    assert len(result['cells'])==2240
    for d in r['roster']['demands']:
        assert sum(c['date']==d['date'] and c['shiftId']=='day' for c in result['cells'])==20
