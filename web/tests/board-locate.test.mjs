import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {scheduleIsOffscreen,refreshScheduleLocator,initScheduleLocator,locateSchedule} from '../src/board-locate.js';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function day(blocks,ctx={}){
  const machines=[...Array(5)].map((_,i)=>({id:'demo'+i,label:'Empty machine',proc:'Cut',faults:[]}));
  machines.push({id:'test',label:'Test machine',proc:'Cut',faults:[]});
  const env={UI:{date:'2026-10-15',factory:1},S:{blocks},SZ:{day:1},readOnly:true,PV:{mode:'cmp'},
    DAY0:480,DAY1:1200,LUNCH_S:720,REG_END:1020,hourPx:()=>60,dayInfo:()=>({open:true,win:[[480,1020]]}),
    shownMachines:()=>machines,shownEmployees:()=>[],todayStr:()=> '2026-10-14',tx:(s,p)=>s.replace('{n}',p?.n),
    RUNTIME:{mode:'prod'},scheduledMachinesFirst:machines=>machines,
    esc:x=>String(x),factoryName:()=> '1',mdw:x=>x,hm:x=>String(x),szoomBarHTML:()=>'',
    issuesOf:()=>[],blkHTML:()=>'<div class="blk"></div>',canCalendar:()=>false};
  vm.createContext(env);vm.runInContext(source.slice(source.indexOf('function dayHTML('),source.indexOf('function blkHTML(')),env);
  return env.dayHTML(ctx);
}
test('real day renderer offers locating existing blocks behind empty machine columns',()=>{
  assert.match(day([{id:'block',date:'2026-10-15',m:'test'}]),/data-act="board-locate"/);
});
test('zero blocks and preview do not claim hidden schedule data',()=>{
  assert.doesNotMatch(day([]),/data-act="board-locate"/);
  assert.doesNotMatch(day([{id:'block',date:'2026-10-15',m:'test'}],{pv:true}),/data-act="board-locate"/);
});

function boardFixture(rectangles=[]){
  let rects=rectangles,listener,disconnects=0,focus=0,scroll=0;
  const hint={hidden:true},blocks=rectangles.map((_,i)=>({
    getBoundingClientRect:()=>({...rects[i],width:rects[i].right-rects[i].left}),
    scrollIntoView:options=>{assert.equal(options.inline,'center');scroll++;rects[i]={left:100,right:200};},
    focus:options=>{assert.equal(options.preventScroll,true);focus++;}
  }));
  const scroller={clientWidth:357,getBoundingClientRect:()=>({left:8,right:365}),querySelectorAll:()=>blocks,
    addEventListener:(type,fn)=>{assert.equal(type,'scroll');listener=fn;},
    removeEventListener:()=>{disconnects++;listener=null;}};
  const board={querySelector:s=>s==='.board-locate'?hint:s==='.scroller'?scroller:s==='.scroller .blk'?blocks[0]:null};
  return {board,scroller,hint,scroll:()=>scroll,focus:()=>focus,disconnects:()=>disconnects,fire:()=>listener?.()};
}
test('horizontal visibility distinguishes truly empty, hidden-right, hidden-left and visible work',()=>{
  assert.equal(scheduleIsOffscreen(boardFixture().scroller),false);
  assert.equal(scheduleIsOffscreen(boardFixture([{left:1339,right:1570}]).scroller),true);
  assert.equal(scheduleIsOffscreen(boardFixture([{left:-100,right:60}]).scroller),true);
  assert.equal(scheduleIsOffscreen(boardFixture([{left:200,right:400}]).scroller),false);
  assert.equal(scheduleIsOffscreen(boardFixture([{left:1339,right:1570},{left:100,right:200}]).scroller),false);
  const f=boardFixture([{left:500,right:600}]);f.scroller.clientWidth=0;
  assert.equal(scheduleIsOffscreen(f.scroller),false);
});
test('recovery scrolls and focuses work, hiding the prompt without mutating app state',()=>{
  const f=boardFixture([{left:1339,right:1570}]);refreshScheduleLocator(f.board);assert.equal(f.hint.hidden,false);
  assert.equal(locateSchedule(f.board),true);assert.equal(f.scroll(),1);assert.equal(f.focus(),1);assert.equal(f.hint.hidden,true);
  assert.equal(locateSchedule(boardFixture().board),false);
});
test('rerender and resize clean up old listeners and keep the prompt in sync',()=>{
  const old=globalThis.ResizeObserver,observers=[];
  globalThis.ResizeObserver=class{constructor(fn){this.fn=fn;this.stopped=false;observers.push(this);}observe(){}disconnect(){this.stopped=true;}};
  try{
    const first=boardFixture([{left:1339,right:1570}]),next=boardFixture([{left:100,right:200}]);
    initScheduleLocator(first.board);assert.equal(first.hint.hidden,false);
    first.scroller.clientWidth=0;first.fire();assert.equal(first.hint.hidden,true);
    first.scroller.clientWidth=357;observers[0].fn();assert.equal(first.hint.hidden,false);
    initScheduleLocator(next.board);assert.equal(first.disconnects(),1);assert.equal(observers[0].stopped,true);
    assert.equal(next.hint.hidden,true);initScheduleLocator(null);assert.equal(next.disconnects(),1);assert.equal(observers[1].stopped,true);
  }finally{initScheduleLocator(null);if(old===undefined)delete globalThis.ResizeObserver;else globalThis.ResizeObserver=old;}
});
test('actual delegated locate click changes neither date, factory, modal, undo nor persisted data',()=>{
  let click;const f=boardFixture([{left:1339,right:1570}]);
  const env={document:{addEventListener:(type,fn)=>{if(type==='click')click=fn;}},PV:null,UI:{date:'2026-10-15',factory:1,view:'day'},
    S:{blocks:[{id:'unchanged'}]},locateSchedule};
  vm.createContext(env);
  const start=source.indexOf('const PV_BLOCK=new Set('),end=source.indexOf('case "prev":',start);
  vm.runInContext(source.slice(start,end)+'default:throw new Error("Unexpected action");}});',env);
  const before=JSON.stringify({UI:env.UI,S:env.S});
  click({target:{closest:()=>({dataset:{act:'board-locate'},closest:()=>f.board})}});
  assert.equal(JSON.stringify({UI:env.UI,S:env.S}),before);assert.equal(f.scroll(),1);assert.equal(f.focus(),1);
});
