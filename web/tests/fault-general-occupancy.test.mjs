import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
const root=process.env.SCHEDULER_TEST_ROOT?resolve(process.env.SCHEDULER_TEST_ROOT):fileURLToPath(new URL('../..',import.meta.url));
const feedback='這段時間已有固定的一般工作，無法直接登記故障；請先手動調整一般工作，再登記故障。';
const imp=p=>import(pathToFileURL(root+'/web/'+p));
const {I18N,tx}=await imp('src/i18n.js');
const {LocalStore}=await imp('src/store/local.js');
const general=await imp('src/general-work.js'),manual=await imp('src/manual.js'),factory=await imp('src/factory.js'),execution=await imp('src/execution.js'),overtime=await imp('src/overtime.js');
const {capacityIntervals:occupiedCapacityIntervals}=await imp('src/capacity.js');
const source=readFileSync(process.env.SCHEDULER_APP_SOURCE||root+'/web/src/app.js','utf8');
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
const plus=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10),day=plus(today,14);
const clone=x=>JSON.parse(JSON.stringify(x));
const equal=(x,y,msg)=>assert.deepEqual(clone(x),clone(y),msg);
function slice(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,start);return source.slice(a,b);}
function state(){return {version:0,cal:{week:Array(7).fill(true),over:{}},dayOT:{},log:[],leaveRequests:[],execution:[],
 employees:['e','p'].map(id=>({id,name:id,factory:1,color:0,skills:['m','other'],maxMachines:1,leaves:[],noOT:false,otWeekdays:[0,1,2,3,4,5,6]})),
 machines:['m','other'].map(id=>({id,label:id,factory:1,proc:'Cut',products:['p1'],faults:[]})),products:[{id:'p1',name:'Synthetic',steps:[{proc:'Cut',factory:1,rate:1,batch:0}]}],orders:[],blocks:[],
 workContents:[{id:'w',name:'Synthetic inspection',factory:1,requiresResource:true,resourceIds:['m','other'],employeeIds:['e'],reviewStatus:'confirmed'}],
 workAssignments:[{id:'a',workId:'w',emp:'e',resourceId:'m',date:day,s:540,e:600,qty:null,orderId:null,note:''}]};}
