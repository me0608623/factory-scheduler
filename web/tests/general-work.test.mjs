import test from 'node:test';
import assert from 'node:assert/strict';
import { assignmentIssues,occupiedWork,validateGeneralWork,workWindows,assertWorkCatalog } from '../src/general-work.js';
import { capacityIntervals } from '../src/capacity.js';
import { toSnapshot,fromSnapshot } from '../src/convert.js';
import { makeScenario,scenarioStale } from '../src/scenarios.js';
import { legacyFieldMap } from '../src/legacy-field-map.js';
import { resourceLoad } from '../src/resource-load.js';
import { buildScheduleWorkbook } from '../src/excel.js';
import { LocalStore } from '../src/store/local.js';
import { SupabaseStore } from '../src/store/supabase.js';
import { makeDb,FakeSupabase } from './fake-supabase.mjs';

const day='2025-01-02';
const state=()=>({version:0,cal:{week:[false,true,true,true,true,true,false],over:{}},dayOT:{},log:[],
  employees:[{id:'e',name:'員工',factory:1,color:0,maxMachines:2,skills:['m','m2'],leaves:[],noOT:false}],
  machines:['m','m2'].map(id=>({id,label:id,factory:1,proc:'裁切',products:['p'],faults:[]})),
  products:[{id:'p',name:'產品',steps:[{proc:'裁切',factory:1,rate:1,batch:0}]}],
  orders:[{id:'o',code:'O',pid:'p',qty:60,due:day,pri:2}],blocks:[],
  workContents:[{id:'w',name:'檢查與整理',factory:1,requiresResource:false,employeeIds:['e'],resourceIds:[],reviewStatus:'confirmed'}],workAssignments:[]});
const assignment=(more={})=>({id:'g',workId:'w',emp:'e',resourceId:null,date:day,s:480,e:540,qty:null,orderId:null,note:'',...more});
const problems=(S,a)=>assignmentIssues(S,a,workWindows(S,a.date));

