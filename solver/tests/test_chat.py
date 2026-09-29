import asyncio
import json
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient
import app.main as api
from app.chat import ChatQuery, ChatUnavailable, build_context, respond


def query(**kw):
    return ChatQuery(question='目前排程有哪些問題？',date='2026-09-26',**kw)


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
    ctx=build_context(raw,query());assert ctx['truncated'] and len(ctx['facts'])==100
    raw['unused']='x'*3000001
    with pytest.raises(ValueError,match='容量'):build_context(raw,query())


def test_external_model_disabled_until_explicit_approval(monkeypatch,demo):
    monkeypatch.delenv('AI_SCHEDULE_DATA_APPROVED',raising=False)
    q=query(generate=True);ctx=build_context(demo[0].model_dump(mode='json'),q)
    with pytest.raises(ChatUnavailable,match='未外傳'):asyncio.run(respond(q,ctx))
    monkeypatch.setenv('AI_SCHEDULE_DATA_APPROVED','true');monkeypatch.delenv('OPENAI_API_KEY',raising=False)
    with pytest.raises(ChatUnavailable,match='金鑰'):asyncio.run(respond(q,ctx))


def test_db_authority_and_viewer_denied_before_read(monkeypatch,demo):
    raw=demo[0].model_dump(mode='json');calls=[]
    class Fake:
        configured=True
        async def role(self,jwt):return 'lead' if jwt=='lead' else 'viewer'
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
    monkeypatch.setenv('AI_SCHEDULE_DATA_APPROVED','true');monkeypatch.setenv('OPENAI_API_KEY','fake-test-key');monkeypatch.setenv('SCHEDULE_CHAT_MODEL','test-model')
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
