import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTransfers,appendFlow,batchTotals,transferSummary,materialWarning,assertTransferLink,transferPlanWarnings} from '../src/transfers.js';
import {assignmentToDb,validateGeneralWork} from '../src/general-work.js';
import {toSnapshot,fromSnapshot} from '../src/convert.js';
import {scenarioKey} from '../src/scenarios.js';
import {LocalStore} from '../src/store/local.js';
import {SupabaseStore} from '../src/store/supabase.js';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';
const day='2025-01-02';
const order=(more={})=>({id:'t',code:'XF-01',itemCode:'052AR00232',fromFactory:1,toFactory:2,returnFactory:1,totalQty:100,urgentQty:20,notified:day,expectedSend:day,due:'2025-01-05',urgentDue:'2025-01-03',workIds:['w'],status:'active',note:'',batches:[{id:'batch',code:'第一批',plannedQty:60}],events:[],...more});
const state=()=>({version:0,cal:{week:[false,true,true,true,true,true,false],over:{}},dayOT:{},log:[],employees:[{id:'e',name:'工人',factory:2,skills:[],leaves:[],color:0,maxMachines:1,noOT:false}],machines:[],products:[],orders:[],blocks:[],workContents:[{id:'w',name:'人工檢查',factory:2,requiresResource:false,employeeIds:['e'],resourceIds:[],reviewStatus:'confirmed'}],workAssignments:[],transferOrders:[order()]});
const event=(action,qty,i=0,more={})=>({id:action+i,batchId:'batch',action,qty,badQty:0,at:day+'T'+String(8+i).padStart(2,'0')+':00',note:'',...more});
const a=(more={})=>({id:'a',workId:'w',emp:'e',resourceId:null,date:day,s:600,e:660,qty:20,orderId:null,note:'',transferBatchId:'batch',transferStage:'process',...more});
test('跨廠需求與批次不猜日期、不把急用增加到總量',()=>{
 const S=state();validateTransfers(S);assert.equal(S.transferOrders[0].itemCode,'052AR00232');
 S.transferOrders[0].urgentQty=101;assert.throws(()=>validateTransfers(S),/格式/);S.transferOrders[0].urgentQty=0;S.transferOrders[0].totalQty=null;assert.throws(()=>validateTransfers(S),/缺數量/);
 S.transferOrders[0].batches=[];S.transferOrders[0].notified=null;validateTransfers(S);assert.match(transferSummary(S.transferOrders[0],day).warnings.join(),/總數量/);
});
test('五步分批流轉：實際點收、良品、不良與回廠差異分開',()=>{
 let S=state();for(const [action,n,i,badQty] of [['send',60,0,0],['receive',50,1,0],['complete',40,2,5],['return',30,3,0],['accept',25,4,5]])S=appendFlow(S,'t',event(action,n,i,{badQty}));
 const t=batchTotals(S.transferOrders[0],S.transferOrders[0].batches[0]);assert.deepEqual(t,{send:60,receive:50,complete:40,return:30,accept:25,scrap:5,rejected:5});
 const summary=transferSummary(S.transferOrders[0],'2025-01-06');assert.equal(summary.urgentMissing,0);assert.equal(summary.status,'部分回廠');assert.match(summary.warnings.join(),/回廠逾期/);
});
test('不得超交、未點收不得完成；時間前後顛倒也拒絕',()=>{
 const S=state();assert.throws(()=>appendFlow(S,'t',event('receive',1)),/前一步/);assert.throws(()=>appendFlow(S,'t',event('send',61)),/前一步/);
 const sent=appendFlow(S,'t',event('send',60));assert.throws(()=>appendFlow(sent,'t',event('complete',10,1)),/前一步/);
 assert.throws(()=>appendFlow(sent,'t',event('receive',10,1,{at:day+'T07:00'})),/前一步/);
 assert.throws(()=>appendFlow(S,'t',event('send',5,0,{badQty:1})),/格式/);
 assert.throws(()=>appendFlow(S,'t',event('send',1,0,{at:'2099-01-01T08:00'})),/未來/);
});
test('不可竄改歷史或刪單；同一重送代號不重複計量',()=>{
 const old=appendFlow(state(),'t',event('send',30));assert.deepEqual(appendFlow(old,'t',event('send',30)),old);
 assert.throws(()=>appendFlow(old,'t',event('send',31)),/重送/);
 const changed=structuredClone(old);changed.transferOrders[0].events=[];assert.throws(()=>validateTransfers(changed,{before:old}),/不可刪改/);
 changed.transferOrders=[];assert.throws(()=>validateTransfers(changed,{before:old}),/不刪除/);
});
test('結案仍保留實際逾期；預排晚於期限另行提示，不冒充交接時間預測',()=>{
 const o=order({totalQty:20,urgentQty:10,due:'2025-01-01',urgentDue:'2025-01-01',batches:[{id:'batch',code:'B',plannedQty:20}],events:['send','receive','complete','return','accept'].map((x,i)=>event(x,20,i))});
 const summary=transferSummary(o,'2025-01-06');assert.equal(summary.status,'已結案');assert.match(summary.warnings.join(),/實際回廠逾期/);assert.match(summary.warnings.join(),/超過急用期限/);
 const S=state();assert.match(transferPlanWarnings(S,a({date:'2025-01-06'})).join(),/尚未計算/);
});
test('人工批次預排只提示缺料；後續需回廠合格點收才能視為有料',()=>{
 let S=state();S.workAssignments=[a()];validateGeneralWork(S);assert.match(materialWarning(S,a()),/尚缺 20/);
 S=appendFlow(S,'t',event('send',60));S=appendFlow(S,'t',event('receive',30,1));assert.equal(materialWarning(S,a()),null);
 S.workAssignments.push(a({id:'a2',s:660,e:720}));assert.match(materialWarning(S,S.workAssignments[1]),/尚缺 10/);
 S.workContents.push({...S.workContents[0],id:'r',factory:1,employeeIds:[]});assertTransferLink(S,a({workId:'r',transferStage:'return'}));assert.match(materialWarning(S,a({workId:'r',transferStage:'return'})),/回廠點收/);
});
test('加工不良與已送回品不可再當加工廠的可用原料',()=>{
 let S=state();S=appendFlow(S,'t',event('send',60));S=appendFlow(S,'t',event('receive',30,1));S=appendFlow(S,'t',event('complete',20,2,{badQty:5}));S=appendFlow(S,'t',event('return',20,3));
 assert.match(materialWarning(S,a({s:720,e:780,qty:10})),/尚缺 5/);
});
test('排班連結須符合廠別、工序及批次量；跨工序不重複累計原料',()=>{
 const S=state();assert.throws(()=>assertTransferLink(S,a({qty:null})),/正整數/);assert.throws(()=>assertTransferLink(S,a({qty:61})),/超過/);
 assert.throws(()=>assertTransferLink(S,a({transferStage:'return'})),/廠別/);
 S.workAssignments=[a()];assert.throws(()=>assertTransferLink(S,a({id:'a2',qty:50})),/超過/);
 S.workContents.push({...S.workContents[0],id:'w2'});S.transferOrders[0].workIds.push('w2');assertTransferLink(S,a({id:'a2',workId:'w2',qty:60}));
 const changed=structuredClone(S);changed.transferOrders[0].status='paused';validateTransfers(changed,{before:S});assert.throws(()=>assertTransferLink(changed,a({id:'new'})),/暫停/);
});
test('快照、情境與本機存檔保留跨廠資料，無效新流轉整次不存',async()=>{
 const S=state();S.workAssignments=[a()];assert.deepEqual(fromSnapshot(toSnapshot(S)).transferOrders,S.transferOrders);
 const key=scenarioKey(S);S.transferOrders[0].urgentQty=10;assert.notEqual(scenarioKey(S),key);assert.equal(assignmentToDb(a()).transfer_batch_id,'batch');
 let stored=null;globalThis.localStorage={getItem:()=>stored,setItem:(k,v)=>{stored=v;}};const L=new LocalStore();await L.sync(S);
 const bad=structuredClone(S);bad.transferOrders[0].events=[event('complete',30)];await assert.rejects(L.sync(bad),/前一步/);assert.deepEqual((await L.load()).transferOrders,S.transferOrders);delete globalThis.localStorage;
});
test('SQL 跨廠 RPC：權限、版本、歷史保護、批次連結及整次撤回',async()=>{
 const db=await makeDb();try{
  const boss=crypto.randomUUID(),lead=crypto.randomUUID(),viewer=crypto.randomUUID();for(const [id,email] of [[boss,'boss@t'],[lead,'lead@t'],[viewer,'viewer@t']])await db.query('insert into auth.users(id,email) values($1,$2)',[id,email]);
  await db.query("update profiles set role='boss' where user_id=$1",[boss]);await db.query("update profiles set role='lead' where user_id=$1",[lead]);
  const users=Object.fromEntries([[boss,'boss@t'],[lead,'lead@t'],[viewer,'viewer@t']].map(([id,email])=>[email,{id,password:'pw'}]));const login=async email=>{const s=new SupabaseStore(new FakeSupabase(db,users));await s.login(email,'pw');return s;};
  const B=await login('boss@t'),L=await login('lead@t'),V=await login('viewer@t');const S=await B.load(),e=S.employees.find(e=>e.name==='張三').id,w=crypto.randomUUID(),oid=crypto.randomUUID(),bid=crypto.randomUUID();
  S.workContents=[{id:w,name:'核定人工',factory:1,requiresResource:false,employeeIds:[e],resourceIds:[],reviewStatus:'confirmed'}];await B.sync(S);
  S.transferOrders=[order({id:oid,fromFactory:2,toFactory:1,returnFactory:2,workIds:[w],batches:[{id:bid,code:'B1',plannedQty:60}]})];await B.sync(S);assert.equal(S.version,2);
  const stale=await B.load(),live=await L.load();live.transferOrders[0].events=[{...event('send',60),id:crypto.randomUUID(),batchId:bid}];await L.sync(live);
  stale.transferOrders[0].urgentQty=1;await assert.rejects(B.sync(stale),e=>e.conflict);
  const wrongRole=await V.sb.rpc('save_transfer_orders',{p_version:3,p_orders:live.transferOrders});assert.equal(wrongRole.error.code,'42501');
  const nullVersion=await L.sb.rpc('save_transfer_orders',{p_version:null,p_orders:live.transferOrders});assert.equal(nullVersion.error.code,'40001');
  const loaded=await B.load(),bad=structuredClone(loaded.transferOrders);bad[0].events.push({...event('complete',30,1),id:crypto.randomUUID(),batchId:bid});const rejected=await L.sb.rpc('save_transfer_orders',{p_version:3,p_orders:bad});assert.match(rejected.error.message,/前一步/);assert.equal((await B.load()).version,3);
  const changed=structuredClone(loaded.transferOrders);changed[0].events=[];const edited=await L.sb.rpc('save_transfer_orders',{p_version:3,p_orders:changed});assert.match(edited.error.message,/不可刪改/);
  const planned=await L.load();planned.workAssignments=[a({id:crypto.randomUUID(),workId:w,emp:e,transferBatchId:bid})];await L.sync(planned);assert.equal((await B.load()).workAssignments[0].transferBatchId,bid);
  const direct=await V.sb.from('transfer_orders').insert({id:crypto.randomUUID(),code:'NO',body:{}});assert.ok(direct.error);
  assert.equal((await db.query("select has_table_privilege('authenticated','transfer_orders','TRUNCATE') ok")).rows[0].ok,false);
  const tooSmall=await L.load();tooSmall.transferOrders[0].batches[0].plannedQty=10;await assert.rejects(L.sync(tooSmall));assert.equal((await B.load()).transferOrders[0].batches[0].plannedQty,60);
  const custom=await B.load(),pid=crypto.randomUUID();custom.products.push({id:pid,name:'自訂加工品號',steps:[{proc:'自訂磨邊',factory:1,rate:1,batch:0}]});await B.sync(custom);
  custom.machines.push({id:'z2',label:'自訂工位',factory:1,proc:'自訂磨邊',products:[pid],faults:[]});await B.sync(custom);
  const checked=await B.load();assert.equal(checked.machines.find(m=>m.id==='z2').proc,'自訂磨邊');assert.equal(checked.products.find(p=>p.id===pid).name,'自訂加工品號');
 }finally{await db.close();}
});
