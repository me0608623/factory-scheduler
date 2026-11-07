import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';
import {SupabaseStore} from '../src/store/supabase.js';
import {workingDate} from './working-date.mjs';
import * as manual from '../src/manual.js';
import * as general from '../src/general-work.js';
import * as factory from '../src/factory.js';
import * as overtime from '../src/overtime.js';
import * as execution from '../src/execution.js';
import {capacityIntervals as occupiedCapacityIntervals} from '../src/capacity.js';
const src=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function harness(S,store){
let pending;const logs=[];const ctx={...manual,...general,...factory,...overtime,...execution,occupiedCapacityIntervals,S,structuredClone,DAY0:480,LUNCH_S:720,LUNCH_E:780,REG_END:1020,DAY1:1200,HORIZON:60,HOLI:{},I18N:{lang:'en'},WD_EN:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],WD_VI:[],WD_TH:[],pad:n=>String(n).padStart(2,'0'),sum:(a,f)=>a.reduce((x,y)=>x+f(y),0),uid:()=>crypto.randomUUID(),tx:x=>x,readOnly:false,canCalendar:()=>true,undoStack:[],UI:{modal:{draft:{week:[false,false,false,false,false,false,false],over:{}}}},MODAL_ACT:{},toast:x=>logs.push(x),showResult:()=>logs.push('showResult'),closeModal:()=>{},runAuto:()=>{},commit:e=>{logs.push(e);pending=store.sync(ctx.S,e);return pending;}};
vm.createContext(ctx);
function section(a,b){vm.runInContext(src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a))),ctx);}
section('function parseD(','/* ===== 2.');section('const emp=id=>','// 假日只是');section('function isOpen(','function dayLabel(');section('function pushUndo(){','function commit(');section('function capacityIntervals(','/* ----- 順移');section('function cascade(','// render 期');section('function orderStatus(','// 檢查單一方塊');section('function withState(','function otMinutes(');section('function setOpen(','function saveDailyOT(');section('function payNote(','function workdaysFrom(');
vm.runInContext('function futureOf(b){return bEnd(b)>nowAbs();} const hm=m=>pad(Math.floor(m/60))+":"+pad(m%60);',ctx);
const start=src.indexOf('  "c-save":()=>{');const end=src.indexOf('\n});',start);vm.runInContext('Object.assign(MODAL_ACT,{'+src.slice(start,end)+'});',ctx);

  return {ctx,logs,save:()=>pending};
}

async function setup(fn,{today=false,past=false}={}){
  const db=await makeDb();
  try{
    // Disposable PGlite identities only, matching the existing Store test fixture.
    const id='11111111-1111-4111-8111-111111111111';
    await db.query("insert into auth.users(id,email) values($1,'audit@x')",[id]);
    await db.query("update profiles set role='boss' where user_id=$1",[id]);
    const store=new SupabaseStore(new FakeSupabase(db,{'audit@x':{id,password:'test'}}));
    await store.init();await store.login('audit@x','test');
    let S=await store.load();
    const date=today||past?(await db.query(`select (current_date-${past?1:0})::text date`)).rows[0].date:await workingDate(db);
    S.cal.over[date]='work';
    S.blocks=[{id:crypto.randomUUID(),oid:'00000000-0000-4000-8000-0000000000b1',step:0,m:'a',emp:'00000000-0000-4000-8000-0000000000e1',date,s:480,e:540,qty:120,pin:false}];
    await store.sync(S,{kind:'move',title:'Synthetic setup'});S=await store.load();
    await fn({db,store,S,date});
  }finally{await db.close();}
}
function capture(h){return {state:h.ctx.S,cal:h.ctx.S.cal,ot:h.ctx.S.dayOT,blocks:h.ctx.S.blocks,json:JSON.stringify(h.ctx.S),undo:JSON.stringify(h.ctx.undoStack)};}
function unchanged(h,b,message){
  assert.equal(h.ctx.S,b.state);assert.equal(h.ctx.S.cal,b.cal);assert.equal(h.ctx.S.dayOT,b.ot);assert.equal(h.ctx.S.blocks,b.blocks);
  assert.equal(JSON.stringify(h.ctx.S),b.json);assert.equal(JSON.stringify(h.ctx.undoStack),b.undo);
  assert.equal(h.save(),undefined);assert.ok(h.logs.some(x=>typeof x==='string'&&message.test(x)));
}
async function isOpen(db,date){return (await db.query('select coalesce((select is_open from calendar_days where date=$1),(select is_open from calendar_weekly where weekday=extract(dow from $1::date)::int)) value',[date])).rows[0].value;}
async function unrelatedSave(h,store,db,date){h.ctx.S.orders[0].note='Unrelated note';await store.sync(h.ctx.S,{kind:'edit',title:'Unrelated note'});assert.equal(await isOpen(db,date),true);}

