import asyncio
import json
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient
import app.main as api
from app.chat import ChatQuery, ChatUnavailable, build_context, respond


def query(**kw):
    return ChatQuery(**({'question':'目前排程有哪些問題？','date':'2026-09-26'}|kw))


def test_grounding_scope_immutability_and_non_completion(demo):
    raw=demo[0].model_dump(mode='json');before=deepcopy(raw)
    ctx=build_context(raw,query(factory=1));result=asyncio.run(respond(query(),ctx))
    assert result['engine']=='資料查詢（非生成式 AI）'
    assert all(i in {f['id'] for f in ctx['facts']} for i in result['citations'])
    assert '不代表全部工單進度' in ctx['facts'][0]['text']
    assert raw==before
    for f in ctx['facts']:
        assert f['kind']!='work' or '預排' in f['text'] or '不等於完成量' in f['text']


def test_no_credentials_or_notes_in_projection(demo):
    raw=demo[0].model_dump(mode='json');raw['api_key']='secret-value'
    raw['employees'][0]['source_notes']='PRIVATE-NOTE'
    ctx=build_context(raw,query());encoded=json.dumps(ctx)
    assert 'secret-value' not in encoded and 'PRIVATE-NOTE' not in encoded


def test_material_alert_matches_linked_work_without_inventing_receipts(demo):
    raw=demo[0].model_dump(mode='json');emp=raw['employees'][0]['id']
    raw['work_contents']=[{'id':'w','name':'人工檢查','factory':1}]
    raw['work_assignments']=[{'id':'wa','emp':emp,'workId':'w','resourceId':None,'date':'2026-09-26','s':600,'e':660,'qty':20,'transferBatchId':'batch'}]
    raw['transfer_orders']=[{'id':'t','code':'X01','status':'active','due':None,'batches':[{'id':'batch'}],'events':[]}]
    ctx=build_context(raw,query())
    assert any(f['kind']=='material' and '尚缺 20 件' in f['text'] for f in ctx['facts'])


def test_bounded_context_and_snapshot(demo):
    raw=demo[0].model_dump(mode='json');base=raw['blocks'][0];base['date']='2026-09-26'
    raw['blocks']=[dict(base,id=str(i)) for i in range(110)]
    ctx=build_context(raw,query(question='總覽'));assert ctx['truncated'] and len(ctx['facts'])==100
    raw['unused']='x'*3000001
    with pytest.raises(ValueError,match='容量'):build_context(raw,query())


def test_latest_execution_scoped_and_not_full_order_completion(demo):
    raw=demo[0].model_dump(mode='json');b=raw['blocks'][0];b['date']='2026-09-26';b['qty']=10
    raw['blocks']=[b]
    raw['work_execution']=[{'blockId':b['id'],'status':'done','qtyDone':8,'note':'PRIVATE-NOTE'},
                           {'blockId':'not-visible','status':'running','qtyDone':999}]
    before=deepcopy(raw);ctx=build_context(raw,query(question='目前完成進度'))
    result=asyncio.run(respond(ChatQuery(question='目前完成進度',date='2026-09-26'),ctx))
    assert '累計 8／預排 10' in result['answer'] and '完成回報少於預排量' in result['answer']
    assert '不代表整張工單完工' in result['answer'] and '不是選定日期當時' in result['answer']
    assert 'PRIVATE-NOTE' not in json.dumps(ctx) and '999' not in result['answer'] and raw==before
    raw['work_execution']=[]
    assert any(f['kind']=='execution' and '不能判定未開始或已完成' in f['text'] for f in build_context(raw,query(question='目前完成進度'))['facts'])
    raw['work_execution']=[{'blockId':b['id'],'status':'done','qtyDone':11}]
    assert any(f['kind']=='execution_alert' and '回報格式異常' in f['text'] for f in build_context(raw,query())['facts'])


