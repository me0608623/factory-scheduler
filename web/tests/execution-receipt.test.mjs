import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {SupabaseStore} from '../src/store/supabase.js';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';
import {requestQuery} from './request-query.mjs';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {executionOf} from '../src/execution.js';
import {ExecutionRetries} from '../src/execution-retries.js';
const block='abcdefab-1111-4111-8111-111111111111',employee='22222222-2222-4222-8222-222222222222';
const request={id:'33333333-3333-4333-8333-333333333333',blockId:block,action:'start',qtyDone:0,expectedRevision:0};
const receipt={blockId:block,employeeId:employee,status:'running',qtyDone:0,revision:1,version:1,startedAt:'2026-10-13T08:00:00+00:00',finishedAt:null};
function fixture(data){
  const requests=[];const client=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{accessToken:async()=> 'synthetic-A',
    global:{fetch:async(url,options)=>{requests.push({path:new URL(url).pathname,body:JSON.parse(options.body),header:new Headers(options.headers).get('Authorization')});return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});}}});
  const store=new SupabaseStore(client);store.session={user:{id:'A'},access_token:'synthetic-A'};store.version=77;return {store,requests};
}
test('actual SDK report rejects absent or malformed receipt, without accepting a new baseline',async()=>{
  for(const data of [null,{},[],false,'ok',{...receipt,blockId:employee},{...receipt,employeeId:null},{...receipt,status:'done'},
    {...receipt,qtyDone:1},{...receipt,qtyDone:'0'},{...receipt,revision:2},{...receipt,revision:'1'},{...receipt,version:0},{...receipt,version:'1'},
    {...receipt,version:Number.MAX_SAFE_INTEGER+1},{...receipt,startedAt:null},{...receipt,startedAt:'bad date'},{...receipt,finishedAt:receipt.startedAt}]){
    const f=fixture(data);await assert.rejects(f.store.reportExecution(request),e=>e.unconfirmed===true&&!e.rejected&&!e.conflict);
    assert.equal(f.requests.length,1);assert.equal(f.requests[0].header,'Bearer synthetic-A');assert.equal(f.store.version,77);assert.equal(f.store.base,null);
  }
});
test('actual SDK validates cumulative, finish timing and expected revision against the dispatched request',async()=>{
  const finish={...request,action:'finish',qtyDone:25,expectedRevision:2};
  const done={...receipt,status:'done',qtyDone:25,revision:3,version:9,finishedAt:'2026-10-13T09:00:00Z'};
  for(const data of [{...done,status:'running'},{...done,qtyDone:24},{...done,revision:2},{...done,finishedAt:null},
    {...done,finishedAt:'invalid'},{...done,finishedAt:'2026-10-13T07:59:59Z'}]){
    await assert.rejects(fixture(data).store.reportExecution(finish),e=>e.unconfirmed===true);
  }
  assert.deepEqual(await fixture(done).store.reportExecution(finish),done);
  const quantity={...request,action:'quantity',qtyDone:25,expectedRevision:1};
  assert.deepEqual(await fixture({...receipt,qtyDone:25,revision:2}).store.reportExecution(quantity),{...receipt,qtyDone:25,revision:2});
});
test('valid replay receipt can have an older snapshot version, including canonical lowercase UUIDs',async()=>{
  const f=fixture(receipt);assert.deepEqual(await f.store.reportExecution({...request,blockId:block.toUpperCase()}),receipt);assert.equal(f.store.version,77);
});
test('actual SDK complete confirmation receipt is required; opposite flag, block or missing version stay unconfirmed',async()=>{
  const good={blockId:block,confirmed:true,version:4};
  for(const data of [null,{},[],false,'ok',{...good,blockId:employee},{...good,confirmed:false},{...good,confirmed:'true'},{...good,version:0},{...good,version:'4'}]){
    const f=fixture(data);await assert.rejects(f.store.confirmExecution(block,true),e=>e.unconfirmed===true);assert.equal(f.store.version,77);
  }
  assert.deepEqual(await fixture(good).store.confirmExecution(block,true),good);
  const off={...good,confirmed:false};assert.deepEqual(await fixture(off).store.confirmExecution(block,false),off);
});