test('純人工不需要機台或速率，件數空白與 0 不混淆',()=>{
  const S=state();S.machines=[];S.employees[0].skills=[];
  assert.deepEqual(problems(S,assignment()),[]);assert.deepEqual(problems(S,assignment({qty:0})),[]);
  assert.match(problems(S,assignment({qty:-1})).join(),/非負整數/);
  assert.match(problems(S,assignment({resourceId:'m'})).join(),/純人工/);
});
test('純人工占滿人員容量；與不同表相同 ID 的工單仍會衝突',()=>{
  const S=state(),a=assignment();S.blocks=[{id:'g',m:'m',emp:'e',date:day,s:500,e:550}];
  assert.match(problems(S,a).join(),/專心/);
  S.blocks=[];S.workAssignments=[a];validateGeneralWork(S);
  assert.deepEqual(capacityIntervals(occupiedWork(S),day,S.employees[0]),[[480,540]]);
  assert.match(problems(S,assignment({id:'g2',s:530,e:550})).join(),/專心/);
  assert.deepEqual(problems(S,assignment({id:'g2',s:540,e:600})),[]);
});
test('設備工作核定人員、設備與技能分开；人機容量一併檢查',()=>{
  const S=state();Object.assign(S.workContents[0],{requiresResource:true,resourceIds:['m','m2']});
  assert.match(problems(S,assignment()).join(),/需要指定/);
  const a=assignment({resourceId:'m'});assert.deepEqual(problems(S,a),[]);
  S.blocks=[{id:'b',m:'m2',emp:'e',date:day,s:480,e:540}];assert.deepEqual(problems(S,a),[]);
  S.employees[0].maxMachines=1;assert.match(problems(S,a).join(),/顧機上限/);
  S.employees[0].maxMachines=2;S.blocks[0].m='m';assert.match(problems(S,a).join(),/占用/);
  S.blocks=[];S.employees[0].skills=[];assert.match(problems(S,a).join(),/技能/);
});
test('請假、午休、故障、加班與待確認不因純人工繞過',()=>{
  const S=state(),a=assignment();
  assert.match(problems(S,assignment({s:710,e:790})).join(),/午休/);
  assert.match(problems(S,assignment({date:'2025-01-05'})).join(),/停工/);
  S.employees[0].leaves=[day];assert.match(problems(S,a).join(),/請假/);S.employees[0].leaves=[];
  S.dayOT[day]=true;S.employees[0].noOT=true;assert.match(problems(S,assignment({s:1020,e:1080})).join(),/加班/);
  S.employees[0].noOT=false;S.workContents[0].reviewStatus='pending';assert.match(problems(S,a).join(),/待確認/);
  S.workContents[0].reviewStatus='confirmed';S.setupPending=true;assert.match(problems(S,a).join(),/尚待確認/);
  S.setupPending=false;Object.assign(S.workContents[0],{requiresResource:true,resourceIds:['m']});S.machines[0].faults=[{date:day,s:500,e:520}];
  assert.match(problems(S,assignment({resourceId:'m'})).join(),/故障/);
});
test('工作名冊不可留下跨廠、重複資格或已有排班的孤兒；時間與備註有界',()=>{
  const S=state();S.workContents[0].employeeIds=['missing'];assert.throws(()=>assertWorkCatalog(S),/無效/);
  S.workContents[0].employeeIds=['e','e'];assert.throws(()=>assertWorkCatalog(S),/格式/);
  S.workContents[0].employeeIds=['e'];S.workAssignments=[assignment()];S.workContents=[];assert.throws(()=>validateGeneralWork(S),/不能移除/);
  const fresh=state();assert.match(problems(fresh,assignment({date:'2025-02-30'})).join(),/日期/);
  assert.match(problems(fresh,assignment({s:500,e:490})).join(),/起訖/);
  assert.match(problems(fresh,assignment({note:'x'.repeat(501)})).join(),/500/);
  assert.match(assignmentIssues(fresh,assignment(),workWindows(fresh,day),{today:day,nowMin:481}).join(),/過去/);
});
test('快照、情境、負荷與 Excel 明細不遺漏人工排班',()=>{
  const S=state();S.workAssignments=[assignment()];
  const back=fromSnapshot(toSnapshot(S));assert.deepEqual(back.workAssignments,S.workAssignments);assert.deepEqual(back.workContents,S.workContents);
  const scenario=makeScenario('一般工作試排',S,S);S.workAssignments[0].e=550;assert.equal(scenarioStale(scenario,S),true);
  const r=resourceLoad(S,day,workWindows(S,day));assert.equal(r.missingResources,0);assert.equal(r.employees[0].busyMinutes,70);assert.equal(r.employees[0].peak,2);assert.equal(r.machines[0].busyMinutes,0);
  const wb=buildScheduleWorkbook(S,day),row=wb.getWorksheet('排程明細').getRow(2);
  assert.equal(row.getCell(2).value,'不需機台');assert.equal(row.getCell(8).value,'檢查與整理');assert.equal(row.getCell(9).value,null);assert.match(row.getCell(11).value,/參考/);
  S.machines=[];assert.doesNotThrow(()=>buildScheduleWorkbook(S,day));
});
test('1023 對照不把工作、規格、左右位置、人名或支援欄當同一種資源',()=>{
  const c={'1廠':{stations:[{cell:'B2',label:'焊接'},{cell:'E2',label:'150油壓'},{cell:'N2',label:'110'},{cell:'O2',label:'110'},{cell:'X2',label:'0.4T'}],people:[{cell:'AB2',label:'人員代號'}],management:[{cell:'AF2',label:'支援二場'}]},'2廠':{stations:[{cell:'N3',label:'手動機7（左）'},{cell:'O3',label:'手動機7（右）'}]}};
  const rows=legacyFieldMap(c);assert.equal(rows.length,9);assert.equal(new Set(rows.map(r=>r.sourceKey)).size,9);
  assert.equal(rows[0].kind,'工作內容候選');assert.equal(rows[1].kind,'設備候選');assert.equal(rows[2].kind,'規格／代號待確認');
  assert.equal(rows[7].kind,'操作位置');assert.equal(rows[8].kind,'操作位置');assert.ok(rows.every(r=>r.status==='pending'));
});
test('本機拒絕失效的工作定義，不覆蓋之前保存的排班',async()=>{
  const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
  const store=new LocalStore(),S=state();S.workAssignments=[assignment()];await store.sync(S);
  S.workContents[0].employeeIds=[];await assert.rejects(store.sync(S),e=>e.permission&&/核定/.test(e.message));
  assert.deepEqual((await store.load()).workContents[0].employeeIds,['e']);
  const historic=await store.load();historic.cal.week=Array(7).fill(false);await store.sync(historic);
  const changed=structuredClone(historic);changed.workAssignments[0].e=550;await assert.rejects(store.sync(changed),/停工/);
});

test('有界驗證：40 人、125 天、5,000 段人工工作，不掃描全日期的交叉乘積',t=>{
  const S=state();S.employees=Array.from({length:40},(_,i)=>({...S.employees[0],id:'e'+i}));
  S.workContents[0].employeeIds=S.employees.map(e=>e.id);S.cal.week=Array(7).fill(true);
  S.workAssignments=Array.from({length:5000},(_,i)=>assignment({id:'g'+i,emp:'e'+i%40,date:new Date(Date.UTC(2025,0,1+Math.floor(i/40))).toISOString().slice(0,10)}));
  const start=performance.now();validateGeneralWork(S);const ms=performance.now()-start;
  t.diagnostic('synthetic general-work validation '+Math.round(ms)+' ms; not a server capacity guarantee');assert.ok(ms<5000);
});