def test_manual_capacity_only_conflicts_when_intervals_overlap(demo):
    raw=demo[0].model_dump(mode='json');b=raw['blocks'][0];b.update(date='2026-09-26',start=480,end=540)
    raw['blocks']=[b,dict(b,id='second',start=500,end=570)]
    next(e for e in raw['employees'] if e['id']==b['employee'])['max_concurrent_machines']=2
    raw['work_contents']=[{'id':'w','name':'整理','factory':1}]
    raw['work_assignments']=[{'id':'manual','emp':b['employee'],'workId':'w','resourceId':None,'date':'2026-09-26','s':600,'e':660}]
    def conflicts():return any(f['kind']=='alert' and '同時工作占用' in f['text'] for f in build_context(raw,query())['facts'])
    assert not conflicts()
    raw['work_assignments'][0]['s']=530;assert conflicts()
    raw['work_assignments'][0]['s']=570;assert not conflicts()


def test_progress_query_does_not_filter_known_invalid_reports(demo):
    raw=demo[0].model_dump(mode='json');b=raw['blocks'][0]
    b.update(date='2026-09-26',qty=10);raw['blocks']=[b]
    raw['work_execution']=[{'blockId':b['id'],'status':'done','qtyDone':11}]
    for question in ('目前完成進度','目前排程有哪些問題？'):
        q=query(question=question)
        result=asyncio.run(respond(q,build_context(raw,q)))
        assert '現場回報格式異常，不能確認實際進度' in result['answer']
        assert result['citations']
        assert '沒有找到此類紀錄' not in result['answer']


def test_range_bounds_and_filtered_dated_reports(demo):
    raw=demo[0].model_dump(mode='json');b=raw['blocks'][0];b['date']='2026-09-26'
    raw['blocks']=[b,dict(b,id='next',date='2026-09-27')]
    ctx=build_context(raw,query(question='完成進度',end_date='2026-09-27'))
    assert ctx['endDate']=='2026-09-27' and any(f['kind']=='execution' and f['date']=='2026-09-27' for f in ctx['facts'])
    with pytest.raises(ValueError):query(end_date='2026-09-25')
    with pytest.raises(ValueError):query(end_date='2026-10-27')


def test_large_range_retrieval_is_bounded_and_keeps_conflicts(demo):
    import time
    raw=demo[0].model_dump(mode='json');b=raw['blocks'][0]
    raw['blocks']=[dict(b,id=f'large-{i}',date=f'2026-09-{1+i%30:02d}') for i in range(10000)]
    started=time.monotonic();ctx=build_context(raw,query(date='2026-09-01',end_date='2026-09-30'))
    assert len(ctx['facts'])<=100 and any(f['kind']=='alert' and '重疊' in f['text'] for f in ctx['facts'])
    assert not any(f['kind']=='work' for f in ctx['facts'])
    assert time.monotonic()-started<5  # synthetic regression guard, not production SLA


def test_roster_draft_and_transfer_as_of_day_without_future_receipts(demo):
    raw=demo[0].model_dump(mode='json');emp=raw['employees'][0]['id']
    raw['staff_rosters']=[{'id':'draft','name':'測試輪班','status':'draft','factory':1,
        'shifts':[{'id':'s','name':'日班','segments':[[480,720]]}],
        'positions':[{'id':'pos','name':'檢查','rate':None}],
        'cells':[{'emp':emp,'date':'2026-09-26','type':'work','shiftId':'s','positionId':'pos'}],
        'demands':[{'date':'2026-09-26','shiftId':'s','positionId':'pos','people':2,'target':50}],'consentRef':'PRIVATE-REF'}]
    raw['transfer_orders']=[{'id':'x','code':'X001','itemCode':'料號','fromFactory':1,'toFactory':2,'returnFactory':1,
        'status':'active','totalQty':20,'urgentQty':10,'due':'2026-09-25','workIds':['w'],'batches':[{'id':'batch'}],
        'events':[{'batchId':'batch','action':'send','qty':20,'at':'2026-09-26T09:00'},
                  {'batchId':'batch','action':'receive','qty':20,'at':'2026-09-27T09:00','note':'PRIVATE-EVENT'}]}]
    before=deepcopy(raw);roster=build_context(raw,query(question='輪班人力缺口',factory=1))
    assert any(f['kind']=='roster' and '尚缺 1 人' in f['text'] and '產能未設定' in f['text'] for f in roster['facts'])
    transfer=build_context(raw,query(question='跨廠流轉',factory=1))
    assert any(f['kind']=='transfer' and '加工廠點收 0' in f['text'] for f in transfer['facts'])
    assert any(f['kind']=='deadline' and '回廠逾期' in f['text'] for f in transfer['facts'])
    assert 'PRIVATE-' not in json.dumps(roster)+json.dumps(transfer) and raw==before
    next_day=build_context(raw,query(question='跨廠流轉',date='2026-09-27',factory=2))
    assert any(f['kind']=='transfer' and '加工廠點收 20' in f['text'] for f in next_day['facts'])


