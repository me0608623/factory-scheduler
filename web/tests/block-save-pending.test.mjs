// A save_blocks result must be conclusive before any same-session sync can proceed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {SupabaseStore} from '../src/store/supabase.js';
import {fromSnapshot} from '../src/convert.js';
import {requestQuery} from './request-query.mjs';
import {pendingBlockStore} from './pending-block-store.mjs';
const id='11111111-1111-4111-8111-111111111111';
const base=()=>fromSnapshot({version:4,employees:[],machines:[],products:[],orders:[{id,code:'Synthetic',product:id,qty:100,due:'2030-01-01',priority:2}],blocks:[{id,order:id,step:0,machine:'a',employee:id,date:'2030-01-01',start:480,end:580,qty:100,pinned:false}],calendar:{}});
const uncertain=e=>e.unconfirmed===true&&/完整重新整理網頁/.test(e.message);
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function fixture(options={}){
  const requests=[],entered=deferred(),release=deferred();let pause=false;
  const client=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{accessToken:async()=>{if(pause){entered.resolve();await release.promise;}return 'synthetic-token';},global:{fetch:async(url,request)=>{
    requests.push({path:new URL(url).pathname,token:new Headers(request.headers).get('Authorization')});
    if(options.transport)throw new Error('Synthetic connection lost');
    const data='data' in options?options.data:id,status=options.status||200;
    return new Response(status===204?null:JSON.stringify(typeof data==='function'?data(requests.length):data),{status,headers:{'Content-Type':'application/json'}});
  }}});
  const store=new SupabaseStore(client);store.session={user:{id:'A'},access_token:'token-A'};
  const initial=base();store.acceptLoaded(initial);const next=structuredClone(initial);next.blocks[0].pin=true;
  return {store,initial,next,requests,entered:entered.promise,pause(){pause=true;},resume(){release.resolve();}};
}
const pgError=code=>({code,message:'Synthetic transaction rolled back',details:null,hint:null});
for(const [name,options] of [
  ['null receipt',{data:null}],['empty response',{status:204}],['object receipt',{data:{}}],['array receipt',{data:[]}],['invalid UUID',{data:'bad'}],
  ['fetch rejection',{transport:true}],['unknown 4xx',{status:400,data:{code:'SYNTHETIC',message:'unknown'}}],
  ['5xx validation',{status:500,data:pgError('P0001')}],['incomplete 5xx conflict',{status:500,data:{code:'40001'}}],
  ['5xx missing RPC',{status:503,data:{code:'PGRST202'}}],
  ...['40001','40P01'].flatMap(code=>[502,503].map(status=>[code+' gateway '+status,{status,data:pgError(code)}])),
  ...[{code:'40001',message:'rollback'}, {...pgError('40001'),message:''}, {...pgError('40001'),details:{}}, {...pgError('40P01'),hint:3}].map((data,i)=>['malformed rollback '+i,{status:500,data}]),
])test(name+' retains pending and prevents later sync requests',async()=>{
  const f=fixture(options),before=f.store.base;
  await assert.rejects(f.store.sync(f.next),uncertain);assert.equal(f.store.hasPendingConfirmations(),true);assert.match(f.store.pendingScheduleSaveMessage(),/完整重新整理網頁/);
  assert.equal(f.store.version,4);assert.equal(f.store.base,before);assert.equal(f.next.version,4);
  await assert.rejects(f.store.sync(f.initial),uncertain);await assert.rejects(f.store.sync(f.next),uncertain);
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].path,'/rest/v1/rpc/save_blocks');
});
test('direct result shape, transport rejection and non-2xx UUID cannot confirm persistence',async()=>{
  for(const result of [undefined,null,[],id,'throw',...['200',0,500,502,999,NaN,Infinity].map(status=>({data:id,error:null,status})),
    ...[false,0,''].map(error=>({data:id,error,status:200}))]){
    const f=fixture();let sends=0;f.store.sb.rpc=()=>requestQuery(()=>{sends++;if(result==='throw')throw new Error('Synthetic failure');return result;});
    await assert.rejects(f.store.sync(f.next),uncertain);await assert.rejects(f.store.sync(f.initial),uncertain);
    assert.equal(sends,1);assert.equal(f.store.hasPendingConfirmations(),true);assert.match(f.store.pendingScheduleSaveMessage(),/完整重新整理網頁/);assert.equal(f.store.version,4);
  }
});
for(const [name,status,code] of [['conflict',409,'40001'],['PostgREST conflict',500,'40001'],['PostgREST deadlock',500,'40P01'],['validation',400,'P0001'],['permission',403,'42501'],['constraint',409,'23514'],['missing RPC',404,'PGRST202']])
test('known '+name+' rejection clears its attempted write and permits retry',async()=>{
  const f=fixture({status,data:pgError(code)});
  await assert.rejects(f.store.sync(f.next),e=>code==='40001'?e.conflict:!e.unconfirmed);
  assert.equal(f.store.hasPendingConfirmations(),false);assert.equal(f.store.pendingScheduleSaveMessage(),'');await assert.rejects(f.store.sync(f.next));assert.equal(f.requests.length,2);
});
test('valid UUID in 200/201 clears pending; ordinary no-op and later edits keep working',async()=>{
  for(const status of [200,201]){
    const f=fixture({status});await f.store.sync(f.next);assert.equal(f.store.hasPendingConfirmations(),false);assert.equal(f.store.version,5);
    await f.store.sync(f.next);assert.equal(f.requests.length,1);f.next.blocks[0].pin=false;await f.store.sync(f.next);assert.equal(f.requests.length,2);assert.equal(f.store.version,6);
  }
});
test('gate precedes validation, early-return domains, catalog, blocks and log-only/no-op',async()=>{
  const f=fixture({data:null});await assert.rejects(f.store.sync(f.next),uncertain);const remembered=f.store.base;
  for(const [name,change] of [
    ['rosters',s=>s.staffRosters=[{}]],['transfers',s=>s.transferOrders=[{}]],['rush',s=>s.rushOrders=[{}]],['work log',s=>s.workLog=[{}]],
    ['work contents',s=>s.workContents=[{}]],['assignments',s=>s.workAssignments=[{}]],['groups',s=>s.groups=[{id:'group',name:'Synthetic'}]],
    ['catalog upsert',s=>s.employees.push({id:'new',name:'Synthetic'})],['catalog delete',s=>s.orders=[]],['blocks',s=>s.blocks=[]],['no-op',()=>{}],
  ]){
    const candidate=structuredClone(f.initial);change(candidate);await assert.rejects(f.store.sync(candidate,{kind:'edit',title:name}),uncertain,name);
    assert.equal(f.store.base,remembered,name);assert.equal(f.store.version,4,name);assert.equal(f.requests.length,1,name);
  }
});
test('accepting old, committed or newer snapshots and token refresh never clears pending',async()=>{
  const f=fixture({data:null});await assert.rejects(f.store.sync(f.next),uncertain);
  for(const [version,pin] of [[4,false],[5,true],[9,false]]){
    const loaded=base();loaded.version=version;loaded.blocks[0].pin=pin;f.store.acceptLoaded(loaded);const remembered=f.store.base;
    f.store.session={user:{id:'A'},access_token:'refreshed-A'};
    await assert.rejects(f.store.sync(loaded),uncertain);assert.equal(f.store.hasPendingConfirmations(),true);assert.equal(f.store.base,remembered);assert.equal(f.store.version,version);
  }
  assert.equal(f.requests.length,1);
});
test('missing identity/token, authorization failure and invalid input never set pending or dispatch',async()=>{
  for(const mode of ['user','token','authorize','validation']){
    const f=fixture();if(mode==='user')f.store.session=null;if(mode==='token')delete f.store.session.access_token;
    if(mode==='authorize')f.store.sb.rpc=()=>({setHeader(){throw new Error('Synthetic authorize failed');}});
    if(mode==='validation')f.next.staffRosters=[{}];
    await assert.rejects(f.store.sync(f.next));assert.equal(f.store.hasPendingConfirmations(),false,mode);assert.equal(f.requests.length,0,mode);
  }
});
test('in-flight SDK request gates parallel sync before token resolution; refresh is same-owner',async()=>{
  const f=fixture();f.pause();const job=f.store.sync(f.next);await f.entered;
  assert.equal(f.store.hasPendingConfirmations(),true);assert.equal(f.store.pendingScheduleSaveMessage(),'','healthy in-flight writes must not instruct a page reload');
  await assert.rejects(f.store.sync(f.initial),e=>e.unconfirmed&&e.message==='操作儲存中，請稍候。');
  assert.equal(f.store.pendingScheduleSaveMessage(),'','blocking a parallel sync does not make the original request uncertain');
  f.store.session={user:{id:'A'},access_token:'refreshed-A'};f.resume();await job;
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].token,'Bearer token-A');assert.equal(f.store.version,5);assert.equal(f.store.hasPendingConfirmations(),false);assert.equal(f.store.pendingScheduleSaveMessage(),'');
});
for(const mode of ['user','epoch','client'])for(const oldResult of ['success','rejection'])
test('late old '+mode+' '+oldResult+' cannot clear new ledger or baseline',async()=>{
  const f=fixture(),ready=deferred(),release=deferred();let first=true;
  f.store.sb.rpc=()=>requestQuery(async()=>{if(first){first=false;ready.resolve();await release.promise;return oldResult==='success'?{data:id,error:null}:{data:null,error:pgError('P0001'),status:400};}return {data:null,error:null};});
  const old=f.store.sync(f.next).catch(e=>e);await ready.promise;
  if(mode==='user')f.store.session={user:{id:'B'},access_token:'token-B'};
  if(mode==='epoch')f.store.authEpoch++;
  if(mode==='client')f.store.sb={rpc:()=>requestQuery(()=>({data:null,error:null}))};
  assert.equal(f.store.hasPendingConfirmations(),false);await assert.rejects(f.store.sync(structuredClone(f.next)),uncertain);
  const remembered=f.store.base;release.resolve();assert.equal((await old).unconfirmed,true);
  assert.equal(f.store.hasPendingConfirmations(),true);assert.equal(f.store.base,remembered);assert.equal(f.store.version,4);await assert.rejects(f.store.sync(f.initial),uncertain);
});
test('completion confirmation map and save_blocks gate remain independent',async()=>{
  const f=fixture({data:null});await assert.rejects(f.store.confirmExecution(id,true),e=>e.unconfirmed);
  assert.equal(f.store.hasPendingConfirmation(id),true);await assert.rejects(f.store.sync(f.next),uncertain);
  assert.equal(f.store.hasPendingConfirmation(id),true);assert.equal(f.store.hasPendingConfirmations(),true);
});

test('narrow recovery getter only reports current-session save_blocks uncertainty',async()=>{
  const plain=await pendingBlockStore({pending:false});assert.equal(plain.store.pendingScheduleSaveMessage(),'');
  const confirmation=await pendingBlockStore({confirmationOnly:true});assert.equal(confirmation.store.hasPendingConfirmations(),true);assert.equal(confirmation.store.pendingScheduleSaveMessage(),'');
  const f=await pendingBlockStore(),message=f.store.pendingScheduleSaveMessage();assert.match(message,/完整重新整理網頁/);
  f.store.acceptLoaded(f.initial);assert.equal(f.store.pendingScheduleSaveMessage(),message);
  f.store.session={user:{id:'Synthetic'},access_token:'refreshed'};assert.equal(f.store.pendingScheduleSaveMessage(),message);
  f.store.authEpoch++;assert.equal(f.store.pendingScheduleSaveMessage(),'');
});
