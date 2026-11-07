import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {LocalStore} from '../src/store/local.js';
import {SupabaseStore} from '../src/store/supabase.js';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
const plus=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const day=plus(today,14),freeDay=plus(day,1);
function slice(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,start);return source.slice(a,b);}
function state(){return {version:0,cal:{week:Array(7).fill(true),over:{}},dayOT:{},log:[],
  employees:['e','other'].map(id=>({id,name:id,factory:1,color:0,maxMachines:1,skills:['m'],leaves:[],noOT:false})),
  machines:[{id:'m',label:'Synthetic machine',factory:1,proc:'Cut',faults:[]}],products:[],orders:[],blocks:[],
  workContents:[{id:'w',name:'Synthetic inspection',factory:1,requiresResource:false,employeeIds:['e','other'],resourceIds:[],reviewStatus:'confirmed'}],
  workAssignments:[],leaveRequests:[],execution:[]};}
function assignment(overrides={}){return {id:'a',workId:'w',emp:'e',resourceId:null,date:day,s:480,e:540,qty:null,orderId:null,note:'',...overrides};}
function localTest(name,run){test(name,async t=>{
  const old=globalThis.localStorage,data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  t.after(()=>{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;});await run(t);
});}
async function harness(S,store=new LocalStore()){
  if(store.kind==='local')await store.sync(S);
  const events=[],ctx={S,STORE:store,UI:{date:day,modal:null,drawer:'people'},PV:null,undoStack:[],MODALS:{},MODAL_ACT:{},STRAT_EVENT:[],
    SYNC:{state:'ok'},syncChain:Promise.resolve(),syncPending:0,syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,SOLVER:null,
    canIncidents:()=>true,canPermission:()=>true,canPermissionRaw:()=>true,structuredClone,Date,Set,uid:()=>randomUUID(),emp:id=>ctx.S.employees.find(e=>e.id===id),
    md:x=>x,mdw:x=>x,tx:x=>x,esc:x=>x,parseD:d=>new Date(d+'T00:00:00Z'),todayStr:()=>today,addDays:plus,monthDates:()=>[day,freeDay],
    futureOf:b=>b.date>=today,openPlans:(...args)=>events.push({plan:args}),render:()=>{},rerender:()=>{},renderModal:()=>{},
    closeModal:()=>{ctx.UI.modal=null;},maybeReload:()=>{},updateSyncChip:()=>{},toast:text=>events.push({toast:text}),openModal:m=>{ctx.UI.modal=m;},
    tg:()=>'',dayInfo:()=>({w:1,open:true}),WD:'日一二三四五六',WEEK_LABELS:['Su','Mo','Tu','We','Th','Fr','Sa']};
  ctx.reloadFromStore=async()=>{ctx.S=await store.load();events.push({reload:true});return 'applied';};
  vm.createContext(ctx);
  const noticeAt=source.indexOf('async function saveLeaveWithNotice(');
  if(noticeAt>=0)vm.runInContext(source.slice(noticeAt,source.indexOf('MODALS.leaveq=',noticeAt)),ctx);
  vm.runInContext(slice('function pushUndo(){','async function undo(')+slice('function queueSync(entry){','// ---------- 別人改了')+
    slice("MODALS['person-day']=",'/* ---------- 整頁三張表')+slice('MODALS.leaveq=','/* ---------- 操作手冊'),ctx);
  vm.runInContext('this.click=a=>{switch(a.dataset.act){'+slice('case "person-day":{','case "person-month":')+'}};',ctx);
  let writes=0;const sync=store.sync.bind(store);store.sync=async(...args)=>{writes++;return sync(...args);};
  const done=async()=>{
    for(let i=0;i<100;i++){
      await new Promise(r=>setImmediate(r));await ctx.syncChain;
      if(!ctx.UI.leaveBrushSaving&&ctx.syncPending===0)return;
    }
    assert.fail('leave handler did not settle');
  };
  function act(mode,eid='e',d=day,end=freeDay){
    if(mode==='day'){ctx.UI.modal={t:'person-day',id:eid,d,leave:true};ctx.MODAL_ACT['pd-save']();}
    if(mode==='lq'){ctx.UI.modal={t:'leaveq',id:eid,date:d};ctx.MODAL_ACT['lq-go']();}
    if(mode==='month'){ctx.UI.modal={t:'person-month',id:eid,off:new Set([0,1,2,3,4,5,6])};ctx.MODAL_ACT['pm-save']();}
    if(mode==='brush'){Object.assign(ctx.UI,{leaveBrush:'leave',brushStart:{eid,d}});ctx.click({dataset:{act:'person-day',id:eid,d:end}});}
  }
  return {ctx,events,store,act,done,writes:()=>writes,restore:()=>{store.sync=sync;}};
}
function assertRefusal(h,before){
  assert.equal(JSON.stringify(h.ctx.S),before,'refusal must not mutate the schedule or inquiry');
  assert.equal(h.writes(),0,'refusal must precede commit and queueSync');assert.equal(h.ctx.undoStack.length,0);
  assert.equal(h.events.filter(e=>e.plan).length,0,'fixed general work cannot enter product repair');
  assert.ok(h.events.some(e=>/一般工作/.test(e.toast)&&/手動/.test(e.toast)),'explain the manual adjustment required');
}
for(const equipment of [false,true])for(const mode of ['day','lq'])localTest(mode+' refuses '+(equipment?'equipment':'manual')+' general work before mutation or save',async()=>{
  const S=state();S.workAssignments=[assignment({resourceId:equipment?'m':null})];
  if(equipment)Object.assign(S.workContents[0],{requiresResource:true,resourceIds:['m']});
  S.leaveRequests=[{id:'r',employeeId:'e',date:day,status:'pending'}];
  const h=await harness(S),before=JSON.stringify(h.ctx.S);h.act(mode);await h.done();assertRefusal(h,before);
  assert.deepEqual((await h.store.load()).workAssignments,S.workAssignments);
});
for(const mode of ['day','lq'])localTest(mode+' modal explains general-work conflict instead of promising no work or repair',async()=>{
  const S=state();S.workAssignments=[assignment()];const h=await harness(S);
  const modal=mode==='day'?h.ctx.MODALS['person-day']({id:'e',d:day,leave:true}):h.ctx.MODALS.leaveq({id:'e',date:day});
  assert.match(modal.body,/一般工作/);assert.match(modal.body,/手動/);assert.doesNotMatch(modal.body,/有 0 段工作|調整方案預覽/);
});
for(const mode of ['month','brush'])localTest(mode+' skips manual and equipment assignments, saves free day, and preserves inquiries',async()=>{
  const S=state(),equippedDay=plus(day,2);S.workContents.push({...S.workContents[0],id:'w2',requiresResource:true,resourceIds:['m']});
  S.workAssignments=[assignment(),assignment({id:'a2',workId:'w2',resourceId:'m',date:equippedDay})];
  S.leaveRequests=[{id:'r',employeeId:'e',date:day,status:'pending'},{id:'r2',employeeId:'e',date:equippedDay,status:'pending'}];
  const h=await harness(S),before=structuredClone(S);h.ctx.monthDates=()=>[day,freeDay,equippedDay];h.act(mode,'e',day,equippedDay);await h.done();
  const saved=await h.store.load();assert.deepEqual(saved.employees[0].leaves,[freeDay]);
  assert.deepEqual(saved.workAssignments,before.workAssignments);assert.deepEqual(saved.leaveRequests,before.leaveRequests);
  assert.equal(h.ctx.SYNC.state,'ok');assert.equal(h.writes(),1);assert.equal(h.events.filter(e=>e.plan).length,0);
  assert.ok(h.events.some(e=>e.toast?.includes('已先跳過')),'the skipped dates must be reported');
});
for(const mode of ['day','lq','month','brush'])localTest(mode+' preserves product preview or busy-day skipping',async()=>{
  const S=state();S.blocks=[{id:'b',emp:'e',date:day,s:480,e:540}];const h=await harness(S);h.act(mode);await h.done();
  if(mode==='day'||mode==='lq'){
    assert.equal(h.events.filter(e=>e.plan).length,1);assert.equal(h.writes(),0);assert.deepEqual(h.ctx.S.employees[0].leaves,[]);
  }else assert.deepEqual((await h.store.load()).employees[0].leaves,[freeDay]);
});
for(const mode of ['day','lq','month','brush'])localTest(mode+' ignores general work assigned to another employee',async()=>{
  const S=state();S.workAssignments=[assignment({emp:'other'})];const h=await harness(S);h.act(mode);await h.done();
  assert.deepEqual((await h.store.load()).employees[0].leaves,mode==='day'||mode==='lq'?[day]:[day,freeDay]);assert.equal(h.ctx.SYNC.state,'ok');
});
for(const mode of ['day','lq','brush'])localTest(mode+' allows unchanged prior-date general-work history',async()=>{
  const past=plus(today,-1),S=state();S.workAssignments=[assignment({date:past})];const h=await harness(S);
  h.act(mode,'e',past,past);await h.done();assert.deepEqual((await h.store.load()).employees[0].leaves,[past]);
});
for(const mode of ['day','lq','month','brush'])localTest(mode+' blocks general work earlier today even when futureOf is false',async()=>{
  const S=state();S.workAssignments=[assignment({date:today})];const h=await harness(S);h.ctx.futureOf=()=>false;h.ctx.monthDates=()=>[today,freeDay];
  const before=JSON.stringify(h.ctx.S);h.act(mode,'e',today,freeDay);await h.done();
  if(mode==='day'||mode==='lq')assertRefusal(h,before);
  else{const saved=await h.store.load();assert.ok(!saved.employees[0].leaves.includes(today));assert.ok(saved.employees[0].leaves.includes(freeDay),'unoccupied dates must still save');assert.deepEqual(saved.workAssignments,S.workAssignments);}
  assert.equal(h.ctx.SYNC.state,'ok');
});
for(const mode of ['day','lq'])localTest(mode+' matches store date even when the browser calendar is ahead',async()=>{
  const S=state();S.workAssignments=[assignment({date:today})];const h=await harness(S);h.ctx.todayStr=()=>plus(today,1);h.ctx.futureOf=()=>false;
  const before=JSON.stringify(h.ctx.S);h.act(mode,'e',today);await h.done();assertRefusal(h,before);
});
localTest('month edits leave prior-date general-work history and its inquiry untouched',async()=>{
  const past=plus(today,-1),S=state();S.workAssignments=[assignment({date:past})];S.leaveRequests=[{id:'r',employeeId:'e',date:past,status:'pending'}];
  const h=await harness(S);h.ctx.monthDates=()=>[past,day];h.act('month');await h.done();const saved=await h.store.load();
  assert.deepEqual(saved.employees[0].leaves,[day]);assert.deepEqual(saved.workAssignments,S.workAssignments);assert.deepEqual(saved.leaveRequests,S.leaveRequests);
});
for(const mode of ['day','lq'])localTest(mode+' refuses mixed product/general work without invoking product repair',async()=>{
  const S=state();S.blocks=[{id:'b',emp:'e',date:day,s:600,e:660}];S.workAssignments=[assignment()];
  const h=await harness(S),before=JSON.stringify(h.ctx.S);h.act(mode);await h.done();assertRefusal(h,before);
});
for(const mode of ['day','month','brush'])localTest(mode+' can cancel leave without blocking on general work',async()=>{
  const S=state();S.workAssignments=[assignment()];const h=await harness(S),before=structuredClone(S.workAssignments);
  // A pre-existing UI overlap must remain repairable by removing its leave.
  h.ctx.S.employees[0].leaves=[day];
  if(mode==='day')h.ctx.applyPersonDay('e',day,false);
  if(mode==='month'){h.ctx.UI.modal={t:'person-month',id:'e',off:new Set()};h.ctx.MODAL_ACT['pm-save']();}
  if(mode==='brush')h.act(mode,'e',day,day);
  await h.done();const saved=await h.store.load();assert.deepEqual(saved.employees[0].leaves,[]);assert.deepEqual(saved.workAssignments,before);assert.equal(h.ctx.SYNC.state,'ok');
});
localTest('work and uncertain brushes retain their existing behavior on a general-work day',async()=>{
  for(const brush of ['work','uncertain']){
    const S=state();S.workAssignments=[assignment()];if(brush==='work')S.leaveRequests=[{id:'r',employeeId:'e',date:day,status:'pending'}];
    const h=await harness(S);Object.assign(h.ctx.UI,{leaveBrush:brush,brushStart:{eid:'e',d:day}});h.ctx.click({dataset:{act:'person-day',id:'e',d:day}});await h.done();
    const saved=await h.store.load();assert.equal(saved.leaveRequests[0].status,brush==='work'?'rejected':'pending');assert.deepEqual(saved.workAssignments,S.workAssignments);assert.equal(h.ctx.SYNC.state,'ok');
  }
});

