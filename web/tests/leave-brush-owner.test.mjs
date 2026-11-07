import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {LocalStore} from '../src/store/local.js';
import {FACTORIES,inFactory} from '../src/factory.js';
import {groupedEmployees} from '../src/groups.js';
import {leaveState} from '../src/overview.js';
import {SaxesParser} from 'saxes';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const copy=value=>JSON.parse(JSON.stringify(value));
const dates=['2030-12-10','2030-12-11','2030-12-12','2030-12-13','2030-12-14','2030-12-15'];
const selectedDates=dates.slice(2,5);
function excerpt(start,end){
  const at=source.indexOf(start),to=source.indexOf(end,at);
  assert.ok(at>=0&&to>at,`Missing app excerpt: ${start}`);
  return source.slice(at,to);
}
// Navigation cases may span several lines after accessibility updates.
const handlers=excerpt('case "focus-person":','case "person-day":')+
  excerpt('case "factory":','case "groups":')+
  excerpt('case "person-day":{','case "person-month":');
// Include the occupancy guard when this fix is composed with the general-work fix.
const generalWorkGuard=source.includes('function personDayGeneralWork(')?
  excerpt('function personDayGeneralWork(','function applyPersonDay('):'';

async function fixture(t,{brush,cloud=false,factory=false}){
  const storage=new Map(),events=[],previousStorage=globalThis.localStorage;
  let ids=0;
  globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>{
    storage.set(key,value);if(key==='fsched-local-v1')events.push({type:'write'});
  }};
  t.after(()=>{if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage;});
  const localStore=new LocalStore();
  const S={employees:[{id:'alice',name:'Alice',factory:1,leaves:brush==='leave'?[]:[...dates]},
    {id:'bob',name:'Bob',factory:factory?2:1,leaves:brush==='leave'?[]:[...dates]}],
    products:[],orders:[],machines:[],blocks:[],log:[],dayOT:{},cal:{week:[false,true,true,true,true,true,false],over:{}},
    leaveRequests:brush==='uncertain'?[]:['alice','bob'].flatMap(employeeId=>dates.map(date=>({
      id:`pending-${employeeId}-${date}`,employeeId,date,status:'pending',note:'Synthetic inquiry'
    })))};
  await localStore.sync(S);events.length=0;
  const ctx={S,UI:{date:dates[0],view:'day',drawer:'people',modal:null,factory:1,group:'all',
    focus:{type:'employee',id:'alice'},leaveBrush:null,brushStart:null},PV:null,
    STORE:cloud?{kind:'supabase',session:{user:{id:'synthetic-user'}},authEpoch:1,
      createLeaveRequest:async request=>events.push({type:'create',request:copy(request)}),
      resolveLeaveRequest:async(id,status)=>events.push({type:'resolve',id,status})}:localStore,
    document:{activeElement:null,querySelector:()=>null,querySelectorAll:()=>[]},
    localStorage:globalThis.localStorage,FACTORIES,inFactory,groupedEmployees,leaveState,I18N:{lang:'en'},WD:'日一二三四五六',
    pad:n=>String(n).padStart(2,'0'),emp:id=>ctx.S.employees.find(e=>e.id===id),canIncidents:()=>true,
    uid:()=>`synthetic-${++ids}`,futureOf:()=>true,tx:x=>x,esc:x=>String(x??''),directWriteStatus:()=>'',
    undoStack:[],pushUndo:()=>ctx.undoStack.push(JSON.stringify(ctx.S)),maybeReload:()=>{},
    render:()=>events.push({type:'render',html:ctx.peopleDrawerHTML()}),toast:text=>events.push({type:'toast',text}),
    openModal:modal=>{ctx.UI.modal=modal;},
    commit:async entry=>{events.push({type:'commit',entry:copy(entry)});await localStore.sync(ctx.S);return true;},
    reloadFromStore:async()=>{events.push({type:'reload'});return 'applied';}};
  vm.createContext(ctx);
  vm.runInContext(generalWorkGuard+excerpt('function parseD(ds)','function mergeIv(')+
    excerpt('function setFactory(n)','const shownMachines=')+
    excerpt('function monthDates(ds)','function outputDrawerHTML()')+
    'this.click=a=>{const id=a.dataset.id;switch(a.dataset.act){'+handlers+'}};',ctx);
  const click=(act,attrs={})=>ctx.click({dataset:{act,...attrs}});
  const select=(id,date)=>{
    // Drive only a real date button in the current people drawer, including its fallback selection.
    let button;
    const parser=new SaxesParser({fragment:true});
    parser.on('opentag',tag=>{const a=tag.attributes;
      if(a['data-act']==='person-day'&&a['data-id']===id&&a['data-d']===date)button=a;
    });
    parser.write(ctx.peopleDrawerHTML().replace(/ (disabled|data-direct-write-control)(?=[ >])/g,' $1="$1"')).close();
    assert.ok(button,`No rendered date button for ${id} ${date}`);
    assert.ok(!('disabled' in button),'Date button must be enabled');
    click(button['data-act'],{id:button['data-id'],d:button['data-d']});
  };
  const idle=async()=>{for(let i=0;i<8;i++)await tick();};
  const writes=()=>events.filter(e=>['write','commit','create','resolve','reload'].includes(e.type));
  const success=()=>events.filter(e=>e.type==='toast'&&e.text.startsWith('已套用'));
  const initial=copy(S),persisted=storage.get('fsched-local-v1');
  const assertNoWrite=()=>{
    assert.deepEqual(copy(ctx.S),initial,'Starting a range must not mutate any employee or inquiry');
    assert.equal(storage.get('fsched-local-v1'),persisted,'Starting a range must not change persisted state');
    assert.deepEqual(writes(),[],'Starting a range must not write, call an RPC, commit or reload');
    assert.equal(ctx.undoStack.length,0);assert.equal(success().length,0);
  };
  return {ctx,events,click,select,idle,assertNoWrite,initial,localStore,success};
}
function expectedState(initial,eid,brush,range){
  const expected=copy(initial),employee=expected.employees.find(e=>e.id===eid);
  employee.leaves=brush==='leave'?[...employee.leaves,...range]:employee.leaves.filter(d=>!range.includes(d));
  for(const request of expected.leaveRequests){
    if(request.employeeId===eid&&range.includes(request.date))request.status='rejected';
  }
  if(brush==='uncertain')expected.leaveRequests.push(...range.map(date=>({employeeId:eid,date,status:'pending',note:'未確定'})));
  return expected;
}
function normalized(state){
  const result=copy(state);
  result.leaveRequests=result.leaveRequests.map(({id,...request})=>request);
  return result;
}
async function assertSaved(f,eid,brush,range,cloud){
  await f.idle();
  const expected=normalized(expectedState(f.initial,eid,brush,range));
  assert.deepEqual(normalized(f.ctx.S),expected);
  assert.deepEqual(normalized(await f.localStore.load()),expected,'Actual LocalStore must persist only the selected employee/range');
  assert.equal(f.events.filter(e=>e.type==='commit').length,1);assert.equal(f.events.filter(e=>e.type==='write').length,1);
  assert.equal(f.events.filter(e=>e.type==='reload').length,1);assert.equal(f.ctx.undoStack.length,1);
  assert.deepEqual(JSON.parse(f.ctx.undoStack[0]),f.initial,'Undo must preserve the untouched state');
  assert.equal(f.success().length,1);assert.equal(f.ctx.UI.brushStart,null);assert.equal(f.ctx.UI.leaveBrushSaving,null);
  const rpc=f.events.filter(e=>['create','resolve'].includes(e.type));
  assert.equal(rpc.length,cloud?range.length:0);
  if(cloud){
    if(brush==='uncertain')assert.deepEqual(rpc.map(e=>[e.request.employeeId,e.request.date]),range.map(d=>[eid,d]));
    else assert.deepEqual(rpc.map(e=>[e.id,e.status]),range.map(d=>[`pending-${eid}-${d}`,'rejected']));
  }
}

