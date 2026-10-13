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
for(const gatewayCode of ['SYNTHETIC_GATEWAY_UNKNOWN','40001'])test('real committed report hidden by gateway '+gatewayCode+' keeps its UI request ID, and an explicit retry creates only one event',async()=>{
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