test('real SupabaseStore and SQL preserve blocked-day inquiries while saving free dates',async t=>{
  const db=await makeDb();t.after(()=>db.close());const boss=randomUUID(),email='synthetic-leave-general@invalid';
  await db.query('insert into auth.users(id,email) values($1,$2)',[boss,email]);await db.query("update profiles set role='boss' where user_id=$1",[boss]);
  const client=new FakeSupabase(db,{[email]:{id:boss,password:'synthetic-only'}}),store=new SupabaseStore(client);await store.init();await store.login(email,'synthetic-only');
  let S=await store.load();const eid=S.employees.find(e=>e.factory===1).id,mid=S.machines.find(m=>m.factory===1&&S.employees.find(e=>e.id===eid).skills.includes(m.id)).id;
  S.blocks=[];S.cal.over[day]='work';S.cal.over[freeDay]='work';S.employees.find(e=>e.id===eid).otWeekdays=[0,1,2,3,4,5,6];await store.sync(S);S=await store.load();
  const manual=randomUUID(),equipment=randomUUID();S.workContents=[{id:manual,name:'Synthetic manual',factory:1,requiresResource:false,employeeIds:[eid],resourceIds:[],reviewStatus:'confirmed'},
    {id:equipment,name:'Synthetic equipment',factory:1,requiresResource:true,employeeIds:[eid],resourceIds:[mid],reviewStatus:'confirmed'}];await store.sync(S);S=await store.load();
  S.workAssignments=[assignment({id:randomUUID(),workId:manual,emp:eid}),assignment({id:randomUUID(),workId:equipment,emp:eid,resourceId:mid,s:600,e:660})];await store.sync(S);
  const request={id:randomUUID(),employeeId:eid,date:day,note:'Synthetic pending inquiry'};await store.createLeaveRequest(request);
  const rawRpc=client.rpc.bind(client);let calls=[];client.rpc=(name,args)=>{calls.push(name);return rawRpc(name,args);};
  for(const mode of ['day','lq','month','brush','brush-only-busy'])await t.test(mode,async()=>{
    S=await store.load();if(S.employees.find(e=>e.id===eid).leaves.length){S.employees.find(e=>e.id===eid).leaves=[];await store.sync(S);S=await store.load();}
    const before=structuredClone(S),h=await harness(S,store);calls=[];if(mode==='brush-only-busy')h.act('brush',eid,day,day);else h.act(mode,eid);await h.done();
    const saved=await store.load();assert.deepEqual(saved.employees.find(e=>e.id===eid).leaves,mode==='day'||mode==='lq'||mode==='brush-only-busy'?[]:[freeDay]);
    assert.deepEqual(saved.workAssignments,before.workAssignments);assert.deepEqual(saved.leaveRequests,before.leaveRequests);
    assert.equal(saved.leaveRequests.find(r=>r.id===request.id).status,'pending');assert.equal(h.ctx.SYNC.state,'ok');
    assert.ok(!calls.includes('resolve_leave_request'),'do not reject a pending inquiry before discovering fixed work');
    if(mode==='day'||mode==='lq'){assert.equal(h.writes(),0);assert.ok(!calls.some(n=>/^save_|^apply_/.test(n)));}
    else{assert.equal(h.writes(),1);assert.ok(calls.includes('log_change'));
      const rows=(await db.query('select date::text date from leaves where employee_id=$1',[eid])).rows;assert.deepEqual(rows.map(r=>r.date),mode==='brush-only-busy'?[]:[freeDay],'only free dates may persist through SQL');}
    h.restore();
  });
});