for(const brush of ['leave','work','uncertain'])for(const cloud of [false,true])for(const reverse of [false,true]){
  const first=reverse?selectedDates.at(-1):selectedDates[0],last=reverse?selectedDates[0]:selectedDates.at(-1);
  for(const route of ['focus-person','factory'])test(`${brush}, ${cloud?'cloud RPC':'local'}, ${reverse?'reversed':'forward'}: ${route} restarts a different employee's range`,async t=>{
    const f=await fixture(t,{brush,cloud,factory:route==='factory'});
    f.click('cal-brush',{v:brush});f.select('alice',dates[0]);await f.idle();f.assertNoWrite();
    assert.deepEqual(copy(f.ctx.UI.brushStart),{eid:'alice',d:dates[0]});
    if(route==='factory'){
      f.click('factory',{v:'2'});
      assert.equal(f.ctx.UI.focus.id,'alice','Factory route must exercise the rendered fallback, not an explicit focus change');
    }else f.click('focus-person',{id:'bob'});
    f.select('bob',first);await f.idle();f.assertNoWrite();
    assert.deepEqual(copy(f.ctx.UI.brushStart),{eid:'bob',d:first},'New employee click becomes the new start');
    f.select('bob',last);await assertSaved(f,'bob',brush,selectedDates,cloud);
  });
  test(`${brush}, ${cloud?'cloud RPC':'local'}, ${reverse?'reversed':'forward'}: same employee keeps the intended range`,async t=>{
    const f=await fixture(t,{brush,cloud});f.click('cal-brush',{v:brush});
    f.select('alice',first);await f.idle();f.assertNoWrite();
    f.click('focus-person',{id:'alice'});f.select('alice',last);
    await assertSaved(f,'alice',brush,selectedDates,cloud);
  });
}
for(const brush of ['leave','work','uncertain'])test(`${brush}: toggling or changing the brush resets its pending range`,async t=>{
  const f=await fixture(t,{brush});f.click('cal-brush',{v:brush});f.select('alice',dates[0]);
  f.click('cal-brush',{v:brush});assert.equal(f.ctx.UI.leaveBrush,null);assert.equal(f.ctx.UI.brushStart,null);
  f.click('cal-brush',{v:brush==='work'?'leave':'work'});f.select('alice',dates[0]);
  f.click('cal-brush',{v:brush});assert.equal(f.ctx.UI.brushStart,null);
  f.select('alice',selectedDates[0]);await f.idle();f.assertNoWrite();
  f.select('alice',selectedDates[0]);await assertSaved(f,'alice',brush,[selectedDates[0]],false);
});