test('actual SDK confirmation distinguishes known SQL rejections from unknown gateway outcomes',async()=>{
  for(const [code,status,known] of [['42501',403,true],['P0001',400,true],['P0002',400,true],['42501',503,false],['P0001',502,false],['P0002',504,false],['UNKNOWN',500,false],['',503,false],['PGRST202',404,true],['PGRST202',503,false]]){
    let calls=0;const client=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{accessToken:async()=> 'synthetic',global:{fetch:async()=>{
      calls++;return new Response(JSON.stringify({code,message:'Synthetic confirmation failure'}),{status,headers:{'Content-Type':'application/json'}});
    }}});
    const store=new SupabaseStore(client);store.session={user:{id:'A'},access_token:'synthetic'};store.version=77;
    await assert.rejects(store.confirmExecution(block,true),e=>known?e.rejected===true&&!e.unconfirmed:e.unconfirmed===true&&!e.rejected,code+'/'+status);
    assert.equal(calls,1);assert.equal(store.version,77);assert.equal(store.base,null);
  }
});

test('real committed confirmation hidden by HTTP503 is not labelled unsaved by actual SDK and app handler',async()=>{
  const db=await makeDb();try{
    const actor='44444444-4444-4444-8444-444444444444';await db.query("insert into auth.users(id,email) values($1,'synthetic-confirm@invalid')",[actor]);await db.query("update profiles set role='boss' where user_id=$1",[actor]);
    const e=(await db.query("select id from employees where name='張三'")).rows[0].id,order=(await db.query("select id from orders where code='A01'")).rows[0].id;
    await db.query("insert into schedule_blocks(id,order_id,step_seq,machine_id,employee_id,date,start_min,end_min,qty) values($1,$2,0,'a',$3,'2000-01-01',480,540,60)",[block,order,e]);
    const fake=new FakeSupabase(db,{});fake.uid=actor;const reader=new SupabaseStore(fake);await reader.init();await reader.reportExecution(request);
    await reader.reportExecution({...request,id:crypto.randomUUID(),action:'finish',qtyDone:40,expectedRevision:1});const state=await reader.load();
    let calls=0;const events=[];const sdk=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{accessToken:async()=> 'synthetic',global:{fetch:async(url,options)=>{
      assert.equal(new URL(url).pathname,'/rest/v1/rpc/confirm_work_execution');calls++;
      const result=await fake.rpc('confirm_work_execution',JSON.parse(options.body));assert.equal(result.error,null);assert.equal(result.data.confirmed,true);
      return new Response(JSON.stringify({code:'SYNTHETIC_GATEWAY',message:'Synthetic unavailable'}),{status:503,headers:{'Content-Type':'application/json'}});
    }}});
    const store=new SupabaseStore(sdk);store.session={user:{id:actor},access_token:'synthetic'};
    const ctx={S:state,UI:{date:'2000-01-01',factory:1,page:'schedule',drawer:null,modal:{t:'execution'}},PV:null,STORE:store,SYNC:{state:'ok'},syncChain:Promise.resolve(),canPermission:()=>true,
      toast:x=>events.push(x),tx:x=>x,DB_MIGRATION_PENDING:/missing migration/,renderModal:()=>{},maybeReload:()=>{},reloadFromStore:()=>{throw new Error('No automatic reread or resend');}};
    const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');vm.createContext(ctx);
    let at=source.indexOf('function directWriteOwner(');vm.runInContext(source.slice(at,source.indexOf('async function runDrawerWrite(',at)),ctx);
    at=source.indexOf('async function changeExecutionConfirmation(');vm.runInContext(source.slice(at,source.indexOf("MODALS['scenario-list']",at)),ctx);
    await ctx.changeExecutionConfirmation({disabled:false,dataset:{id:block}},true);
    assert.equal(calls,1);assert.match(ctx.UI.modal.confirmError,/待核對/);assert.doesNotMatch(ctx.UI.modal.confirmError,/沒存到/);assert.match(events[0],/不要重複送出/);
    assert.equal(ctx.S.execution[0].confirmed,false);const persisted=await reader.load();assert.equal(persisted.execution[0].confirmed,true);assert.equal(persisted.version,3);
    assert.equal((await db.query('select count(*)::int n from work_execution_events')).rows[0].n,2);
    const planned=(await db.query('select start_min,end_min,qty from schedule_blocks where id=$1',[block])).rows[0];assert.deepEqual(planned,{start_min:480,end_min:540,qty:60});
    // The uncertain SDK cannot resend, even after closing/reopening or reading.
    ctx.UI.modal={t:'execution'};ctx.S=persisted;
    await ctx.changeExecutionConfirmation({disabled:false,dataset:{id:block}},true);
    await ctx.changeExecutionConfirmation({disabled:false,dataset:{id:block}},false);
    assert.equal(calls,1);assert.equal((await reader.load()).version,3);
    // Characterize the unmodified SQL contract separately: another client is
    // not protected by this page ledger. Server idempotency is still missing.
    await reader.confirmExecution(block,true);assert.equal((await reader.load()).version,4);
    assert.equal((await db.query("select count(*)::int n from change_sets where title='確認完工'")).rows[0].n,2);
  }finally{await db.close();}
});
test('real committed confirmation late ACK defers its actual protected reread until a newer draft closes',async()=>{
  const db=await makeDb();try{
    const actor='44444444-4444-4444-8444-444444444444';await db.query("insert into auth.users(id,email) values($1,'synthetic-late-confirm@invalid')",[actor]);await db.query("update profiles set role='boss' where user_id=$1",[actor]);
    const e=(await db.query("select id from employees where name='張三'")).rows[0].id,order=(await db.query("select id from orders where code='A01'")).rows[0].id;
    await db.query("insert into schedule_blocks(id,order_id,step_seq,machine_id,employee_id,date,start_min,end_min,qty) values($1,$2,0,'a',$3,'2000-01-01',480,540,60)",[block,order,e]);
    const fake=new FakeSupabase(db,{});fake.uid=actor;const reader=new SupabaseStore(fake);await reader.init();await reader.reportExecution(request);
    await reader.reportExecution({...request,id:crypto.randomUUID(),action:'finish',qtyDone:40,expectedRevision:1});const state=await reader.load();
    let release,started,calls=0,loads=0;const gate=new Promise(r=>release=r),ready=new Promise(r=>started=r),timers=[],events=[];
    const sdk=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{accessToken:async()=> 'synthetic',global:{fetch:async(url,options)=>{
      assert.equal(new URL(url).pathname,'/rest/v1/rpc/confirm_work_execution');calls++;
      const result=await fake.rpc('confirm_work_execution',JSON.parse(options.body));assert.equal(result.error,null);started();await gate;
      return new Response(JSON.stringify(result.data),{headers:{'Content-Type':'application/json'}});
    }}});
    const store=new SupabaseStore(sdk);store.session={user:{id:actor},access_token:'synthetic'};
    store.load=async options=>{assert.equal(options.remember,false);loads++;return reader.load({remember:false});};
    const ctx={S:state,UI:{date:'2000-01-01',factory:1,page:'schedule',drawer:null,modal:{t:'execution'},prefs:{}},PV:null,drag:null,generalDrag:null,STORE:store,SYNC:{state:'ok'},syncChain:Promise.resolve(),syncPending:0,
      lastLocalWrite:0,pendingReload:false,reloadTimer:null,remoteLoading:false,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},normalizeState:()=>{},render:()=>{},
      notificationEnabled:()=>false,showDeviceNotification:()=>{},canPermission:()=>true,toast:x=>events.push(x),tx:x=>x,DB_MIGRATION_PENDING:/missing migration/,renderModal:()=>{},closeModal:()=>{ctx.UI.modal=null;}};
    const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');vm.createContext(ctx);
    let at=source.indexOf('function directWriteOwner(');vm.runInContext(source.slice(at,source.indexOf('async function runDrawerWrite(',at)),ctx);
    at=source.indexOf('async function reloadFromStore(');vm.runInContext(source.slice(at,source.indexOf('// ---------- 帳號與連線',at)),ctx);
    at=source.indexOf('async function changeExecutionConfirmation(');vm.runInContext(source.slice(at,source.indexOf("MODALS['scenario-list']",at)),ctx);
    const running=ctx.changeExecutionConfirmation({disabled:false,dataset:{id:block}},true);await ready;
    const draft={t:'new-draft',name:'synthetic unsaved'};ctx.UI.modal=draft;release();await running;
    assert.equal(ctx.UI.modal,draft);assert.equal(ctx.S,state);assert.equal(ctx.S.execution[0].confirmed,false);assert.equal(loads,0);assert.equal(timers.length,0);
    assert.equal(ctx.pendingReload,true);assert.equal(store.hasPendingConfirmation(block),false,'valid ACK is conclusive');
    ctx.closeModal();ctx.maybeReload();assert.equal(timers.length,1);await timers.shift()();
    assert.equal(loads,1);assert.equal(ctx.S.execution[0].confirmed,true);assert.equal(ctx.S.version,3);assert.equal(store.version,3);assert.equal(ctx.UI.modal,null);
    assert.equal(calls,1);assert.equal(events.length,0);assert.equal((await db.query("select count(*)::int n from change_sets where title='確認完工'")).rows[0].n,1);
    const planned=(await db.query('select start_min,end_min,qty from schedule_blocks where id=$1',[block])).rows[0];assert.deepEqual(planned,{start_min:480,end_min:540,qty:60});
  }finally{await db.close();}
});

