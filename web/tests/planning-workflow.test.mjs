import test from 'node:test';
import assert from 'node:assert/strict';
import { workQueue } from '../src/work-queue.js';
import { makeScenario,scenarioStale,validateScenario } from '../src/scenarios.js';
import { transitionExecution,assertExecutionProtected } from '../src/execution.js';
import { makeDb,FakeSupabase } from './fake-supabase.mjs';
import { SupabaseStore } from '../src/store/supabase.js';
import { LocalStore } from '../src/store/local.js';
import { toSnapshot, fromSnapshot } from '../src/convert.js';

const day='2025-01-02';
function state() {return {version:0,cal:{week:[false,true,true,true,true,true,true],over:{}},dayOT:{},
  employees:[{id:'e',name:'E',skills:['a'],leaves:[],maxMachines:1,factory:1}],
  machines:[{id:'a',label:'A',proc:'切',products:['p'],faults:[],factory:1}],
  products:[{id:'p',name:'P',steps:[{proc:'切',rate:2,batch:0,factory:1}]}],
  orders:[{id:'o',code:'O',pid:'p',qty:100,due:day,pri:1}],blocks:[{id:'b',oid:'o',step:0,m:'a',emp:'e',date:day,s:480,e:540,qty:60,pin:false}],log:[]};}
const req=(action,qtyDone,expectedRevision,id=crypto.randomUUID())=>({id,blockId:'b',action,qtyDone,expectedRevision});
test('未排量、缺人機、待確認與實際短少分開診斷，不暗示可行解',()=>{
  const S=state();let q=workQueue(S,'2025-01-03');assert.equal(q[0].remaining,40);assert.equal(q[0].canArrange,true);assert.equal(q[0].overdue,true);
  S.employees[0].skills=[];assert.match(workQueue(S,day)[0].reasons.join(),/操作技能/);
  S.setupPending=true;assert.equal(workQueue(S,day)[0].canArrange,false);
  S.setupPending=false;S.employees[0].skills=['a'];S.execution=[{blockId:'b',status:'done',qtyDone:20}];q=workQueue(S,day)[0];assert.equal(q.shortfall,40);assert.equal(q.planned,20);assert.equal(q.remaining,80);assert.equal(q.canArrange,true);
  assert.deepEqual(toSnapshot(S).work_execution,[{blockId:"b",status:"done",qtyDone:20,confirmed:false}]);
  S.products=[];assert.match(workQueue(S,day)[0].reasons.join(),/缺少產品/);
});
test('分廠與前站批量诊斷不憑空推算空檔',()=>{
  const S=state();S.products[0].steps.push({proc:'包',factory:2,rate:1,batch:80});
  const q=workQueue(S,day,2);assert.equal(q.length,1);assert.equal(q[0].factory,2);assert.match(q[0].reasons.join(),/交接批量/);
});
test('保存情境隔離本體，名冊、版本或進度改變時標示過期',()=>{
  const S=state(),A=structuredClone(S);A.blocks[0].s=490;
  const sc=makeScenario('試排',S,A);assert.equal(scenarioStale(sc,S),false);
  A.blocks[0].s=500;assert.equal(sc.payload.candidate.blocks[0].s,490);
  S.employees[0].skills=[];assert.equal(scenarioStale(sc,S),true);
  assert.throws(()=>makeScenario(' ',S,A),/名稱/);
  const invalid=structuredClone(sc.payload);invalid.candidate.blocks[0].m='missing';assert.throws(()=>validateScenario(invalid),/無效資源/);
  const ordered=state();ordered.execution=[{blockId:'b',qtyDone:1},{blockId:'c',qtyDone:2}];
  const reordered=makeScenario('排序不影響情境',ordered,ordered);ordered.execution.reverse();assert.equal(scenarioStale(reordered,ordered),false);
});
test('現場回報順序、累計、完成差異、重送與保護',()=>{
  const S=state(),start=req('start',0,0),now='2025-01-02T08:00:00Z';
  const started=transitionExecution(S,start,{now});assert.equal(S.blocks[0].pin,false);assert.equal(started.blocks[0].pin,true);
  assert.deepEqual(transitionExecution(started,start,{now}),started);
  assert.throws(()=>transitionExecution(started,{...start,qtyDone:1},{now}),/重送/);
  const quantity=transitionExecution(started,req('quantity',30,1),{now});
  assert.throws(()=>transitionExecution(quantity,req('quantity',20,2),{now}),/倒退/);
  assert.throws(()=>transitionExecution(quantity,req('finish',80,2),{now}),/超過/);
  const finished=transitionExecution(quantity,req('finish',40,2),{now});assert.equal(finished.execution[0].status,'done');assert.equal(finished.execution[0].qtyDone,40);
  const changed=structuredClone(finished);changed.blocks[0].pin=false;assert.throws(()=>assertExecutionProtected(finished,changed),/解除固定/);
  assert.throws(()=>transitionExecution(finished,req('quantity',50,3),{now}),/不可再修改/);
});
test('員工綁定、未確認、未來日期與顧機上限有界檢查',()=>{
  const S=state();assert.throws(()=>transitionExecution(S,req('start',0,0),{role:'worker',employeeId:'other'}),/權限/);
  assert.throws(()=>transitionExecution(S,req('start',0,0),{role:'viewer'}),/權限/);
  S.setupPending=true;assert.throws(()=>transitionExecution(S,req('start',0,0)),/待確認/);
  S.setupPending=false;assert.throws(()=>transitionExecution(S,req('start',0,0),{today:'2024-01-01'}),/未來/);
  const started=transitionExecution(S,req('start',0,0));started.machines.push({...S.machines[0],id:'a2'});started.blocks.push({...S.blocks[0],id:'b2',m:'a2'});
  assert.throws(()=>transitionExecution(started,{...req('start',0,0),blockId:'b2'}),/上限/);
});
test('本機情境與回報分離儲存，普通排程儲存不可覆蓋現場事實',async()=>{
  const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
  const store=new LocalStore(),S=state();await store.sync(S);
  const sc=makeScenario('本機情境',S,S);await store.saveScenario(sc);assert.equal((await store.listScenarios()).length,1);assert.deepEqual(await store.load(),S);
  await store.reportExecution(req('start',0,0));const live=await store.load();assert.equal(live.execution[0].status,'running');
  await assert.rejects(store.sync(S),/已有現場回報/);
  const tampered=structuredClone(live);tampered.execution=[];await assert.rejects(store.sync(tampered),/回報流程/);
});

