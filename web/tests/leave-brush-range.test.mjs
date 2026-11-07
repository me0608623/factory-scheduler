import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {LocalStore} from '../src/store/local.js';
import {I18N, tx, UI_TEXT} from '../src/i18n.js';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const limitMessage='一次最多可選取 62 個日曆天（含起訖日）；未變更任何日期，請重新選取起點與終點。';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const plain=value=>JSON.parse(JSON.stringify(value));
const nextDate=(date,offset)=>new Date(Date.parse(date+'T00:00:00Z')+offset*864e5).toISOString().slice(0,10);
const rangeDates=(date,days)=>Array.from({length:days},(_,i)=>nextDate(date,i));
function extract(start,end){
  const at=source.indexOf(start),to=source.indexOf(end,at);
  assert.ok(at>=0&&to>at,`Source section exists: ${start}`);
  return source.slice(at,to);
}

// Execute the actual calendar rendering/date picker/brush/commit/queue handlers.
// LocalStore uses isolated localStorage; cloud request methods are synthetic spies,
// not Supabase or browser E2E. Every selected date must exist in the rendered month.
async function fixture(t,{brush='leave',storeKind='local',start='2030-12-10',days=63,skip=0}={}){
  const previousStorage=globalThis.localStorage,previousLanguage=I18N.lang;
  const storage=new Map(),events=[],renders=[];
  let writes=0,sequence=0,dateSteps=0;
  globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>{writes++;storage.set(key,value);}};
  I18N.lang='zh-TW';
  t.after(()=>{if(previousStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previousStorage;I18N.lang=previousLanguage;});
  const dates=rangeDates(start,days),store=new LocalStore();
  const state={employees:[{id:'test',name:'Synthetic',factory:1,leaves:brush==='leave'?[]:[...dates]}],
    leaveRequests:brush==='uncertain'?[]:dates.map((date,i)=>({id:`pending-${i}`,employeeId:'test',date,status:'pending',note:'Synthetic'})),
    blocks:dates.slice(0,skip).map((date,i)=>({id:`busy-${i}`,emp:'test',date})),
    machines:[],orders:[],products:[],cal:{week:[false,true,true,true,true,true,false],over:{}},dayOT:{},log:[]};
  await store.sync(state);writes=0;
  const ctx={S:state,STORE:store,UI:{date:start,view:'day',drawer:'people',modal:null,focus:{type:'employee',id:'test'},leaveBrush:null,brushStart:null,leaveBrushError:''},PV:null,
    I18N,tx,structuredClone,pad:n=>String(n).padStart(2,'0'),WD:'日一二三四五六',
    canIncidents:()=>true,canPermission:()=>true,uid:()=>`synthetic-${++sequence}`,emp:id=>ctx.S.employees.find(e=>e.id===id),
    shownEmployees:()=>ctx.S.employees,leaveState:()=> 'work',futureOf:()=>true,
    undoStack:[],directWriteStatus:()=>'',maybeReload:()=>{},updateSyncChip:()=>{},SOLVER:null,
    SYNC:{state:'ok'},syncChain:Promise.resolve(),syncPending:0,syncEpoch:0,lastSyncState:'ok',lastLocalWrite:0,
    esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    render:()=>renders.push(ctx.peopleDrawerHTML()),toast:text=>events.push({type:'toast',text}),openModal:m=>{ctx.UI.modal=m;},
    reloadFromStore:async()=>{events.push({type:'reload'});assert.deepEqual(await store.load(),plain(ctx.S));return 'applied';}};
  const sync=store.sync.bind(store);
  store.sync=async(...args)=>{events.push({type:'sync'});return sync(...args);};
  if(storeKind==='supabase'){
    store.kind='supabase';store.session={user:{id:'synthetic-user'}};store.authEpoch=1;
    store.createLeaveRequest=async request=>events.push({type:'create',request:plain(request)});
    store.resolveLeaveRequest=async(id,status)=>events.push({type:'resolve',id,status});
  }
  vm.createContext(ctx);
  vm.runInContext(extract('function parseD(ds)','function mergeIv(')+extract('function monthDates(ds)','function outputDrawerHTML()')+
    extract('function pushUndo(){','\nasync function undo(')+extract('function queueSync(entry){','// ---------- 別人改了'),ctx);
  if(source.includes('function personDayGeneralWork('))vm.runInContext(extract('function personDayGeneralWork(','function applyPersonDay('),ctx);
  const realAddDays=ctx.addDays;
  ctx.addDays=(date,n)=>{assert.ok(++dateSteps<=128,'Range work must remain bounded');return realAddDays(date,n);};
  const commit=ctx.commit;ctx.commit=(...args)=>{events.push({type:'commit'});return commit(...args);};
  vm.runInContext('this.click=a=>{const id=a.dataset.id;switch(a.dataset.act){'+extract('case "person-day":{','case "person-month":')+'}};',ctx);
  const dateChange=source.split('\n').find(line=>line.includes('if(e.target.id==="datepick"'));
  assert.ok(dateChange);vm.runInContext('this.change=e=>{'+dateChange+'};',ctx);
  const click=(act,attrs={})=>ctx.click({dataset:{act,...attrs}});
  const select=date=>{
    ctx.change({target:{id:'datepick',value:date}});
    assert.ok(ctx.peopleDrawerHTML().includes(`data-id="test" data-d="${date}"`),'Select an actual date button');
    click('person-day',{id:'test',d:date});
  };
  click('cal-brush',{v:brush});
  const settle=async()=>{await tick();await ctx.syncChain;await tick();};
  return {ctx,events,renders,dates,select,click,settle,load:()=>store.load(),writes:()=>writes,dateSteps:()=>dateSteps};
}
const mutations=f=>f.events.filter(e=>['commit','sync','create','resolve','reload'].includes(e.type));
const successes=f=>f.events.filter(e=>e.type==='toast'&&e.text.startsWith('已套用'));
function assertRejected(f,before){
  assert.equal(JSON.stringify(f.ctx.S),before,'No state/history mutation');
  assert.equal(f.ctx.undoStack.length,0,'No undo snapshot');
  assert.deepEqual(mutations(f),[],'No request RPC, commit, sync or reload');
  assert.equal(f.writes(),0,'No localStorage write');
  assert.equal(f.ctx.UI.brushStart,null,'Rejected endpoints are cleared');
  assert.ok(!f.ctx.UI.leaveBrushSaving&&!f.ctx.UI.leaveBrushOperation,'No operation starts');
  assert.equal(f.ctx.UI.leaveBrushError,tx(limitMessage));
  assert.equal(f.events.at(-1).text,tx(limitMessage));
  assert.match(f.renders.at(-1),/role="alert"/);
  assert.equal(successes(f).length,0);
}