test('雲端工作 RPC：權限、版本、空值、交叉占用及整次撤回',async()=>{
  const db=await makeDb();
  try{
    const boss=crypto.randomUUID(),lead=crypto.randomUUID(),viewer=crypto.randomUUID();
    for(const [id,email] of [[boss,'boss@g'],[lead,'lead@g'],[viewer,'viewer@g']])await db.query('insert into auth.users(id,email) values($1,$2)',[id,email]);
    await db.query("update profiles set role='boss' where user_id=$1",[boss]);await db.query("update profiles set role='lead' where user_id=$1",[lead]);
    const users=Object.fromEntries([[boss,'boss@g'],[lead,'lead@g'],[viewer,'viewer@g']].map(([id,email])=>[email,{id,password:'pw'}]));
    const login=async email=>{const s=new SupabaseStore(new FakeSupabase(db,users));await s.login(email,'pw');return s;};
    const B=await login('boss@g'),L=await login('lead@g'),V=await login('viewer@g');
    const privileges=(await db.query("select has_table_privilege('authenticated','work_contents','TRUNCATE') c,has_table_privilege('authenticated','work_assignments','TRUNCATE') a")).rows[0];assert.deepEqual(privileges,{c:false,a:false});
    const S=await B.load(),emp=S.employees.find(e=>e.name==='張三').id,id=crypto.randomUUID();
    S.workContents=[{id,name:'人工檢查',factory:1,requiresResource:false,employeeIds:[emp],resourceIds:[],reviewStatus:'confirmed'}];
    await B.sync(S);assert.equal(S.version,1);
    const a={...assignment({id:crypto.randomUUID(),workId:id,emp})};
    const stale=await L.load();stale.workAssignments=[a];await L.sync(stale);assert.equal(stale.version,2);
    S.workAssignments=[a];await assert.rejects(B.sync(S),e=>e.conflict);
    const live=await B.load();assert.equal(live.workAssignments[0].resourceId,null);assert.equal(live.workAssignments[0].qty,null);
    const nullVer=await B.sb.rpc('save_work_assignments',{p_version:null,p_assignments:[]});assert.equal(nullVer.error.code,'40001');
    const wrongRole=await L.sb.rpc('save_work_contents',{p_version:2,p_contents:live.workContents});assert.equal(wrongRole.error.code,'42501');
    const readonly=await V.sb.rpc('save_work_assignments',{p_version:2,p_assignments:[]});assert.ok(readonly.error);
    const duplicate=await L.sb.rpc('save_work_assignments',{p_version:2,p_assignments:[{id:a.id,work_id:id,employee_id:emp,date:day,start_min:480,end_min:540},{id:crypto.randomUUID(),work_id:id,employee_id:emp,date:day,start_min:500,end_min:560}]});assert.match(duplicate.error.message,/衝突/);
    assert.equal((await B.load()).version,2);assert.equal((await B.load()).workAssignments.length,1);
    const o=live.orders.find(o=>o.code==='A01').id;
    await assert.rejects(db.query("insert into schedule_blocks(id,order_id,step_seq,machine_id,employee_id,date,start_min,end_min,qty) values($1,$2,0,'a',$3,$4,500,550,50)",[crypto.randomUUID(),o,emp,day]),/衝突/);
    await assert.rejects(db.query('update employees set active=false where id=$1',[emp]),/仍屬於/);
    const redefine=structuredClone(live.workContents);redefine[0].employeeIds=[];
    const incompatible=await B.sb.rpc('save_work_contents',{p_version:2,p_contents:redefine});assert.match(incompatible.error.message,/整次撤回/);
    assert.equal((await B.load()).workContents[0].employeeIds[0],emp);
    const direct=await V.sb.from('work_assignments').insert({id:crypto.randomUUID(),work_id:id,employee_id:emp,date:day,start_min:600,end_min:660});assert.ok(direct.error);
    const referenced=await L.load();referenced.workAssignments[0].orderId=o;await L.sync(referenced);
    await db.query("update orders set status='done' where id=$1",[o]);
    const closed=await B.load();assert.ok(!closed.orders.some(x=>x.id===o));assert.equal(closed.workReferenceOrders.find(x=>x.id===o).code,'A01');validateGeneralWork(closed);
    await db.query('update calendar_weekly set is_open=false where weekday=4');
    const next=await L.load();next.workAssignments.push({...a,id:crypto.randomUUID(),date:'2025-01-03'});await L.sync(next);
    const preserved=await B.load();assert.equal(preserved.workAssignments.length,2);assert.ok(preserved.workAssignments.some(x=>x.id===a.id));
    const del=await L.load();del.workAssignments=[];await L.sync(del);assert.equal((await B.load()).workAssignments.length,0);
  }finally{await db.close();}
});