test('day rejection leaves all live state untouched and cannot leak into unrelated save',()=>setup(async({db,store,S,date})=>{
  S.dayOT[date]=1200;S.blocks.push({...S.blocks[0],id:crypto.randomUUID(),step:1,m:'c',emp:'00000000-0000-4000-8000-0000000000e2',date:await workingDate(db,date),s:480,e:520,pin:true});
  await store.sync(S,{kind:'move',title:'Pinned downstream'});S=await store.load();
  const h=harness(S,store),before=capture(h);h.ctx.toggleOpen(date);unchanged(h,before,/工序產量矛盾/);
  assert.equal(await isOpen(db,date),true);await unrelatedSave(h,store,db,date);
}));
test('weekly no-placement rejection preserves calendar, overtime, blocks, undo and writes',()=>setup(async({db,store,S,date})=>{
  S.dayOT[date]=1200;await store.sync(S,{kind:'ot',title:'Overtime fixture'});S=await store.load();
  const h=harness(S,store),before=capture(h);h.ctx.MODAL_ACT['c-save']();unchanged(h,before,/找不到可用時段/);await unrelatedSave(h,store,db,date);
}));
test('single-day no-placement rejection cannot persist closure',()=>setup(async({db,store,S,date})=>{
  S.cal.week.fill(false);S.cal.over={[date]:'work'};await store.sync(S,{kind:'ot',title:'One working day'});S=await store.load();
  const h=harness(S,store),before=capture(h);h.ctx.toggleOpen(date);unchanged(h,before,/找不到可用時段/);await unrelatedSave(h,store,db,date);
}));
test('successful day and weekly closures apply exactly the once-probed repaired candidate',async()=>{
  for(const weekly of [false,true])await setup(async({db,store,S,date})=>{
    const h=harness(S,store);let plan,calls=0;const original=h.ctx.planCalendarChange;
    h.ctx.planCalendarChange=(...args)=>{calls++;return plan=original(...args);};
    if(weekly){h.ctx.UI.modal.draft=structuredClone(S.cal);h.ctx.UI.modal.draft.over[date]='off';h.ctx.MODAL_ACT['c-save']();}else h.ctx.toggleOpen(date);
    assert.equal(calls,1);assert.equal(h.ctx.S,plan.candidate);assert.equal(h.ctx.undoStack.length,1);
    const ids=h.ctx.S.blocks.map(b=>b.id);assert.ok(h.ctx.S.blocks.every(b=>b.date!==date));
    await h.save();assert.equal(await isOpen(db,date),false);
    assert.deepEqual((await store.load()).blocks.map(b=>b.id),ids);
  });
});
test('general-work closure rejects before publication without moving manual assignments',()=>setup(async({db,store,S,date})=>{
  const workId=crypto.randomUUID();S.workContents=[{id:workId,name:'Packing',factory:1,requiresResource:false,employeeIds:[S.employees[0].id],resourceIds:[],reviewStatus:'confirmed'}];
  await store.sync(S,{kind:'edit',title:'Content'});S.workAssignments=[{id:crypto.randomUUID(),workId,emp:S.employees[0].id,resourceId:null,date,s:780,e:840,qty:null,orderId:null,note:''}];
  await store.sync(S,{kind:'edit',title:'Assignment'});S=await store.load();
  for(const weekly of [false,true]){const h=harness(S,store),before=capture(h);h.ctx.UI.modal.draft=structuredClone(S.cal);h.ctx.UI.modal.draft.over[date]='off';
    if(weekly)h.ctx.MODAL_ACT['c-save']();else h.ctx.toggleOpen(date);unchanged(h,before,/一般工作排班衝突/);}
  assert.equal(await isOpen(db,date),true);
}));
test('real started and finished execution records reject moving still-future scheduled work',async()=>{
  for(const done of [false,true])await setup(async({db,store,S,date})=>{
    await store.reportExecution({id:crypto.randomUUID(),blockId:S.blocks[0].id,action:'start',qtyDone:0,expectedRevision:0});
    if(done)await store.reportExecution({id:crypto.randomUUID(),blockId:S.blocks[0].id,action:'finish',qtyDone:120,expectedRevision:1});
    S=await store.load();assert.equal(S.execution[0].status,done?'done':'running');
    const h=harness(S,store);h.ctx.nowAbs=()=>h.ctx.absOf(date,500);const before=capture(h);
    h.ctx.toggleOpen(date);unchanged(h,before,/已有現場回報/);assert.equal(await isOpen(db,date),true);
  },{today:true});
});
test('wall-clock-started block without report is not relocated',()=>setup(async({store,S,date})=>{
  const h=harness(S,store);h.ctx.nowAbs=()=>h.ctx.absOf(date,500);const before=capture(h);h.ctx.toggleOpen(date);unchanged(h,before,/已開始時段/);
},{today:true}));
test('past product history stays unchanged when its day closes',()=>setup(async({db,store,S,date})=>{
  const h=harness(S,store),before=JSON.stringify(S.blocks);h.ctx.toggleOpen(date);await h.save();
  assert.equal(JSON.stringify(h.ctx.S.blocks),before);assert.equal(await isOpen(db,date),false);
},{past:true}));
test('opening preserves blocks and calendar-only permissions; denied closure never plans',()=>setup(async({db,store,S,date})=>{
  const h=harness(S,store);h.ctx.readOnly=true;const before=capture(h);h.ctx.toggleOpen(date);unchanged(h,before,/權限/);
  h.ctx.UI.modal.draft=structuredClone(S.cal);h.ctx.UI.modal.draft.over[date]='off';h.ctx.MODAL_ACT['c-save']();unchanged(h,before,/權限/);
  h.ctx.canCalendar=()=>false;h.ctx.toggleOpen(date);h.ctx.MODAL_ACT['c-save']();assert.equal(h.save(),undefined);
  h.ctx.canCalendar=()=>true;const closed=(await db.query('select (current_date+n)::text date from generate_series(1,7) n where extract(dow from current_date+n)=0')).rows[0].date;
  const blocks=JSON.stringify(h.ctx.S.blocks);h.ctx.toggleOpen(closed);await h.save();assert.equal(await isOpen(db,closed),true);assert.equal(JSON.stringify(h.ctx.S.blocks),blocks);
}));

