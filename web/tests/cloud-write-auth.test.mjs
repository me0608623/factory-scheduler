import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {SupabaseStore} from '../src/store/supabase.js';
import {fromSnapshot} from '../src/convert.js';
import {newRoster} from '../src/roster.js';
const receipt='11111111-1111-4111-8111-111111111111';
const base=()=>fromSnapshot({version:4,employees:[{id:receipt,name:'Synthetic',skills:[]}],machines:[],products:[],orders:[],blocks:[],calendar:{}});
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function fixture(response=receipt,initial=base(),status=200){
  const entered=deferred(),release=deferred(),requests=[];let pauseAt=0,lookup=0;
  const client=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{accessToken:async()=>{
    if(pauseAt&&++lookup===pauseAt){entered.resolve();return release.promise;}return 'synthetic-A';
  },global:{fetch:async(url,options)=>{requests.push({url:new URL(url).pathname,token:new Headers(options?.headers).get('Authorization'),body:options?.body});
    const data=typeof response==='function'?response(new URL(url),options):response;
    return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  }}});
  const store=new SupabaseStore(client);store.session={user:{id:'A'},access_token:'synthetic-A'};store.userName='Original A';store.acceptLoaded(initial);
  return {store,entered,release,requests,pause:(at=1)=>{pauseAt=at;lookup=0;},resume:()=>{pauseAt=0;release.resolve('synthetic-B');}};
}
const actions=[
  ['updateProfile',s=>s.updateProfile({displayName:'Synthetic new name'}),{displayName:'Synthetic new name'}],
  ['applyPlan',s=>s.applyPlan(receipt,'A'),receipt],
  ['sync/save_blocks',s=>{const next=base();next.blocks.push({id:receipt,oid:receipt,step:0,m:'synthetic-machine',emp:receipt,date:'2026-10-14',s:480,e:540,qty:1,pin:false});return s.sync(next);},receipt],
  ['sync/save_work_log',s=>{const next=base();next.workLog=[{id:receipt,code:'Synthetic'}];return s.sync(next);},5],
];
for(const [name,invoke,response] of actions)test(`actual SDK ${name} keeps the initiating token during session lookup and rejects old-owner ACK`,async()=>{
  const f=fixture(response),before=f.store.base;f.pause();const job=invoke(f.store).then(value=>({value}),error=>({error}));await f.entered.promise;
  f.store.session={user:{id:'B'},access_token:'synthetic-B'};f.store.authEpoch++;f.resume();const result=await job;
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].token,'Bearer synthetic-A',name);
  assert.ok(result.error);assert.equal(f.store.userName,'Original A');assert.equal(f.store.version,4);assert.equal(f.store.base,before);
});

test('actual SDK same-owner refresh keeps first query token; next request captures the refreshed token',async()=>{
  for(const [,invoke,response] of actions){const f=fixture(response);f.pause();const job=invoke(f.store);job.catch(()=>{});await f.entered.promise;
    f.store.session={user:{id:'A'},access_token:'synthetic-refreshed'};f.resume();await job;
    if(response===5)f.store.acceptLoaded(base());
    if(typeof response==='string'&&invoke===actions[2][1])f.store.acceptLoaded(base());
    await invoke(f.store);assert.deepEqual(f.requests.map(r=>r.token),['Bearer synthetic-A','Bearer synthetic-refreshed']);
  }
});

test('missing credentials never dispatch profile, plan or snapshot write requests',async()=>{
  for(const [,invoke,response] of actions){const f=fixture(response);f.store.session={user:{id:'A'}};f.resume();
    await assert.rejects(invoke(f.store));assert.equal(f.requests.length,0);}
});

test('a sync version check completed under another owner never continues to a catalog write',async()=>{
  const f=fixture({version:4}),next=base();next.employees[0].name='Synthetic changed';
  f.pause();const job=f.store.sync(next).then(()=>null,e=>e);await f.entered.promise;f.store.session={user:{id:'B'},access_token:'synthetic-B'};f.resume();
  assert.ok(await job);assert.equal(f.requests.length,1);assert.equal(f.requests[0].token,'Bearer synthetic-A');assert.equal(f.requests[0].url,'/rest/v1/schedule_state');
});