def test_external_model_disabled_until_explicit_approval(monkeypatch,demo):
    monkeypatch.delenv('AI_SCHEDULE_DATA_APPROVED',raising=False)
    q=query(generate=True);ctx=build_context(demo[0].model_dump(mode='json'),q)
    with pytest.raises(ChatUnavailable,match='未外傳'):asyncio.run(respond(q,ctx))
    monkeypatch.setenv('AI_SCHEDULE_DATA_APPROVED','true');monkeypatch.setenv('SCHEDULE_CHAT_AI_ENABLED','true');monkeypatch.delenv('OPENAI_API_KEY',raising=False)
    with pytest.raises(ChatUnavailable,match='金鑰'):asyncio.run(respond(q,ctx))


def test_db_authority_and_viewer_denied_before_read(monkeypatch,demo):
    raw=demo[0].model_dump(mode='json');calls=[]
    class Fake:
        configured=True
        async def permission(self,jwt,key):return jwt=='lead' and key=='schedule.manage'
        async def snapshot(self,jwt,**kwargs):
            assert jwt=='lead';calls.append(kwargs);return deepcopy(raw)
    monkeypatch.setattr(api,'supa',Fake());client=TestClient(api.app)
    req={'question':'概覽','date':'2026-09-26','factory':1,'snapshot':{'version':999,'secret':'injected'}}
    assert client.post('/chat/db',json=req,headers={'Authorization':'Bearer viewer'}).status_code==403
    assert calls==[]
    assert client.post('/chat/db',json=req,headers={'Authorization':'bad'}).status_code==401
    response=client.post('/chat/db',json=req,headers={'Authorization':'Bearer lead'})
    assert response.status_code==200,response.text
    assert response.json()['context']['version']!=999
    assert calls==[{'start':'2026-09-26','end':'2026-09-26'}]
    req['end_date']='2026-09-28'
    assert client.post('/chat/db',json=req,headers={'Authorization':'Bearer lead'}).status_code==200
    assert calls[-1]=={'start':'2026-09-26','end':'2026-09-28'}
    req['end_date']='2026-11-01'
    assert client.post('/chat/db',json=req,headers={'Authorization':'Bearer lead'}).status_code==422
    assert len(calls)==2


def test_snapshot_auth_capacity_and_readonly(monkeypatch,demo):
    raw=demo[0].model_dump(mode='json');req={'question':'幫我修改排程','date':'2026-09-26','snapshot':raw}
    monkeypatch.setenv('SOLVER_API_KEY','test-secret');client=TestClient(api.app)
    assert client.post('/chat',json=req).status_code==401
    response=client.post('/chat',json=req,headers={'X-API-Key':'test-secret'})
    assert response.status_code==200 and '沒有修改' in response.json()['answer']
    monkeypatch.setenv('SOLVER_DISABLE_SNAPSHOT_API','true')
    assert client.post('/chat',json=req,headers={'X-API-Key':'test-secret'}).status_code==403


@pytest.mark.parametrize('citation',['F999',12])
def test_model_unknown_citations_rejected(monkeypatch,demo,citation):
    monkeypatch.setenv('AI_SCHEDULE_DATA_APPROVED','true');monkeypatch.setenv('SCHEDULE_CHAT_AI_ENABLED','true');monkeypatch.setenv('OPENAI_API_KEY','fake-test-key');monkeypatch.setenv('SCHEDULE_CHAT_MODEL','test-model')
    import app.chat as chat
    class Response:
        status_code=200
        def json(self):return {'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':json.dumps({'answer':'依據','citations':[citation]})}]}]}
    class FakeClient:
        def __init__(self,**kw):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*args):pass
        async def post(self,url,**kw):
            assert url=='https://api.openai.com/v1/responses'
            assert kw['json']['store'] is False and 'tools' not in kw['json']
            return Response()
    monkeypatch.setattr(chat.httpx,'AsyncClient',FakeClient)
    q=query(generate=True)
    with pytest.raises(ChatUnavailable,match='依據'):asyncio.run(respond(q,build_context(demo[0].model_dump(mode='json'),q)))


