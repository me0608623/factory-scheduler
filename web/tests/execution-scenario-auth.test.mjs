import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {SupabaseStore} from '../src/store/supabase.js';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';
import {requestQuery} from './request-query.mjs';
import {makeScenario} from '../src/scenarios.js';
const id='11111111-1111-4111-8111-111111111111';
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function fixture(data={},status=200){
  const entered=deferred(),release=deferred(),requests=[];let pause=false;
  const client=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{accessToken:async()=>{
    if(pause){entered.resolve();return release.promise;}return 'synthetic-A';
  },global:{fetch:async(url,options)=>{requests.push({path:new URL(url).pathname,method:options?.method||'GET',header:new Headers(options?.headers).get('Authorization'),body:options?.body});
    return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  }}});
  const store=new SupabaseStore(client);store.session={user:{id:'A'},access_token:'synthetic-A'};store.userName='Original';
  return {store,entered,release,requests,pause:()=>{pause=true;},resume:()=>{pause=false;release.resolve('synthetic-B');}};
}
const actions=[
  ['listAccessAccounts',s=>s.listAccessAccounts(),[]],
  ['setAccessPermissions',s=>s.setAccessPermissions(id,{'notes.manage':true}),null],
  ['listScenarios',s=>s.listScenarios(),[]],
  ['getScenario',s=>s.getScenario(id),{id,payload:{}}],
  ['saveScenario',s=>s.saveScenario({id,name:'Synthetic scenario',payload:{}}),id],
  ['reportExecution',s=>s.reportExecution({id,blockId:id,action:'start',qtyDone:0,expectedRevision:0}),{blockId:id,employeeId:id,status:'running',qtyDone:0,revision:1,version:1,startedAt:'2026-10-13T08:00:00Z',finishedAt:null}],
  ['confirmExecution',s=>s.confirmExecution(id,true),{blockId:id,confirmed:true,version:1}],
];
test('actual SDK scenario save rejects missing or unrelated UUID acknowledgements',async()=>{
  for(const data of [null,{},[],false,'','22222222-2222-4222-8222-222222222222']){const f=fixture(data);f.resume();
    await assert.rejects(f.store.saveScenario({id,name:'Synthetic',payload:{}}),e=>e.unconfirmed===true);assert.equal(f.requests.length,1);}
  const f=fixture(id);f.resume();assert.equal(await f.store.saveScenario({id,name:'Synthetic',payload:{}}),id);
});
for(const [name,invoke,data] of actions)test(`actual SDK ${name} cannot use a switched account token or accept its result`,async()=>{
  const f=fixture(data);f.pause();const task=invoke(f.store).then(value=>({value}),error=>({error}));await f.entered.promise;
  f.store.session={user:{id:'B'},access_token:'synthetic-B'};f.store.authEpoch++;f.resume();const result=await task;
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].header,'Bearer synthetic-A');assert.ok(result.error);
});
test('same-owner token refresh is valid, and subsequent scenario/execution/access calls use their newly captured token',async()=>{
  for(const [,invoke,data] of actions){const f=fixture(data);f.pause();const task=invoke(f.store);task.catch(()=>{});await f.entered.promise;
    f.store.session={user:{id:'A'},access_token:'synthetic-fresh'};f.resume();await task;await invoke(f.store);
    assert.deepEqual(f.requests.map(r=>r.header),['Bearer synthetic-A','Bearer synthetic-fresh']);}
});
test('missing token fails before dispatch of all scenario/execution/access methods',async()=>{
  for(const [,invoke,data] of actions){const f=fixture(data);f.store.session={user:{id:'A'}};f.resume();
    await assert.rejects(invoke(f.store));assert.equal(f.requests.length,0);}
});
test('new client, logout and new login lifetime reject late execution/scenario/access results',async()=>{
  for(const [,invoke,data] of actions)for(const mode of ['client','logout','epoch']){const f=fixture(data);f.pause();const task=invoke(f.store).then(()=>null,e=>e);await f.entered.promise;
    if(mode==='client')f.store.sb={};if(mode==='logout')f.store.session=null;if(mode==='epoch')f.store.authEpoch++;
    f.resume();assert.ok(await task);assert.equal(f.requests[0].header,'Bearer synthetic-A');}
});
test('actual SDK scenario/execution/access HTTP errors remain failures; execution revision conflict remains distinguishable',async()=>{
  for(const [name,invoke] of actions)for(const status of [401,403,409,500]){const f=fixture({code:status===409?'40001':'SYNTHETIC_DENIED',message:'Synthetic denied'},status);f.resume();
    const error=await invoke(f.store).then(()=>null,e=>e);assert.ok(error,name+'/'+status);
    if(name==='reportExecution'&&status===409)assert.equal(error.conflict,true);assert.equal(f.requests[0].header,'Bearer synthetic-A');}
});
test('profile save rejects empty, malformed or mismatching receipts instead of inventing a confirmed display name',async()=>{
  for(const data of [null,undefined,{},[],false,'Synthetic',{displayName:''},{displayName:42},{displayName:'Different'}]){
    const f=fixture(data);f.resume();await assert.rejects(f.store.updateProfile({displayName:'Synthetic'}),e=>e.unconfirmed===true);
    assert.equal(f.store.userName,'Original');assert.equal(f.requests.length,1);
  }
  const f=fixture({displayName:'Synthetic'});f.resume();await f.store.updateProfile({displayName:' Synthetic '});assert.equal(f.store.userName,'Synthetic');
});
test('real migrated profile RPC with lost receipt stays unconfirmed until a fresh profile read, without resubmitting',async()=>{
  const db=await makeDb();try{
    await db.query("insert into auth.users(id,email) values($1,'synthetic@invalid')",[id]);
    const client=new FakeSupabase(db,{});client.uid=id;const store=new SupabaseStore(client);await store.init();const before=store.userName;
    const rpc=client.rpc.bind(client);let writes=0;client.rpc=(name,args)=>requestQuery(async()=>{const response=await rpc(name,args);if(name==='update_own_profile'){writes++;assert.equal(response.error,null);return {...response,data:null};}return response;});
    await assert.rejects(store.updateProfile({displayName:'Synthetic confirmed later'}),e=>e.unconfirmed===true);assert.equal(store.userName,before);assert.equal(writes,1);
    await store._profile();assert.equal(store.userName,'Synthetic confirmed later');assert.equal(writes,1);
    assert.equal((await db.query('select count(*)::int n from schedule_blocks')).rows[0].n,0);
  }finally{await db.close();}
});
test('real scenario RPC commits despite a lost receipt; same-id retry creates only one comparison and does not change schedule',async()=>{
  const db=await makeDb();try{
    await db.query("insert into auth.users(id,email) values($1,'synthetic-scenario@invalid')",[id]);
    await db.query("update profiles set role='boss' where user_id=$1",[id]);
    const client=new FakeSupabase(db,{});client.uid=id;const store=new SupabaseStore(client);await store.init();
    const state=await store.load(),item=makeScenario('Synthetic comparison',state,state),before=JSON.stringify(state);
    const rpc=client.rpc.bind(client);let drop=true,writes=0;client.rpc=(name,args)=>requestQuery(async()=>{const response=await rpc(name,args);
      if(name==='save_planning_scenario'){writes++;assert.equal(response.error,null);if(drop)return {...response,data:null};}return response;});
    await assert.rejects(store.saveScenario(item),e=>e.unconfirmed===true);assert.equal((await store.listScenarios()).length,1);
    drop=false;assert.equal(await store.saveScenario(item),item.id);assert.equal(writes,2);assert.equal((await store.listScenarios()).length,1);
    assert.equal(JSON.stringify(await store.load()),before);
  }finally{await db.close();}
});