test('雲端：情境隔離權限、回報冪等與交易保護',async()=>{
  const db=await makeDb();
  try {
    const boss=crypto.randomUUID(),worker=crypto.randomUUID(),viewer=crypto.randomUUID(),lead=crypto.randomUUID();
    for(const [id,email] of [[boss,'boss@x'],[worker,'worker@x'],[viewer,'viewer@x'],[lead,'lead@x']])await db.query('insert into auth.users(id,email) values($1,$2)',[id,email]);
    const employee=(await db.query("select id from employees where name='張三'")).rows[0].id;
    const employee2=(await db.query("select id from employees where name='李四'")).rows[0].id;
    const order=(await db.query("select id from orders where code='A01'")).rows[0].id;
    await db.query("update profiles set role='boss' where user_id=$1",[boss]);
    await db.query("update profiles set role='worker',employee_id=$2 where user_id=$1",[worker,employee]);
    await db.query("update profiles set role='lead' where user_id=$1",[lead]);
    const block=crypto.randomUUID();await db.query('insert into schedule_blocks(id,order_id,step_seq,machine_id,employee_id,date,start_min,end_min,qty) values($1,$2,0,\'a\',$3,\'2025-01-02\',480,540,60)',[block,order,employee]);
    const users=Object.fromEntries([[boss,'boss@x'],[worker,'worker@x'],[viewer,'viewer@x'],[lead,'lead@x']].map(([id,email])=>[email,{id,password:'pw'}]));
    const login=async email=>{const s=new SupabaseStore(new FakeSupabase(db,users));await s.login(email,'pw');return s;};
    const B=await login('boss@x'),W=await login('worker@x'),V=await login('viewer@x'),L=await login('lead@x');
    assert.equal(W.employeeId,employee);
    const base=await B.load(),sc=makeScenario('雲端試排',base,base);await B.saveScenario(sc);await B.saveScenario(sc);
    assert.equal((await B.listScenarios()).length,1);assert.equal((await L.listScenarios()).length,0);assert.equal((await W.listScenarios()).length,0);
    await assert.rejects(W.saveScenario(sc),/老闆或組長/);assert.equal((await B.load()).version,0);
    const malformed=await B.sb.rpc('save_planning_scenario',{p_id:crypto.randomUUID(),p_name:'無效',p_payload:{base:{blocks:[]},candidate:{blocks:[]}}});assert.match(malformed.error.message,/工時/);
    const start={id:crypto.randomUUID(),blockId:block,action:'start',qtyDone:0,expectedRevision:0};
    await assert.rejects(V.reportExecution(start),/權限/);
    await db.query('update profiles set employee_id=$2 where user_id=$1',[worker,employee2]);await assert.rejects(W.reportExecution(start),/自己的工作/);
    await db.query('update profiles set employee_id=$2 where user_id=$1',[worker,employee]);
    await W.reportExecution(start);await W.reportExecution(start);
    let live=await B.load();assert.equal(live.version,1);assert.equal(live.execution[0].status,'running');assert.equal(live.blocks[0].pin,true);
    await assert.rejects(W.reportExecution({...start,qtyDone:1}),/重送代號/);
    await assert.rejects(L.reportExecution({...start,id:crypto.randomUUID(),action:'quantity',qtyDone:10}),e=>e.conflict);
    const change={...start,id:crypto.randomUUID(),action:'quantity',qtyDone:30,expectedRevision:1};await W.reportExecution(change);
    await assert.rejects(W.reportExecution({...change,id:crypto.randomUUID(),qtyDone:20,expectedRevision:2}),/倒退/);
    await assert.rejects(W.reportExecution({...change,id:crypto.randomUUID(),qtyDone:61,expectedRevision:2}),/超過/);
    const protectedEdit=await B.load();protectedEdit.blocks[0].s=490;await assert.rejects(B.sync(protectedEdit),/已有現場回報/);
    await assert.rejects(db.query('update schedule_blocks set start_min=490 where id=$1',[block]),/已有現場回報/);
    await assert.rejects(db.query('delete from schedule_blocks where id=$1',[block]),/已有現場回報/);
    await W.reportExecution({...change,id:crypto.randomUUID(),action:'finish',qtyDone:40,expectedRevision:2});
    live=await B.load();assert.equal(live.version,3);assert.equal(live.execution[0].qtyDone,40);assert.equal(live.execution[0].status,'done');
    const supplement=crypto.randomUUID(),plan=[
      {id:block,order_id:order,step_seq:0,start_min:480,end_min:540,qty:60},
      {id:supplement,order_id:order,step_seq:0,start_min:540,end_min:620,qty:80},
    ];
    await db.query('select _assert_manual_quantity($1::jsonb,$2::uuid[])',[JSON.stringify(plan),[order]]);
    plan[1].qty=81;
    await assert.rejects(db.query('select _assert_manual_quantity($1::jsonb,$2::uuid[])',[JSON.stringify(plan),[order]]),/超過工單件數/);
    assert.equal((await db.query('select count(*)::int n from work_execution_events')).rows[0].n,3);
    const direct=await W.sb.from('progress_reports').insert({employee_id:employee,qty_done:999});assert.ok(direct.error);
  }finally{await db.close();}
});

test('確認完工旗標跟著快照往返（雲端模式重新整理後仍為已確認）',()=>{
  const S=state();S.execution=[{blockId:'b',status:'done',qtyDone:20,confirmed:true}];
  assert.equal(toSnapshot(S).work_execution[0].confirmed,true);
  // 模擬重新整理：schedule_snapshot() 的 work_execution 帶 confirmed，轉回畫面狀態後仍在
  const back=fromSnapshot({version:3,work_execution:[{blockId:'b',status:'done',qtyDone:20,revision:1,confirmed:true}]});
  assert.equal(back.execution[0].confirmed,true);
  const back2=fromSnapshot({version:3,work_execution:[{blockId:'b',status:'done',qtyDone:20,revision:1}]});
  assert.equal(back2.execution[0].confirmed,undefined);
});
