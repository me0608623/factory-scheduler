import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {SupabaseStore} from '../src/store/supabase.js';
import {fromSnapshot} from '../src/convert.js';
const id='11111111-1111-4111-8111-111111111111';
const base=()=>fromSnapshot({version:4,employees:[],machines:[],products:[],orders:[{id,code:'Synthetic',product:id,qty:100,due:'2030-01-01',priority:2}],blocks:[{id,order:id,step:0,machine:'a',employee:id,date:'2030-01-01',start:480,end:580,qty:100,pinned:false}],calendar:{}});
function fixture({data=id,status=200,transport=false}={}){
  const requests=[];let enter,release,pause=false;
  const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);
  const client=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{accessToken:async()=>{if(pause){enter();return wait;}return 'token-A';},global:{fetch:async(url,options)=>{
    requests.push({url:new URL(url).pathname,token:new Headers(options.headers).get('Authorization')});
    if(transport)throw new Error('Synthetic connection lost');
    return new Response(JSON.stringify(typeof data==='function'?data(requests.length):data),{status,headers:{'Content-Type':'application/json'}});
  }}});
  const store=new SupabaseStore(client);store.session={user:{id:'A'},access_token:'token-A'};
  const initial=base();store.acceptLoaded(initial);const next=structuredClone(initial);next.orders[0].qty=80;next.blocks[0].qty=80;
  return {store,next,requests,entered,pause(){pause=true;},resume(){release('token-B');}};
}
for(const [name,options,kind] of [
  ['missing RPC',{data:{code:'PGRST202',message:'missing'},status:404},'missing'],
  ['missing receipt',{data:null},'unconfirmed'],['malformed receipt',{data:{}},'unconfirmed'],
  ['transport loss',{transport:true},'unconfirmed'],
  ['5xx missing RPC',{data:{code:'PGRST202'},status:500},'unconfirmed'],
  ['5xx SQL error',{data:{code:'P0001'},status:500},'unconfirmed'],
  ['5xx conflict',{data:{code:'40001'},status:500},'unconfirmed'],
  ['known conflict',{data:{code:'40001'},status:409},'conflict'],
  ['known validation rejection',{data:{code:'P0001',message:'Rejected'},status:400},'rejected'],
])test(name+' leaves candidate and baseline untouched without fallback',async()=>{
  const f=fixture(options),before=f.store.base,candidate=JSON.stringify(f.next);
  await assert.rejects(f.store.sync(f.next),e=>kind==='missing'?/尚未支援/.test(e.message):kind==='rejected'?/Rejected/.test(e.message):!!e[kind]);
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'/rest/v1/rpc/save_orders_and_blocks');
  assert.equal(f.store.base,before);assert.equal(f.store.version,4);assert.equal(JSON.stringify(f.next),candidate);
});
for(const change of ['user','epoch','client'])test('actual SDK pins token and rejects old '+change+' acknowledgement',async()=>{
  const f=fixture(),before=f.store.base;f.pause();const job=f.store.sync(f.next).then(()=>null,e=>e);await f.entered;
  if(change==='user')f.store.session={user:{id:'B'},access_token:'token-B'};
  if(change==='epoch')f.store.authEpoch++;
  if(change==='client')f.store.sb={};
  f.resume();assert.ok((await job).unconfirmed);assert.equal(f.requests[0].token,'Bearer token-A');assert.equal(f.store.base,before);assert.equal(f.store.version,4);assert.equal(f.next.version,4);
});
test('confirmed response advances baseline and version exactly once',async()=>{
  const f=fixture();await f.store.sync(f.next);assert.equal(f.store.version,5);assert.equal(f.next.version,5);assert.equal(f.requests.length,1);
});
for(const [name,change] of [
  ['calendar / overtime',s=>{s.dayOT['2030-01-01']=1200;}],
  ['order delete',s=>{s.orders=[];}],
  ['catalog change',s=>{s.machines.push({id:'a',label:'Synthetic',proc:'裁切',factory:1,products:[],faults:[]});}],
])test(name+' mixed candidate rejects before any query',async()=>{
  const f=fixture();change(f.next);await assert.rejects(f.store.sync(f.next));assert.equal(f.requests.length,0);
});
test('missing credentials dispatches nothing',async()=>{
  const f=fixture();f.store.session={user:{id:'A'}};await assert.rejects(f.store.sync(f.next));assert.equal(f.requests.length,0);
});
test('uncertain save blocks blind retries, queued changes and snapshot acceptance does not clear the gate',async()=>{
  const f=fixture({data:null});await assert.rejects(f.store.sync(f.next),e=>e.unconfirmed);
  assert.equal(f.store.hasPendingConfirmations(),true);
  await assert.rejects(f.store.sync(f.next),e=>e.unconfirmed);
  f.store.acceptLoaded(base());const later=base();later.orders[0].qty=110;
  await assert.rejects(f.store.sync(later),e=>e.unconfirmed);assert.equal(f.requests.length,1);
});
test('known rejection clears the pending gate; confirmed write has no pending receipt',async()=>{
  const f=fixture({data:{code:'PGRST202'},status:404});await assert.rejects(f.store.sync(f.next));assert.equal(f.store.hasPendingConfirmations(),false);
  await assert.rejects(f.store.sync(f.next));assert.equal(f.requests.length,2);
  const success=fixture();await success.store.sync(success.next);assert.equal(success.store.hasPendingConfirmations(),false);
});

test('old-owner acknowledgement cannot clear a newer pending ledger',async()=>{
  const f=fixture({data:count=>count===1?id:null});f.pause();
  const old=f.store.sync(f.next).then(()=>null,e=>e);await f.entered;
  f.store.authEpoch++;
  const newer=f.store.sync(structuredClone(f.next)).then(()=>null,e=>e);
  assert.equal(f.store.hasPendingConfirmations(),true);f.resume();
  assert.ok((await old).unconfirmed);assert.equal(f.store.hasPendingConfirmations(),true);
  assert.ok((await newer).unconfirmed);assert.equal(f.store.hasPendingConfirmations(),true);
  await assert.rejects(f.store.sync(f.next),e=>e.unconfirmed);assert.equal(f.requests.length,2);assert.equal(f.store.version,4);
});
