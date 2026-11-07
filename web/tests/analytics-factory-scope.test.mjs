import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as factory from '../src/factory.js';
import {groupedEmployees} from '../src/groups.js';
import {effectiveBlockQty} from '../src/manual.js';
import {tx} from '../src/i18n.js';

// Execute the actual renderer and its selectors, without app startup or network access.
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function pick(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a);
  assert.ok(a>=0&&b>a,`source boundary: ${start}`);
  return source.slice(a,b);
}
const renderer=pick('function analyticsPageHTML(){','/* ---------- 三表共用填寫窗');
const helpers=pick('function setFactory(n)','// 畫面縮放')+
  pick('function parseD(ds)','function dayNum(ds)')+pick('function md(ds)','const WD_EN=')+
  pick('function orderStatus(o){','function lateCheck(lines)');
function fixture(){
  return {machines:[1,2].map(f=>({id:'M'+f,label:'Factory '+f,factory:f,proc:'cut',products:['P'+f]})),
    employees:[1,2].map(f=>({id:'E'+f,name:'Worker '+f,factory:f,skills:['M'+f],leaves:[]})),
    products:[1,2].map(f=>({id:'P'+f,steps:[{proc:'cut',factory:f}]})),
    orders:[1,2].map(f=>({id:'O'+f,pid:'P'+f,qty:1000,due:'2026-11-30',pri:1})),dayOT:{},blocks:[]};
}
const block=(f,date,s=480,e=540)=>({id:`${f}-${date}-${s}`,m:'M'+f,emp:'E'+f,oid:'O'+f,step:0,date,s,e,qty:e-s});
const own=f=>[block(f,'2026-11-02',480,720),block(f,'2026-11-02',780,1020)];
function render(S,selected,body=renderer){
  for(const b of S.blocks){
    const o=S.orders.find(o=>o.id===b.oid),p=S.products.find(p=>p.id===o.pid);
    assert.ok(factory.compatible(S.employees.find(e=>e.id===b.emp),S.machines.find(m=>m.id===b.m),p,p.steps[b.step]),'valid same-factory fixture');
  }
  const before=structuredClone(S);
  const context=vm.createContext({S,UI:{factory:1,group:'all'},...factory,groupedEmployees,tx,effectiveBlockQty,
    pad:n=>String(n).padStart(2,'0'),todayStr:()=> '2026-11-07',esc:x=>String(x),localStorage:{setItem(){}},
    prod:id=>S.products.find(p=>p.id===id),sum:(a,f)=>a.reduce((n,x)=>n+f(x),0)});
  vm.runInContext(helpers+body,context);
  vm.runInContext(`setFactory(${JSON.stringify(selected)})`,context);
  const html=vm.runInContext('analyticsPageHTML()',context);
  assert.deepEqual(S,before,'renderer must not mutate source state');
  return html;
}
function metrics(html){
  return {subtitle:html.match(/class="page-sub">([^<]+)/)[1],
    percent:[...html.matchAll(/class="ana-val">(\d+)%/g)].map(m=>+m[1]),
    month:+html.match(/<b>(\d+)<\/b><span>本月排程段/)[1],
    daily:Object.fromEntries([...html.matchAll(/title="(\d{4}-\d{2}-\d{2}): (\d+)"/g)].map(m=>[m[1],+m[2]]))};
}
for(const selected of [1,2]){
  for(const date of ['2026-11-02','2026-11-03'])test(`factory ${selected}: unrelated factory work on ${date} leaves entire renderer unchanged`,()=>{
    const S=fixture();S.blocks=own(selected);const before=render(S,selected);
    assert.deepEqual(metrics(before).percent,[94]);
    S.blocks.push(block(3-selected,date));
    assert.equal(render(S,selected),before);
  });
  test(`factory ${selected}: unrelated-only activity is an empty selected schedule`,()=>{
    const S=fixture();const empty=render(S,selected);
    S.blocks=own(3-selected);assert.equal(render(S,selected),empty);
    const m=metrics(empty);assert.equal(m.month,0);assert.deepEqual(m.percent,[0]);
    assert.ok(Object.values(m.daily).every(n=>n===0));assert.match(m.subtitle,/1 個工作天 · 1 位員工 · 1 台設備/);
  });
  test(`factory ${selected}: month and inclusive fourteen-day boundaries remain distinct`,()=>{
    const S=fixture();
    const dates=['2026-10-24','2026-10-25','2026-10-31','2026-11-01','2026-11-07','2026-11-08'];
    S.blocks=dates.map(d=>block(selected,d));const before=render(S,selected);
    S.blocks.push(...dates.map(d=>block(3-selected,d)));
    const html=render(S,selected);assert.equal(html,before);
    const m=metrics(html);assert.equal(m.month,2);assert.deepEqual(m.percent,[12]);
    assert.equal(Object.keys(m.daily).length,14);assert.equal(m.daily['2026-10-24'],undefined);
    for(const d of ['2026-10-25','2026-10-31','2026-11-01','2026-11-07'])assert.equal(m.daily[d],1);
    assert.equal(m.daily['2026-11-08'],undefined);
  });
}
test('legacy missing/invalid factory metadata still belongs to factory 1',()=>{
  const S=fixture();S.blocks=[...own(1),block(2,'2026-11-03')];
  const before=render(S,1);delete S.machines[0].factory;S.employees[0].factory='legacy';delete S.products[0].steps[0].factory;
  assert.equal(render(S,1),before);assert.equal(metrics(render(S,2)).month,1);
});
test('no selected machines yields no selected schedule counts',()=>{
  const S=fixture();S.blocks=own(2);S.machines=S.machines.filter(m=>m.factory===2);
  const m=metrics(render(S,1));assert.equal(m.month,0);assert.deepEqual(m.percent,[]);
  assert.ok(Object.values(m.daily).every(n=>n===0));
});
test('valid employee overtime and selected resources/order states keep existing semantics',()=>{
  const S=fixture();S.dayOT['2026-11-02']=1080;S.blocks=[...own(1),block(1,'2026-11-02',1020,1140)];
  const before=render(S,1);assert.match(before,/Worker 1<\/span><span class="ana-val ot">1 小時/);
  S.blocks.push(block(2,'2026-11-03',1020,1140));assert.equal(render(S,1),before);
});
test('cross-factory output remains byte-identical to pre-fix renderer',()=>{
  // Only the two original schedule input expressions differ in this control.
  const unscoped=renderer.replace('const mBlocks=scopeBlocks.filter','const mBlocks=S.blocks.filter')
    .replace('const cnt=scopeBlocks.filter','const cnt=S.blocks.filter');
  const S=fixture();S.blocks=[...own(1),block(2,'2026-11-02'),block(2,'2026-11-03'),block(2,'2026-10-25'),block(1,'2026-11-08')];
  const html=render(S,'all');assert.equal(html,render(S,'all',unscoped));
  const m=metrics(html);assert.equal(m.month,4);assert.deepEqual(m.percent,[47,12]);
  assert.equal(m.daily['2026-11-02'],3);assert.equal(m.daily['2026-11-03'],1);assert.equal(m.daily['2026-10-25'],1);
});