for(const brush of ['leave','work','uncertain'])for(const storeKind of ['local','supabase'])for(const days of [61,62,63])for(const reverse of [false,true]){
  test(`${storeKind} ${brush}: ${days} inclusive days, ${reverse?'reverse':'forward'} across year boundary`,async t=>{
    const f=await fixture(t,{brush,storeKind,days}),before=JSON.stringify(f.ctx.S),first=reverse?f.dates.at(-1):f.dates[0],last=reverse?f.dates[0]:f.dates.at(-1);
    f.select(first);await f.settle();
    assert.equal(JSON.stringify(f.ctx.S),before);assert.equal(f.ctx.undoStack.length,0);assert.deepEqual(mutations(f),[]);assert.equal(f.writes(),0);
    f.select(last);await f.settle();
    if(days===63){assertRejected(f,before);assert.deepEqual(await f.load(),JSON.parse(before));return;}
    const saved=await f.load();assert.equal(f.writes(),1);assert.equal(f.ctx.undoStack.length,1);assert.equal(f.ctx.undoStack[0],before);
    assert.deepEqual(saved.employees[0].leaves,brush==='leave'?f.dates:[]);
    assert.deepEqual(saved.leaveRequests.filter(r=>r.status==='pending').map(r=>r.date),brush==='uncertain'?f.dates:[]);
    assert.equal(saved.log.length,1);assert.match(saved.log[0].title,new RegExp(`（${days} 天）$`));
    assert.ok(saved.log[0].title.includes(f.ctx.md(f.dates[0])+'～'+f.ctx.md(f.dates.at(-1))));
    assert.equal(f.events.filter(e=>e.type==='commit').length,1);assert.equal(successes(f).length,1);
    assert.equal(f.events.filter(e=>e.type==='create').length,storeKind==='supabase'&&brush==='uncertain'?days:0);
    assert.equal(f.events.filter(e=>e.type==='resolve').length,storeKind==='supabase'&&brush!=='uncertain'?days:0);
    assert.equal(f.ctx.UI.leaveBrushError,'');assert.ok(f.dateSteps()<=days+1);
  });
}

for(const start of ['2028-01-30','2100-01-30','2400-01-30'])for(const days of [61,62,63]){
  test(`calendar bound counts leap/century dates: ${start}, ${days} days`,async t=>{
    const f=await fixture(t,{start,days}),before=JSON.stringify(f.ctx.S);
    f.select(f.dates.at(-1));f.select(start);await f.settle();
    if(days===63)assertRejected(f,before);
    else assert.deepEqual((await f.load()).employees[0].leaves,f.dates);
  });
}

