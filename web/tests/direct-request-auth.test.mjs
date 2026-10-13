import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {SupabaseStore} from '../src/store/supabase.js';

function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
const id='11111111-1111-4111-8111-111111111111';
const calls=[
  ['createLeaveRequest',s=>s.createLeaveRequest({id,employeeId:id,date:'2026-10-14',note:'Synthetic note'})],
  ['resolveLeaveRequest',s=>s.resolveLeaveRequest(id,'approved')],
  ['saveMemo',s=>s.saveMemo({id,text:'Synthetic memo',employeeId:id,pinned:true})],
];
function fixture({result={},status=200}={}){
  const waiting=deferred(),release=deferred(),requests=[];let pause=false;
  const client=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{
    accessToken:async()=>{if(pause){waiting.resolve();return release.promise;}return 'synthetic-token-A';},
    global:{fetch:async(url,options)=>{
      requests.push({method:options?.method||'GET',authorization:new Headers(options?.headers).get('Authorization'),body:options?.body});
      return new Response(JSON.stringify(result),{status,headers:{'Content-Type':'application/json'}});
    }},
  });
  const store=new SupabaseStore(client);store.session={user:{id:'A'},access_token:'synthetic-token-A'};store.userName='Synthetic A';
  return {store,waiting,release,requests,pause:()=>{pause=true;}};
}
for(const [name,invoke] of calls){
  test(`actual SDK ${name} cannot send an old operation with a switched-account token or accept its ACK`,async()=>{
    const f=fixture();f.pause();const result=invoke(f.store).then(value=>({value}),error=>({error}));await f.waiting.promise;
    f.store.session={user:{id:'B'},access_token:'synthetic-token-B'};f.store.authEpoch++;
    f.release.resolve('synthetic-token-B');const outcome=await result;
    assert.equal(f.requests.length,1);assert.equal(f.requests[0].authorization,'Bearer synthetic-token-A');
    assert.match(outcome.error?.message||'',/登入狀態已變更/);
  });
}
test('direct write rejects replaced client, logout or epoch change while token lookup is pending',async()=>{
  for(const change of ['client','logout','epoch'])for(const [,invoke] of calls){
    const f=fixture();f.pause();const result=invoke(f.store).then(value=>({value}),error=>({error}));await f.waiting.promise;
    if(change==='client')f.store.sb={};if(change==='logout')f.store.session=null;if(change==='epoch')f.store.authEpoch++;
    f.release.resolve(null);const outcome=await result;assert.match(outcome.error?.message||'',/登入狀態已變更/);
    assert.equal(f.requests[0].authorization,'Bearer synthetic-token-A');
  }
});
test('same-owner refresh is accepted; next direct write uses the fresh token without sharing mutated headers',async()=>{
  for(const [,invoke] of calls){
    const f=fixture();f.pause();const job=invoke(f.store);job.catch(()=>{});await f.waiting.promise;
    f.store.session={user:{id:'A'},access_token:'synthetic-token-refreshed'};f.release.resolve('synthetic-token-refreshed');
    await job;await invoke(f.store);
    assert.deepEqual(f.requests.map(r=>r.authorization),['Bearer synthetic-token-A','Bearer synthetic-token-refreshed']);
  }
});
test('missing token fails closed before direct write dispatch',async()=>{
  for(const [,invoke] of calls){
    const f=fixture();f.store.session={user:{id:'A'}};await assert.rejects(invoke(f.store),/登入狀態已變更/);assert.equal(f.requests.length,0);
  }
});
test('real SDK API failures remain failures, not confirmed memo/leave writes',async()=>{
  for(const [,invoke] of calls)for(const status of [401,403,500]){
    const f=fixture({result:{code:status===403?'42501':'SYNTHETIC_ERROR',message:'Synthetic denied'},status});
    await assert.rejects(invoke(f.store));assert.equal(f.requests.length,1);assert.equal(f.requests[0].authorization,'Bearer synthetic-token-A');
  }
});