test('future manual pin retains established calendar relocation behavior',()=>setup(async({db,store,S,date})=>{
  S.blocks[0].pin=true;await store.sync(S,{kind:'move',title:'Pin future work'});S=await store.load();
  const h=harness(S,store);h.ctx.toggleOpen(date);await h.save();
  assert.ok(h.ctx.S.blocks.every(b=>b.date!==date));assert.equal(await isOpen(db,date),false);
}));
test('elapsed finished execution history remains fixed when day closes',()=>setup(async({db,store,S,date})=>{
  await store.reportExecution({id:crypto.randomUUID(),blockId:S.blocks[0].id,action:'start',qtyDone:0,expectedRevision:0});
  await store.reportExecution({id:crypto.randomUUID(),blockId:S.blocks[0].id,action:'finish',qtyDone:120,expectedRevision:1});
  S=await store.load();const h=harness(S,store);h.ctx.nowAbs=()=>h.ctx.absOf(date,550);
  const before=JSON.stringify(S.blocks),reports=JSON.stringify(S.execution);h.ctx.toggleOpen(date);await h.save();
  assert.equal(JSON.stringify(h.ctx.S.blocks),before);assert.equal(JSON.stringify(h.ctx.S.execution),reports);assert.equal(await isOpen(db,date),false);
},{today:true}));
test('unchanged past general-work history does not block calendar changes',()=>setup(async({db,store,S,date})=>{
  const workId=crypto.randomUUID(),employee=S.employees[0].id;
  S.workContents=[{id:workId,name:'Historical packing',factory:1,requiresResource:false,employeeIds:[employee],resourceIds:[],reviewStatus:'confirmed'}];
  await store.sync(S,{kind:'edit',title:'Content'});
  // Seed already-existing history directly in this isolated database. The UI
  // intentionally does not allow creating new assignments in the past.
  await db.query('insert into work_assignments(id,work_id,employee_id,date,start_min,end_min,note) values($1,$2,$3,$4,780,840,\'\')',[crypto.randomUUID(),workId,employee,date]);
  S=await store.load();const h=harness(S,store),before=JSON.stringify(S.workAssignments);h.ctx.toggleOpen(date);await h.save();
  assert.equal(JSON.stringify(h.ctx.S.workAssignments),before);assert.equal(await isOpen(db,date),false);
},{past:true}));
test('ordinary opening never repairs unrelated legacy work on a closed day',()=>setup(async({db,store,S,date})=>{
  // Represents inconsistent data left by the old closure bug, not a new write path.
  await db.query('insert into calendar_days(date,is_open) values($1,false) on conflict(date) do update set is_open=false',[date]);
  S=await store.load();const h=harness(S,store);h.ctx.readOnly=true;
  const sunday=(await db.query('select (current_date+n)::text date from generate_series(1,7) n where extract(dow from current_date+n)=0')).rows[0].date;
  const before=JSON.stringify(S.blocks);h.ctx.toggleOpen(sunday);await h.save();
  assert.equal(JSON.stringify(h.ctx.S.blocks),before);assert.equal(await isOpen(db,sunday),true);
}));