test('actual SDK all seven versioned sync branches bind the original account token and keep rejected baselines',async()=>{
  const work={id:receipt,name:'Synthetic manual work',factory:1,requiresResource:false,employeeIds:[receipt],resourceIds:[],reviewStatus:'confirmed'};
  const cases=[
    ['save_staff_rosters',s=>{s.staffRosters=[newRoster(s,{id:receipt,start:'2100-01-04'})];},s=>{s.staffRosters=[];}],
    ['save_transfer_orders',()=>{},s=>{s.transferOrders=[{id:receipt,code:'Synthetic',itemCode:'Synthetic',fromFactory:1,toFactory:2,returnFactory:1,totalQty:10,urgentQty:0,workIds:[],batches:[],events:[],status:'active',note:''}];}],
    ['save_rush_orders',s=>{s.rushOrders=[{id:receipt,f1:{desc:'Synthetic'},f2:{}}];},s=>{s.rushOrders=[];}],
    ['save_work_log',s=>{s.workLog=[{id:receipt,code:'Synthetic'}];},s=>{s.workLog=[];}],
    ['save_work_contents',s=>{s.workContents=[structuredClone(work)];},s=>{s.workContents=[];}],
    ['save_work_assignments',s=>{s.workContents=[structuredClone(work)];s.workAssignments=[{id:receipt,workId:receipt,emp:receipt,resourceId:null,date:'2100-01-04',s:480,e:540,qty:null,note:''}];},s=>{s.workAssignments=[];}],
    ['save_staff_groups',s=>{s.groups=[{id:receipt,name:'Synthetic group'}];},s=>{s.groups=[];}],
  ];
  for(const [name,init,change] of cases){const initial=base();init(initial);const f=fixture(5,initial),next=structuredClone(initial);change(next);const before=f.store.base;
    f.pause();const job=f.store.sync(next).then(()=>null,e=>e);await f.entered.promise;
    f.store.session={user:{id:'B'},access_token:'synthetic-B'};f.resume();assert.ok((await job)?.unconfirmed,name);
    assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'/rest/v1/rpc/'+name);assert.equal(f.requests[0].token,'Bearer synthetic-A');
    assert.equal(f.store.version,4);assert.equal(next.version,4);assert.equal(f.store.base,before);
  }
});

test('actual SDK catalog upsert/delete and audit requests cannot inherit a switched account token',async()=>{
  for(const mode of ['upsert','delete','log']){
    const f=fixture(url=>url.pathname.endsWith('schedule_state')?{version:4}:null),next=base(),before=f.store.base;
    if(mode==='upsert')next.employees[0].name='Synthetic changed';if(mode==='delete')next.employees=[];
    f.pause(mode==='log'?1:2);const job=f.store.sync(next,mode==='log'?{kind:'edit',title:'Synthetic audit'}:null).then(()=>null,e=>e);
    await f.entered.promise;f.store.session={user:{id:'B'},access_token:'synthetic-B'};f.resume();assert.ok((await job)?.unconfirmed,mode);
    assert.equal(f.requests.length,mode==='log'?1:2);assert.ok(f.requests.every(r=>r.token==='Bearer synthetic-A'));
    assert.equal(f.store.base,before);assert.equal(f.store.version,4);
  }
});

test('replaced client, logout and new login lifetime reject profile/plan/sync acknowledgments without changing baselines',async()=>{
  for(const [,invoke,response] of actions)for(const mode of ['client','logout','epoch']){
    const f=fixture(response),before=f.store.base;f.pause();const job=invoke(f.store).then(()=>null,e=>e);await f.entered.promise;
    if(mode==='client')f.store.sb={};if(mode==='logout')f.store.session=null;if(mode==='epoch')f.store.authEpoch++;
    f.resume();assert.ok(await job);assert.equal(f.requests.length,1);assert.equal(f.requests[0].token,'Bearer synthetic-A');
    assert.equal(f.store.version,4);assert.equal(f.store.base,before);assert.equal(f.store.userName,'Original A');
  }
});

test('real SDK HTTP denial/failure and 40001 conflicts retain existing failure semantics, never update accepted baselines',async()=>{
  for(const [name,invoke] of actions)for(const status of [401,403,409,500]){
    const f=fixture({code:status===409?'40001':'SYNTHETIC_DENIED',message:'Synthetic denied'},base(),status),before=f.store.base;
    f.resume();const error=await invoke(f.store).then(()=>null,e=>e);assert.ok(error,name+'/'+status);
    if(status===409&&name!=='updateProfile')assert.equal(error.conflict,true);
    assert.equal(f.requests.length,1);assert.equal(f.requests[0].token,'Bearer synthetic-A');
    assert.equal(f.store.version,4);assert.equal(f.store.base,before);assert.equal(f.store.userName,'Original A');
  }
});