test('real committed report late ACK reconciles once after a new draft closes, without a second report or event',async()=>{
  const db=await makeDb();try{
    const actor='44444444-4444-4444-8444-444444444444';await db.query("insert into auth.users(id,email) values($1,'synthetic-late-report@invalid')",[actor]);await db.query("update profiles set role='boss' where user_id=$1",[actor]);
    const e=(await db.query("select id from employees where name='張三'")).rows[0].id,order=(await db.query("select id from orders where code='A01'")).rows[0].id;
    await db.query("insert into schedule_blocks(id,order_id,step_seq,machine_id,employee_id,date,start_min,end_min,qty) values($1,$2,0,'a',$3,'2000-01-01',480,540,60)",[block,order,e]);
    const fake=new FakeSupabase(db,{});fake.uid=actor;const reader=new SupabaseStore(fake);await reader.init();const state=await reader.load();
    let release,started,calls=0,loads=0;const gate=new Promise(r=>release=r),ready=new Promise(r=>started=r),timers=[],events=[];
    const sdk=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{accessToken:async()=> 'synthetic',global:{fetch:async(url,options)=>{
      assert.equal(new URL(url).pathname,'/rest/v1/rpc/report_work_execution');calls++;
      const result=await fake.rpc('report_work_execution',JSON.parse(options.body));assert.equal(result.error,null);started();await gate;
      return new Response(JSON.stringify(result.data),{headers:{'Content-Type':'application/json'}});
    }}});
    const store=new SupabaseStore(sdk);store.session={user:{id:actor},access_token:'synthetic'};
    store.load=async options=>{assert.equal(options.remember,false);loads++;return reader.load({remember:false});};
    const ctx={S:state,UI:{date:'2000-01-01',factory:1,page:'schedule',drawer:null,modal:{t:'execution-report',id:block},prefs:{}},PV:null,drag:null,generalDrag:null,STORE:store,SYNC:{state:'ok'},syncChain:Promise.resolve(),syncPending:0,
      lastLocalWrite:0,pendingReload:false,reloadTimer:null,remoteLoading:false,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},normalizeState:()=>{},render:()=>{},
      notificationEnabled:()=>false,showDeviceNotification:()=>{},canReport:()=>true,reportingRole:()=> 'boss',executionOf,executionRetries:new ExecutionRetries(),undoStack:['keep'],uid:()=>request.id,$:()=>({value:'0'}),
      toast:x=>events.push(x),tx:x=>x,renderModal:()=>{},closeModal:()=>{ctx.UI.modal=null;}};
    const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');vm.createContext(ctx);
    let at=source.indexOf('function directWriteOwner(');vm.runInContext(source.slice(at,source.indexOf('async function runDrawerWrite(',at)),ctx);
    at=source.indexOf('async function reloadFromStore(');vm.runInContext(source.slice(at,source.indexOf('// ---------- 帳號與連線',at)),ctx);
    at=source.indexOf('async function reportWork(');vm.runInContext(source.slice(at,source.indexOf('// ---------- 工作內容',at)),ctx);
    const running=ctx.reportWork({disabled:false,dataset:{v:'start'}});await ready;
    const draft={t:'new-draft',name:'synthetic unsaved'};ctx.UI.modal=draft;ctx.undoStack=['new-draft'];release();await running;
    assert.equal(ctx.UI.modal,draft);assert.equal(ctx.S,state);assert.equal(ctx.S.execution.length,0);assert.equal(loads,0);assert.equal(timers.length,0);
    assert.equal(ctx.pendingReload,true);assert.equal(ctx.executionRetries.has(store),false,'valid receipt clears the dispatched retry');
    ctx.closeModal();ctx.maybeReload();assert.equal(timers.length,1);await timers.shift()();
    assert.equal(loads,1);assert.equal(ctx.S.execution[0].status,'running');assert.equal(ctx.S.execution[0].revision,1);assert.equal(ctx.S.version,1);assert.equal(store.version,1);assert.equal(ctx.UI.modal,null);
    assert.equal(calls,1);assert.equal(events.length,0);assert.equal(ctx.undoStack[0],'new-draft');assert.equal((await db.query('select count(*)::int n from work_execution_events')).rows[0].n,1);
    const planned=(await db.query('select start_min,end_min,qty from schedule_blocks where id=$1',[block])).rows[0];assert.deepEqual(planned,{start_min:480,end_min:540,qty:60});
  }finally{await db.close();}
});