for(const days of [62,63])test(`skipped production days still count toward the ${days}-day calendar span`,async t=>{
  const f=await fixture(t,{days,skip:10}),before=JSON.stringify(f.ctx.S);
  f.select(f.dates[0]);f.select(f.dates.at(-1));await f.settle();
  if(days===63)assertRejected(f,before);
  else{
    const saved=await f.load();assert.deepEqual(saved.employees[0].leaves,f.dates.slice(10));
    assert.deepEqual(saved.leaveRequests.filter(r=>r.status==='pending').map(r=>r.date),f.dates.slice(0,10));
    assert.match(saved.log[0].title,/（52 天）$/);assert.equal(successes(f).length,1);
  }
});

test('very long range with skipped dates is rejected before iterating or creating undo',async t=>{
  const f=await fixture(t,{skip:63}),before=JSON.stringify(f.ctx.S);
  // Future blocks on the first 63 dates used to bypass the changed-date cap.
  f.select('2030-12-10');f.select('9999-12-31');await f.settle();
  assertRejected(f,before);assert.equal(f.dateSteps(),0,'No range iteration');
});

test('short valid range late in year 9999 is not rejected by a five-digit comparison date',async t=>{
  const f=await fixture(t,{start:'9999-12-01',days:2});
  f.select('9999-12-01');f.select('9999-12-02');await f.settle();
  assert.deepEqual((await f.load()).employees[0].leaves,f.dates);assert.equal(successes(f).length,1);
});

for(const brush of ['leave','work','uncertain'])test(`${brush}: rejected endpoints reset; retry needs two fresh clicks`,async t=>{
  const f=await fixture(t,{brush,storeKind:'supabase'}),before=JSON.stringify(f.ctx.S);
  f.select(f.dates[0]);f.select(f.dates.at(-1));await f.settle();assertRejected(f,before);
  assert.equal(f.ctx.UI.leaveBrush,brush,'Selected brush is retained');
  f.select('2031-02-10');await f.settle();
  assert.equal(JSON.stringify(f.ctx.S),before);assert.deepEqual(mutations(f),[]);assert.equal(f.ctx.undoStack.length,0);
  assert.deepEqual(plain(f.ctx.UI.brushStart),{eid:'test',d:'2031-02-10'});
  // Keep the previous failure visible until the fresh range is submitted.
  assert.equal(f.ctx.UI.leaveBrushError,limitMessage);
  f.select('2031-02-10');await f.settle();
  assert.equal(f.ctx.UI.brushStart,null);assert.equal(f.ctx.UI.leaveBrushError,'');assert.equal(f.ctx.undoStack.length,1);
  assert.equal(f.writes(),1);assert.equal(successes(f).length,1);assert.match((await f.load()).log[0].title,/（1 天）$/);
  const saved=await f.load();
  assert.equal(saved.employees[0].leaves.includes('2031-02-10'),brush==='leave');
  assert.equal(saved.leaveRequests.some(r=>r.date==='2031-02-10'&&r.status==='pending'),brush==='uncertain');
});

test('switching a brush after rejection clears the error and starts a new range',async t=>{
  const f=await fixture(t),before=JSON.stringify(f.ctx.S);
  f.select(f.dates[0]);f.select(f.dates.at(-1));await f.settle();assertRejected(f,before);
  f.click('cal-brush',{v:'work'});assert.equal(f.ctx.UI.leaveBrushError,'');assert.equal(f.ctx.UI.brushStart,null);
  f.select('2031-02-10');await f.settle();assert.equal(JSON.stringify(f.ctx.S),before);assert.equal(f.writes(),0);
  assert.deepEqual(plain(f.ctx.UI.brushStart),{eid:'test',d:'2031-02-10'});
});

for(const language of ['zh-TW','en','vi','th'])test(`${language}: limit feedback is translated in the rendered calendar and toast`,async t=>{
  const f=await fixture(t);I18N.lang=language;
  f.select(f.dates[0]);f.select(f.dates.at(-1));await f.settle();
  if(language!=='zh-TW'){assert.ok(UI_TEXT[limitMessage]?.[language]);assert.notEqual(tx(limitMessage),limitMessage);}
  assert.match(tx(limitMessage),/62/);assert.equal(f.ctx.UI.leaveBrushError,tx(limitMessage));
  assert.equal(f.events.at(-1).text,tx(limitMessage));assert.ok(f.renders.at(-1).includes(tx(limitMessage)));
});