def test_zai_general_api_grounded_answer(monkeypatch,demo):
    monkeypatch.setenv('AI_SCHEDULE_DATA_APPROVED','true')
    monkeypatch.setenv('SCHEDULE_CHAT_AI_ENABLED','true')
    monkeypatch.setenv('SCHEDULE_CHAT_PROVIDER','zai')
    monkeypatch.setenv('ZAI_API_KEY','fake-zai-key')
    monkeypatch.setenv('SCHEDULE_CHAT_MODEL','glm-test')
    monkeypatch.setenv('SCHEDULE_CHAT_AI_ENABLED','true')
    import app.chat as chat
    seen={}
    class Response:
        status_code=200
        def json(self):return {'choices':[{'message':{'content':json.dumps({'answer':'需檢查排程','citations':['F1']})}}]}
    class FakeClient:
        def __init__(self,**kw):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*args):pass
        async def post(self,url,**kw):
            seen.update(url=url,headers=kw['headers'],payload=kw['json'])
            return Response()
    monkeypatch.setattr(chat.httpx,'AsyncClient',FakeClient)
    q=query(generate=True);result=asyncio.run(respond(q,build_context(demo[0].model_dump(mode='json'),q)))
    assert result['engine']=='AI（Z.ai，唯讀）' and result['citations']==['F1']
    assert seen['url']=='https://api.z.ai/api/paas/v4/chat/completions'
    assert seen['headers']['Authorization']=='Bearer fake-zai-key'
    assert seen['payload']['response_format']=={'type':'json_object'}
    assert seen['payload']['model']=='glm-test' and 'tools' not in seen['payload']


def test_health_only_advertises_ai_when_fully_configured(monkeypatch):
    client=TestClient(api.app)
    monkeypatch.setenv('SCHEDULE_CHAT_PROVIDER','zai')
    monkeypatch.delenv('ZAI_API_KEY',raising=False)
    monkeypatch.setenv('AI_SCHEDULE_DATA_APPROVED','true')
    monkeypatch.setenv('SCHEDULE_CHAT_MODEL','glm-test')
    assert 'schedule_chat_ai_v1' not in client.get('/health').json()['capabilities']
    monkeypatch.setenv('ZAI_API_KEY','secret')
    assert 'schedule_chat_ai_v1' not in client.get('/health').json()['capabilities']
    monkeypatch.setenv('SCHEDULE_CHAT_AI_ENABLED','true')
    assert 'schedule_chat_ai_v1' in client.get('/health').json()['capabilities']


@pytest.mark.parametrize(('status','message'),[(401,'金鑰'),(403,'金鑰'),(429,'額度'),(400,'模型')])
def test_zai_errors_are_actionable_without_echoing_provider_body(monkeypatch,demo,status,message):
    monkeypatch.setenv('AI_SCHEDULE_DATA_APPROVED','true');monkeypatch.setenv('SCHEDULE_CHAT_PROVIDER','zai')
    monkeypatch.setenv('SCHEDULE_CHAT_AI_ENABLED','true')
    monkeypatch.setenv('ZAI_API_KEY','fake-zai-key');monkeypatch.setenv('SCHEDULE_CHAT_MODEL','glm-test')
    import app.chat as chat
    class Response:
        status_code=status
        def json(self):return {'error':{'message':'SENSITIVE-PROVIDER-BODY'}}
    class FakeClient:
        def __init__(self,**kw):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*args):pass
        async def post(self,*args,**kwargs):return Response()
    monkeypatch.setattr(chat.httpx,'AsyncClient',FakeClient)
    q=query(generate=True)
    with pytest.raises(ChatUnavailable,match=message) as exc:
        asyncio.run(respond(q,build_context(demo[0].model_dump(mode='json'),q)))
    assert 'SENSITIVE' not in str(exc.value) and 'fake-zai-key' not in str(exc.value)