test('real migrated report lost ACK stays uncertain, then same-ID retry returns one event without a second version bump',async()=>{
  const db=await makeDb();try{
    const actor='44444444-4444-4444-8444-444444444444';await db.query("insert into auth.users(id,email) values($1,'synthetic@invalid')",[actor]);await db.query("update profiles set role='boss' where user_id=$1",[actor]);
    const e=(await db.query("select id from employees where name='張三'")).rows[0].id,order=(await db.query("select id from orders where code='A01'")).rows[0].id;
    await db.query("insert into schedule_blocks(id,order_id,step_seq,machine_id,employee_id,date,start_min,end_min,qty) values($1,$2,0,'a',$3,'2000-01-01',480,540,60)",[block,order,e]);
    const client=new FakeSupabase(db,{});client.uid=actor;const store=new SupabaseStore(client);await store.init();await store.load();
    const rpc=client.rpc.bind(client);let lose=true;client.rpc=(name,args)=>requestQuery(async()=>{const response=await rpc(name,args);if(name==='report_work_execution'&&lose){lose=false;assert.equal(response.error,null);return {...response,data:null};}return response;});
    await assert.rejects(store.reportExecution(request),err=>err.unconfirmed===true);let result=await store.reportExecution(request);
    assert.equal(result.revision,1);assert.equal(result.version,1);assert.equal(result.employeeId,e);
    assert.equal((await db.query('select count(*)::int n from work_execution_events')).rows[0].n,1);assert.equal((await db.query('select version from schedule_state')).rows[0].version,1);
    const finish={...request,id:'55555555-5555-4555-8555-555555555555',action:'finish',qtyDone:40,expectedRevision:1};result=await store.reportExecution(finish);assert.equal(result.status,'done');assert.equal(result.revision,2);
    let loseConfirm=true;client.rpc=(name,args)=>requestQuery(async()=>{const response=await rpc(name,args);if(name==='confirm_work_execution'&&loseConfirm){loseConfirm=false;assert.equal(response.error,null);return {...response,data:null};}return response;});
    await assert.rejects(store.confirmExecution(block,true),err=>err.unconfirmed===true);const after=await store.load();assert.equal(after.execution[0].confirmed,true);assert.equal(after.version,3);
    assert.equal((await db.query('select count(*)::int n from change_sets')).rows[0].n,3);
    const planned=(await db.query('select start_min,end_min,qty from schedule_blocks where id=$1',[block])).rows[0];assert.deepEqual(planned,{start_min:480,end_min:540,qty:60});
  }finally{await db.close();}
});
test('actual SDK distinguishes known transaction rejections from unknown gateway or server codes',async()=>{
  for(const code of ['SYNTHETIC_GATEWAY_UNKNOWN','XX000','PGRST000','',null,'P0001','42501']){
    const client=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{accessToken:async()=> 'synthetic',global:{fetch:async()=>new Response(JSON.stringify({code,message:'Synthetic uncertain response'}),{status:503,headers:{'Content-Type':'application/json'}})}});
    const store=new SupabaseStore(client);store.session={user:{id:'A'},access_token:'synthetic'};
    await assert.rejects(store.reportExecution(request),e=>e.unconfirmed===true&&!e.rejected&&!e.conflict,code||'no code');
  }
  for(const code of ['42501','P0001','40001']){
    const client=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{accessToken:async()=> 'synthetic',global:{fetch:async()=>new Response(JSON.stringify({code,message:'Synthetic rejection'}),{status:400,headers:{'Content-Type':'application/json'}})}});
    const store=new SupabaseStore(client);store.session={user:{id:'A'},access_token:'synthetic'};
    await assert.rejects(store.reportExecution(request),e=>code==='40001'?e.conflict===true:e.rejected===true&&!e.unconfirmed);
  }
});
test('actual SDK keeps 40001 with noncanonical gateway statuses uncertain, but preserves canonical HTTP 500 rollback conflicts',async()=>{
  for(const status of [502,503,504,400,409,500]){
    const sdk=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{accessToken:async()=> 'synthetic',global:{fetch:async()=>new Response(JSON.stringify({code:'40001',message:'Synthetic response'}),{status,headers:{'Content-Type':'application/json'}})}});
    const store=new SupabaseStore(sdk);store.session={user:{id:'A'},access_token:'synthetic'};
    await assert.rejects(store.reportExecution(request),e=>status>=502?e.unconfirmed===true&&!e.conflict:e.conflict===true&&!e.unconfirmed,'HTTP '+status);
  }
});
for(const gatewayCode of ['SYNTHETIC_GATEWAY_UNKNOWN','40001','PT409'])test('real committed report hidden by gateway '+gatewayCode+' keeps its UI request ID, and an explicit retry creates only one event',async()=>{
  const db=await makeDb();try{
    const actor='44444444-4444-4444-8444-444444444444';await db.query("insert into auth.users(id,email) values($1,'synthetic-retry@invalid')",[actor]);await db.query("update profiles set role='boss' where user_id=$1",[actor]);
    const e=(await db.query("select id from employees where name='張三'")).rows[0].id,order=(await db.query("select id from orders where code='A01'")).rows[0].id;
    await db.query("insert into schedule_blocks(id,order_id,step_seq,machine_id,employee_id,date,start_min,end_min,qty) values($1,$2,0,'a',$3,'2000-01-01',480,540,60)",[block,order,e]);
    const fake=new FakeSupabase(db,{});fake.uid=actor;const reader=new SupabaseStore(fake);await reader.init();const state=await reader.load();
    let obscure=true;const writes=[];
    const sdk=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{accessToken:async()=> 'synthetic',global:{fetch:async(url,options)=>{
      assert.equal(new URL(url).pathname,'/rest/v1/rpc/report_work_execution');const args=JSON.parse(options.body);writes.push(args.p_request);
      const result=await fake.rpc('report_work_execution',args);
      // Match PostgREST's documented 40* -> 500 for an actual SQL rollback.
      if(result.error)return new Response(JSON.stringify(result.error),{status:result.error.code==='40001'?500:400,headers:{'Content-Type':'application/json'}});
      return obscure?new Response(JSON.stringify({code:gatewayCode,message:'Synthetic uncertain response'}),{status:503,headers:{'Content-Type':'application/json'}}):new Response(JSON.stringify(result.data),{headers:{'Content-Type':'application/json'}});
    }}});
    const store=new SupabaseStore(sdk);store.session={user:{id:actor},access_token:'synthetic'};store.role='boss';
    const ctx={S:state,UI:{date:'2000-01-01',factory:1,page:'schedule',drawer:null,modal:{t:'execution-report',id:block}},PV:null,STORE:store,SYNC:{state:'ok'},syncChain:Promise.resolve(),undoStack:[],
      canReport:()=>true,reportingRole:()=> 'boss',executionRetries:new ExecutionRetries(),executionOf,uid:()=>crypto.randomUUID(),$:()=>({value:'0'}),tx:x=>x,renderModal:()=>{},maybeReload:()=>{},toast:()=>{},
      closeModal:()=>{ctx.UI.modal=null;},reloadFromStore:async()=>{ctx.S=await reader.load();return 'applied';},
      cancelPlanCalculation:()=>{},document:{activeElement:null,body:{}},HTMLElement:class{},modalReturnFocus:null,requestAnimationFrame:cb=>cb()};
    const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');vm.createContext(ctx);
    let at=source.indexOf('function directWriteOwner(');vm.runInContext(source.slice(at,source.indexOf('async function runDrawerWrite(',at)),ctx);
    at=source.indexOf('async function reportWork(');vm.runInContext(source.slice(at,source.indexOf('// ---------- 工作內容',at)),ctx);
    at=source.indexOf('function openModal(');vm.runInContext(source.slice(at,source.indexOf('function ownsLegacyRequest(',at)),ctx);ctx.$=selector=>selector==='#modal-root'?null:{value:'0'};
    const m=ctx.UI.modal,planned=JSON.stringify(state.blocks);await ctx.reportWork({disabled:false,dataset:{v:'start'}});
    assert.equal(m.pendingRequest?.id,writes[0]);assert.equal(m.qtyDraft,0);assert.match(m.error,/尚未確認/);
    assert.equal((await db.query('select count(*)::int n from work_execution_events')).rows[0].n,1);
    const original=m.pendingRequest;ctx.closeModal();ctx.openModal({t:'execution-report',id:block});const reopened=ctx.UI.modal;
    assert.equal(reopened.pendingRequest,original);assert.equal(reopened.qtyDraft,0);
    obscure=false;await ctx.reportWork({disabled:false,dataset:{v:'retry'}});
    assert.equal(writes.length,2);assert.equal(writes[0],writes[1]);assert.equal(reopened.pendingRequest,null);assert.equal(ctx.S.execution[0].revision,1);assert.equal(ctx.executionRetries.has(store),false);
    assert.equal((await db.query('select count(*)::int n from work_execution_events')).rows[0].n,1);assert.equal((await db.query('select version from schedule_state')).rows[0].version,1);
    const before=JSON.parse(planned)[0],after=ctx.S.blocks[0];assert.deepEqual([after.s,after.e,after.qty],[before.s,before.e,before.qty]);
    await assert.rejects(store.reportExecution({...request,id:crypto.randomUUID(),action:'quantity',qtyDone:10,expectedRevision:0}),e=>e.conflict===true&&!e.unconfirmed);
    assert.equal((await db.query('select version from schedule_state')).rows[0].version,1);
    await assert.rejects(reader.reportExecution({...request,id:crypto.randomUUID(),action:'quantity',qtyDone:61,expectedRevision:1}),e=>e.rejected===true&&!e.unconfirmed);
    await db.query("update profiles set role='viewer' where user_id=$1",[actor]);
    await assert.rejects(reader.reportExecution({...request,id:crypto.randomUUID(),action:'quantity',qtyDone:10,expectedRevision:1}),e=>e.rejected===true&&!e.unconfirmed);
    assert.equal((await db.query('select count(*)::int n from work_execution_events')).rows[0].n,1);
  }finally{await db.close();}
});

