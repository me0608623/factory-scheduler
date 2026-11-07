import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {occupiedWork,workCatalog} from '../src/general-work.js';
import {inFactory} from '../src/factory.js';

// Execute the real dayTSV and x-copy-day source. Clipboard delivery is captured,
// not exercised in a browser; display helpers below use deterministic fixtures.
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const functionStart=source.indexOf('function dayTSV(){');
const functionEnd=source.indexOf('function allRows(){',functionStart);
const actionStart=source.indexOf('"x-copy-day":');
const actionEnd=source.indexOf('"x-print-day":',actionStart);
assert.ok(functionStart>=0&&functionEnd>functionStart&&actionStart>=0&&actionEnd>actionStart);
const code=source.slice(functionStart,functionEnd)+'\nconst actions={'+source.slice(actionStart,actionEnd)+'};this.copyDay=actions["x-copy-day"];';
const date='2026-11-09';
function fixture(){
  const S={
    machines:[{id:'m1',label:'Machine 1',factory:1},{id:'m2',label:'Machine 2',factory:2}],
    employees:[{id:'e1',name:'Alice',factory:1}],
    orders:[{id:'o1',code:'FIRST'},{id:'o2',code:'SECOND'},{id:'o3',code:'NEXT'}],
    // Deliberately out of chronological order to test export sorting.
    blocks:[{id:'b2',date,m:'m1',emp:'e1',oid:'o2',s:490,e:500,qty:20},{id:'b1',date,m:'m1',emp:'e1',oid:'o1',s:480,e:490,qty:10}],
    workContents:[{id:'w1',name:'INSPECT',factory:1}],
    workAssignments:[{id:'a1',date,workId:'w1',resourceId:'m1',emp:'e1',s:500,e:510,qty:30}],
  };
  const UI={date,factory:1},copied=[];
  const ctx={S,UI,DAY0:480,DAY1:1200,LUNCH_S:720,LUNCH_E:780,
    hm:n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'),
    shownMachines:()=>S.machines.filter(m=>inFactory(m,UI.factory)),occupiedWork,
    emp:id=>S.employees.find(e=>e.id===id),order:id=>S.orders.find(o=>o.id===id),
    stepName:()=> 'Cut',workName:a=>workCatalog(S).find(w=>w.id===a.workId)?.name,
    mdw:d=>d,copyText:t=>copied.push(t)};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  return {S,UI,ctx,copied,copy:()=>{ctx.copyDay();return copied.at(-1);}};
}
const cell=(text,time,column=1)=>text.split('\n').find(row=>row.startsWith(time+'\t'))?.split('\t')[column];

test('real copy-day action preserves three sequential jobs in one cell, sorted without source mutation',()=>{
  const f=fixture(),before=JSON.stringify(f.S),text=f.copy();
  assert.equal(f.copied.length,1);
  assert.equal(text,f.ctx.dayTSV());
  assert.equal(cell(text,'08:00'),'Alice FIRST Cut；Alice SECOND Cut；Alice INSPECT');
  assert.equal(text.split('\n').length,26,'one title, one header and 24 half-hour rows');
  for(const row of text.split('\n').slice(1))assert.equal(row.split('\t').length,2,'one equipment cell per row');
  assert.equal(JSON.stringify(f.S),before);
});

test('two production jobs remain visible without general work',()=>{
  const f=fixture();f.S.workAssignments=[];
  assert.equal(cell(f.copy(),'08:00'),'Alice FIRST Cut；Alice SECOND Cut');
});

test('exact slot boundaries neither duplicate ended jobs nor pull future jobs backward',()=>{
  const f=fixture();f.S.blocks.push({id:'next',date,m:'m1',emp:'e1',oid:'o3',s:510,e:540,qty:40});
  const text=f.copy();
  assert.equal(cell(text,'08:00'),'Alice FIRST Cut；Alice SECOND Cut；Alice INSPECT');
  assert.equal(cell(text,'08:30'),'Alice NEXT Cut');assert.equal(cell(text,'09:00'),'');
});

test('date and factory scope stay unchanged for production and equipment general work',()=>{
  const f=fixture();
  f.S.blocks.push({...f.S.blocks[0],id:'other-date',date:'2026-11-10',oid:'o3'},
    {...f.S.blocks[0],id:'other-factory',m:'m2',oid:'o3'});
  f.S.workAssignments.push({...f.S.workAssignments[0],id:'other-work-date',date:'2026-11-10'},
    {...f.S.workAssignments[0],id:'other-work-factory',resourceId:'m2'});
  const text=f.copy();assert.doesNotMatch(text,/NEXT|Machine 2/);
  assert.equal(cell(text,'08:00'),'Alice FIRST Cut；Alice SECOND Cut；Alice INSPECT');
  f.UI.factory=2;assert.equal(cell(f.copy(),'08:00'),'Alice NEXT Cut；Alice INSPECT');
  f.UI.factory='all';const all=f.copy();assert.equal(all.split('\n')[1],'時間\tm1 Machine 1\tm2 Machine 2');
  assert.equal(cell(all,'08:00',2),'Alice NEXT Cut；Alice INSPECT');
  f.UI.factory=1;f.UI.date='2026-11-10';assert.equal(cell(f.copy(),'08:00'),'Alice NEXT Cut；Alice INSPECT');
});

test('single-job, empty-cell, lunch and purely manual-work behavior are unchanged',()=>{
  const f=fixture();f.S.blocks=f.S.blocks.filter(b=>b.id==='b1');
  f.S.workAssignments[0].resourceId=null;
  const text=f.copy();assert.equal(cell(text,'08:00'),'Alice FIRST Cut');
  assert.equal(cell(text,'08:30'),'');assert.equal(cell(text,'12:00'),'午休');assert.equal(cell(text,'12:30'),'午休');
  assert.doesNotMatch(text,/INSPECT/);assert.match(text,/純人工見全部明細/);
});