function product(S,{s=480,e=510,m='m',id='b',oid='o'}={}){S.orders.push({id:oid,code:oid,pid:'p1',qty:e-s,due:plus(day,2),pri:1});S.blocks.push({id,oid,step:0,m,emp:'p',date:day,s,e,qty:e-s,pin:false});}
async function harness(S,{store=null,initialize=true,clock=Date}={}){
 const events=[],data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 store||=new LocalStore();if(initialize)await store.sync(S);
 const c={S,STORE:store,UI:{date:day,modal:null,group:'all'},PV:null,MODAL_ACT:{},undoStack:[],...general,...manual,...factory,...execution,...overtime,occupiedCapacityIntervals,
 SYNC:{state:'ok'},syncChain:Promise.resolve(),syncPending:0,syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,readOnly:false,
 SOLVER:{up:false,url:null},console,performance,AbortController,Date:clock,Set,structuredClone,uid:()=>randomUUID(),canIncidents:()=>true,canPermission:()=>true,canPermissionRaw:()=>true,
 syncInputs:()=>{},render:()=>events.push({render:true,faults:clone(c.S.machines.flatMap(m=>m.faults))}),rerender:()=>{},renderModal:()=>{},
 closeModal:()=>{events.push({close:true});c.UI.modal=null;},maybeReload:()=>{},updateSyncChip:()=>{},toast:text=>events.push({toast:text}),
 $:()=>null,tx,md:x=>x,mdw:x=>x,hm:x=>String(x),stepName:()=> 'Cut',todayStr:()=>today,nowMin:()=>480,
 capturePreviewContext:()=>({}),window:{scrollTo:()=>{}},setTimeout,clearTimeout,
 pvOpt:()=>c.PV?.opts.find(o=>o.id===c.PV.cur),pvSummary:()=>'',peopleOf:()=>[],showResult:()=>events.push({result:true}),
 sendLineNotify:async()=>{events.push({line:true});}};
 
 vm.createContext(c);
 if(source.includes('function faultGeneralWorkConflicts('))vm.runInContext(slice('function faultGeneralWorkConflicts(','function captureFault('),c);
 if(source.includes('async function saveFaultWithNotice('))vm.runInContext(slice('async function saveFaultWithNotice(','function captureFault('),c);
 vm.runInContext(`const DAY0=480,LUNCH_S=720,LUNCH_E=780,REG_END=1020,DAY1=1200,HORIZON=60,HOLI={};const pad=n=>String(n).padStart(2,'0');const sum=(a,f)=>a.reduce((t,x)=>t+f(x),0);`+
 slice('function parseD(','function todayStr(')+slice('function mergeIv(','/* ===== 2.')+slice('const emp=id','function dayLabel(')+
 slice('function capacityIntervals(','const STRAT_ORDER=')+slice('const STRAT_RECOVER=','// 下游工序連動')+slice('function cascade(','// 檢查單一方塊'),c);
 c.nowAbs=()=>c.absOf(today,480);
 vm.runInContext(slice('function pushUndo(){','async function undo(')+slice('function queueSync(entry){','// ---------- 別人改了')+slice('function normalizeState(){','async function refreshCloudSnapshot(')+
 slice('function captureFault(m){','Object.assign(MODAL_ACT,{')+
 slice('function diffOf(','function fmtDelta(')+slice('let planCalculationJob=null;','async function askAI(){')+
 slice('async function pvApply(){','Object.assign(MODAL_ACT,{'),c);
 if(source.includes('function samePreviewState('))vm.runInContext(slice('function samePreviewState(','function pvDrawerActionsHTML('),c);
 const a=source.indexOf('  "m-fault":()=>{'),b=source.indexOf('  "m-mach-save":',a);vm.runInContext('var handlers={'+source.slice(a,b)+'};',c);
 let writes=0,rawSync=store.sync.bind(store);store.sync=async(...args)=>{writes++;events.push({write:true,candidate:clone(args[0])});return rawSync(...args);};
 c.fault=(s=510,duration=60,date=day)=>{c.UI.date=date;c.UI.modal={id:'m',fs:s,fd:duration,note:'Synthetic'};return c.handlers['m-fault']();};
 c.recover=()=>{c.UI.modal={id:'m'};c.handlers['m-fix']({dataset:{v:'0'}});};
 async function done(){for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,5));await c.syncChain;if(!c.UI.modal?.planBusy&&c.syncPending===0)return;}assert.fail('did not settle');}
 return {c,events,store,done,writes:()=>writes,restore:()=>store.sync=rawSync};
}
const blockedCases=[
 {name:'partial intersection',s:510,duration:60},
 {name:'fault contains work',s:510,duration:120},
 {name:'work contains fault',s:550,duration:30},
 {name:'identical interval',s:540,duration:60},
 {name:'regular-shift remainder',s:540,duration:-1},
 {name:'whole-day remainder',s:540,duration:0},
 {name:'earlier today still validated',s:540,duration:60,date:today,modify:S=>S.workAssignments[0].date=today},
];
for(const cfg of blockedCases)test('fault preflight preserves all state: '+cfg.name,async()=>{
 const S=state();cfg.modify?.(S);S.leaveRequests=[{id:'pending',status:'pending',date:cfg.date||day}];
 const h=await harness(S),before=clone(S);h.c.undoStack.push('existing undo');const undo=clone(h.c.undoStack);
 if(cfg.date===today)h.c.nowAbs=()=>h.c.absOf(today,700);
 h.c.fault(cfg.s,cfg.duration,cfg.date||day);const modal=h.c.UI.modal;
 // The refusal must happen before optimistic state, history, log or persistence changes.
 equal(h.c.S,before);equal(h.c.undoStack,undo);assert.ok(modal);assert.equal(h.c.PV,null);
 await h.done();assert.equal(h.writes(),0);equal(await h.store.load(),before);equal(h.c.S,before);
 assert.equal(h.c.UI.modal,modal);equal(h.c.undoStack,undo);assert.equal(h.c.syncPending,0);
 assert.equal(h.c.SYNC.state,'ok');assert.deepEqual(h.events,[{toast:feedback}]);h.restore();
});
const directCases=[
 {name:'left adjacency',s:510,duration:30},
 {name:'right adjacency',s:600,duration:30},
 {name:'strictly before',s:480,duration:30},
 {name:'strictly after',s:630,duration:30},
 {name:'other machine',s:540,duration:60,modify:S=>S.workAssignments[0].resourceId='other'},
 {name:'other day',s:540,duration:60,modify:S=>S.workAssignments[0].date=plus(day,1)},
 {name:'manual only',s:540,duration:60,modify:S=>{S.workAssignments[0].resourceId=null;Object.assign(S.workContents[0],{requiresResource:false,resourceIds:[]});}},
 {name:'unchanged past history',s:540,duration:60,date:plus(today,-1),modify:S=>S.workAssignments[0].date=plus(today,-1)},
 {name:'empty general work',s:540,duration:60,modify:S=>S.workAssignments=[]},
 {name:'legacy state without general work',s:540,duration:60,modify:S=>{delete S.workAssignments;delete S.workContents;}},
];
for(const cfg of directCases)test('nonconflicting direct fault persists: '+cfg.name,async()=>{
 const S=state();cfg.modify?.(S);const h=await harness(S),before=clone(S);
 h.c.fault(cfg.s,cfg.duration,cfg.date||day);await h.done();const saved=await h.store.load();
 assert.equal(h.writes(),1);assert.equal(h.c.PV,null);assert.equal(h.c.UI.modal,null);
 equal(saved.workAssignments||[],before.workAssignments||[]);assert.equal(saved.machines[0].faults.length,1);
 assert.equal(h.c.S.machines[0].faults.length,1);assert.equal(h.c.undoStack.length,1);
 assert.ok(!h.events.some(e=>e.toast===feedback));h.restore();
});
for(const [instant,date,blocked] of [
 ['2030-06-03T16:05:00Z','2030-06-04',true],
 ['2030-06-03T16:05:00Z','2030-06-03',false],
 ['2030-06-03T15:55:00Z','2030-06-03',true],
 ['2030-06-03T15:55:00Z','2030-06-02',false],
])test('Taipei date boundary '+instant+' / '+date,async()=>{
 const clock=class extends Date{constructor(...args){super(...(args.length?args:[instant]));}static now(){return +new Date(instant);}};
 const realDate=globalThis.Date;globalThis.Date=clock;
 try{
  const S=state();S.workAssignments[0].date=date;const h=await harness(S,{clock});
  // Browser-local date and wall-clock minutes must not override the store's day rule.
  h.c.todayStr=()=>plus(date,1);h.c.nowAbs=()=>h.c.absOf(plus(date,1),1200);
  h.c.fault(540,60,date);assert.equal(h.c.S.machines[0].faults.length,blocked?0:1);
  await h.done();assert.equal(h.writes(),blocked?0:1);assert.equal(h.events.some(e=>e.toast===feedback),blocked);
  assert.equal((await h.store.load()).machines[0].faults.length,blocked?0:1);h.restore();
 }finally{globalThis.Date=realDate;}
});
test('mixed product and fixed work keeps non-applicable previews and early LINE signal',async()=>{
 const S=state();product(S);const h=await harness(S),before=clone(S);
 h.c.STORE.kind='supabase';h.c.STORE.jwt=()=> 'synthetic-only';h.c.STORE.can=()=>true;h.c.SOLVER.check=async()=>{};h.c.SOLVER.url='https://invalid.example';
 h.c.fault(480,120);await h.done();assert.equal(h.writes(),0);assert.ok(h.c.PV);assert.equal(h.c.PV.opts.length,4);
 for(const o of h.c.PV.opts){assert.equal(o.applicable,false);assert.ok(o.diagnostics.some(x=>x.includes('設備在此時段故障')));equal(o.A.workAssignments,before.workAssignments);}
 equal(h.c.S,before);assert.equal(h.events.filter(e=>e.line).length,1);assert.ok(!h.events.some(e=>e.toast===feedback));
 await h.c.pvApply();await h.done();assert.equal(h.writes(),0);equal(await h.store.load(),before);h.restore();
});
for(const manualOnly of [false,true])test('product repair preserves fixed '+(manualOnly?'manual':'equipment')+' work',async()=>{
 const S=state();if(manualOnly){S.workAssignments[0].resourceId=null;Object.assign(S.workContents[0],{requiresResource:false,resourceIds:[]});}
 product(S,{s:480,e:540});if(manualOnly)S.blocks[0].emp='e';const h=await harness(S),before=clone(S.workAssignments);
 h.c.fault(480,60);await h.done();assert.ok(h.c.PV);assert.equal(h.c.PV.opts.length,4);
 for(const o of h.c.PV.opts){assert.notEqual(o.applicable,false);equal(o.A.workAssignments,before);general.validateGeneralWork(o.A,{today,baseAssignments:before});}
 h.c.PV.cur='B';await h.c.pvApply();await h.done();const saved=await h.store.load();equal(saved.workAssignments,before);assert.equal(saved.machines[0].faults.length,1);assert.equal(h.writes(),1);h.restore();
});
for(const manualOnly of [false,true])test('recovery preserves fixed '+(manualOnly?'manual':'equipment')+' work',async()=>{
 const S=state();if(manualOnly){S.workAssignments[0].resourceId=null;Object.assign(S.workContents[0],{requiresResource:false,resourceIds:[]});}
 product(S,{s:600,e:660});if(manualOnly)S.blocks[0].emp='e';
 S.machines[0].faults=[{id:randomUUID(),date:day,s:480,e:540,orig:[{oid:'o',step:0,date:day,s:540,e:600,m:'m',emp:manualOnly?'e':'p',qty:60}]}];
 const h=await harness(S),before=clone(S);h.c.recover();await h.done();assert.ok(h.c.PV);assert.equal(h.c.PV.opts.length,4);
 for(const o of h.c.PV.opts){assert.notEqual(o.applicable,false);equal(o.A.workAssignments,before.workAssignments);general.validateGeneralWork(o.A,{today,baseAssignments:before.workAssignments});}
 equal(h.c.S,before);h.c.PV.cur='A';await h.c.pvApply();await h.done();const saved=await h.store.load();equal(saved.workAssignments,before.workAssignments);assert.equal(saved.machines[0].faults.length,0);assert.equal(h.writes(),1);h.restore();
});
test('denied incident permission leaves state and work untouched',async()=>{
 const S=state(),h=await harness(S),before=clone(S);h.c.canIncidents=()=>false;h.c.fault();await h.done();equal(h.c.S,before);assert.equal(h.writes(),0);assert.equal(h.events.length,0);h.restore();
});
for(const lang of ['en','vi','th'])test('fixed-work refusal is translated: '+lang,async()=>{
 const S=state(),h=await harness(S);I18N.lang=lang;
 try{h.c.fault();await h.done();assert.equal(h.events[0]?.toast,tx(feedback));assert.notEqual(tx(feedback),feedback);assert.equal(h.writes(),0);}finally{I18N.lang='zh-TW';h.restore();}
});
test('actual SupabaseStore and isolated SQL: overlap is never submitted, adjacent fault persists',async()=>{
 const {SupabaseStore}=await imp('src/store/supabase.js'),{makeDb,FakeSupabase}=await imp('tests/fake-supabase.mjs'),db=await makeDb();
 try{
  const boss=randomUUID(),email='synthetic-fault-general@invalid';await db.query('insert into auth.users(id,email) values($1,$2)',[boss,email]);await db.query("update profiles set role='boss' where user_id=$1",[boss]);
  const client=new FakeSupabase(db,{[email]:{id:boss,password:'synthetic-only'}}),store=new SupabaseStore(client);await store.init();await store.login(email,'synthetic-only');
  let S=await store.load();const E=S.employees.find(e=>e.factory===1&&e.skills.length),M=S.machines.find(m=>m.factory===1&&E.skills.includes(m.id));const eid=E.id,mid=M.id;
  S.blocks=[];S.cal.over[day]='work';E.otWeekdays=[0,1,2,3,4,5,6];await store.sync(S);S=await store.load();const wid=randomUUID(),aid=randomUUID();
  S.workContents=[{id:wid,name:'Synthetic inspection',factory:1,requiresResource:true,resourceIds:[mid],employeeIds:[eid],reviewStatus:'confirmed'}];await store.sync(S);S=await store.load();
  S.workAssignments=[{id:aid,workId:wid,emp:eid,resourceId:mid,date:day,s:540,e:600,qty:null,orderId:null,note:''}];await store.sync(S);
  const rawRpc=client.rpc.bind(client);let calls=[];client.rpc=(name,args)=>{calls.push(name);return rawRpc(name,args);};
  for(const blocked of [true,false]){
   S=await store.load();const before=clone(S),h=await harness(S,{store,initialize:false});calls=[];
   h.c.SOLVER.url='https://invalid.example';h.c.UI.modal={id:mid,fs:510,fd:blocked?60:30,note:'Synthetic'};h.c.handlers['m-fault']();await h.done();const actionCalls=[...calls],saved=await store.load();
   equal(saved.workAssignments,before.workAssignments);assert.equal(h.writes(),blocked?0:1);const after=saved.machines.find(m=>m.id===mid).faults.length,prior=before.machines.find(m=>m.id===mid).faults.length;assert.equal(after-prior,blocked?0:1);
   if(blocked){assert.deepEqual(actionCalls,[]);assert.equal(saved.version,before.version);equal(h.c.S,before);assert.deepEqual(h.events,[{toast:feedback}]);}
   else assert.ok(actionCalls.some(x=>x!=='schedule_snapshot'),JSON.stringify(actionCalls));h.restore();
  }
 }finally{await db.close();}
});

test('repeated refusal is inert; correcting the interval can save once',async()=>{
 const S=state();S.workAssignments.unshift({...S.workAssignments[0],id:'other-first',date:plus(day,1)});
 const h=await harness(S),before=clone(S);h.c.fault();const modal=h.c.UI.modal;
 h.c.handlers['m-fault']();await h.done();assert.equal(h.c.UI.modal,modal);equal(h.c.S,before);assert.equal(h.c.undoStack.length,0);assert.equal(h.writes(),0);assert.deepEqual(h.events,[{toast:feedback},{toast:feedback}]);
 modal.fs=600;h.c.handlers['m-fault']();await h.done();assert.equal(h.writes(),1);assert.equal(h.c.undoStack.length,1);assert.equal(h.c.UI.modal,null);equal((await h.store.load()).workAssignments,before.workAssignments);h.restore();
});