test('actual SDK recognizes only canonical PT409 HTTP409 as a report rollback conflict',async()=>{
  for(const [code,status,conflict] of [['PT409',409,true],['PT409',400,false],['PT409',500,false],['PT409',502,false],['PT409',503,false],['PT409',504,false],['PT409_extra',409,false],['pt409',409,false],['UNKNOWN',409,false]]){
    let calls=0;const sdk=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{accessToken:async()=> 'synthetic',global:{fetch:async()=>{
      calls++;return new Response(JSON.stringify({code,message:'synthetic response'}),{status,headers:{'Content-Type':'application/json'}});
    }}});
    const store=new SupabaseStore(sdk);store.session={user:{id:'A'},access_token:'synthetic'};store.version=77;
    await assert.rejects(store.reportExecution(request),e=>conflict?e.conflict===true&&!e.unconfirmed:e.unconfirmed===true&&!e.conflict,code+' / '+status);
    assert.equal(calls,1);assert.equal(store.version,77);assert.equal(store.base,null);
  }
});

test('real synthetic PT409 revision rollback reaches actual SDK and UI conflict reconciliation without a retry ledger or new event',async()=>{
  const db=await makeDb();try{
    // Modify only this disposable in-memory fixture, never the migration or cloud RPC.
    const definition=(await db.query("select pg_get_functiondef('report_work_execution(uuid,uuid,text,integer,integer)'::regprocedure) as body")).rows[0].body;
    await db.exec(definition.replace("errcode='40001'","errcode='PT409'"));
    const actor='44444444-4444-4444-8444-444444444444';await db.query("insert into auth.users(id,email) values($1,'synthetic-pt409@invalid')",[actor]);await db.query("update profiles set role='boss' where user_id=$1",[actor]);
    const e=(await db.query("select id from employees where name='張三'")).rows[0].id,order=(await db.query("select id from orders where code='A01'")).rows[0].id;
    await db.query("insert into schedule_blocks(id,order_id,step_seq,machine_id,employee_id,date,start_min,end_min,qty) values($1,$2,0,'a',$3,'2000-01-01',480,540,60)",[block,order,e]);
    const fake=new FakeSupabase(db,{});fake.uid=actor;const reader=new SupabaseStore(fake);await reader.init();const stale=await reader.load();
    await reader.reportExecution(request); // Actual SQL commits revision 1; the other view remains at 0.
    const codes=[],toasts=[];let writes=0,reloads=0;
    const sdk=createClient('https://synthetic.invalid','sb_publishable_synthetic_test_key',{accessToken:async()=> 'synthetic',global:{fetch:async(url,options)=>{
      assert.equal(new URL(url).pathname,'/rest/v1/rpc/report_work_execution');writes++;
      const result=await fake.rpc('report_work_execution',JSON.parse(options.body));assert.equal(result.error?.code,'PT409');codes.push(result.error.code);
      return new Response(JSON.stringify(result.error),{status:409,headers:{'Content-Type':'application/json'}});
    }}});
    const store=new SupabaseStore(sdk);store.session={user:{id:actor},access_token:'synthetic'};store.role='boss';
    const ctx={S:stale,UI:{date:'2000-01-01',factory:1,page:'schedule',drawer:null,modal:{t:'execution-report',id:block}},PV:null,STORE:store,SYNC:{state:'ok'},syncChain:Promise.resolve(),undoStack:['keep'],
      canReport:()=>true,reportingRole:()=> 'boss',executionRetries:new ExecutionRetries(),executionOf,uid:()=>crypto.randomUUID(),$:()=>({value:'10'}),tx:x=>x,renderModal:()=>{},maybeReload:()=>{},toast:x=>toasts.push(x),
      closeModal:()=>{ctx.UI.modal=null;},reloadFromStore:async()=>{reloads++;ctx.S=await reader.load();return 'applied';}};
    const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');vm.createContext(ctx);
    let at=source.indexOf('function directWriteOwner(');vm.runInContext(source.slice(at,source.indexOf('async function runDrawerWrite(',at)),ctx);
    at=source.indexOf('async function reportWork(');vm.runInContext(source.slice(at,source.indexOf('// ---------- 工作內容',at)),ctx);
    const modal=ctx.UI.modal;await ctx.reportWork({disabled:false,dataset:{v:'quantity'}});
    assert.deepEqual(codes,['PT409']);assert.equal(writes,1);assert.equal(reloads,1);
    assert.equal(modal.pendingRequest,null);assert.equal(modal.reportOwner,null);assert.equal(modal.qtyDraft,undefined);
    assert.equal(ctx.executionRetries.has(store),false);assert.match(modal.error,/進度已被更新/);assert.ok(toasts.some(x=>/重新載入/.test(x)));
    assert.equal(ctx.S.execution[0].revision,1);assert.equal(ctx.S.execution[0].qtyDone,0);assert.equal(ctx.undoStack[0],'keep');
    assert.equal((await db.query('select count(*)::int n from work_execution_events')).rows[0].n,1);assert.equal((await db.query('select version from schedule_state')).rows[0].version,1);
    const planned=(await db.query('select start_min,end_min,qty from schedule_blocks where id=$1',[block])).rows[0];assert.deepEqual(planned,{start_min:480,end_min:540,qty:60});
  }finally{await db.close();}
});
