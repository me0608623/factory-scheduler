import {LocalStore} from '../src/store/local.js';
import {assertExecutionProtected} from '../src/execution.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import ExcelJS from 'exceljs';
import {IMPORT_HEADERS,parseImportWorkbook} from '../src/excel.js';
import {capacityIntervals as occupiedCapacityIntervals} from '../src/capacity.js';
import {factoryOf,compatible} from '../src/factory.js';
import {assignments,occupiedWork} from '../src/general-work.js';
import {overtimeAllowed} from '../src/overtime.js';
import * as manual from '../src/manual.js';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const day='2026-11-09';
function harness({qty=9,rate=.15}={}){
  const wb=new ExcelJS.Workbook();
  for(const [name,headers] of Object.entries(IMPORT_HEADERS))wb.addWorksheet(name).addRow(headers);
  wb.getWorksheet('員工').addRow(['e1','Worker',1,'m1','否','']);
  wb.getWorksheet('機台').addRow(['m1','Machine','裁切','p1']);
  wb.getWorksheet('產品工序').addRow(['p1','Product',1,'裁切',rate,0]);
  wb.getWorksheet('工單').addRow(['Decimal','p1',qty,day,1]);
  const old=globalThis.crypto;
  if(!old)globalThis.crypto=webcrypto;
  let imported;
  try{imported=parseImportWorkbook(wb);}finally{if(!old)delete globalThis.crypto;}
  equal(imported.errors,[]);
  const S={...imported.data,blocks:[],cal:{week:[false,true,true,true,true,true,true],over:{}},dayOT:{},execution:[]};
  const ctx={S,occupiedCapacityIntervals,factoryOf,compatible,assignments,occupiedWork,overtimeAllowed,...manual,uid:()=>webcrypto.randomUUID()};
  vm.createContext(ctx);
  // Run the actual app engine, rather than a second implementation of it.
  vm.runInContext(`const DAY0=480,LUNCH_S=720,LUNCH_E=780,REG_END=1020,DAY1=1200,HORIZON=60,HOLI={};const pad=n=>String(n).padStart(2,'0');const sum=(a,f)=>a.reduce((t,x)=>t+f(x),0);`+
    source.slice(source.indexOf('function parseD('),source.indexOf('function todayStr('))+
    source.slice(source.indexOf('function mergeIv('),source.indexOf('/* ===== 2.'))+
    source.slice(source.indexOf('const emp=id'),source.indexOf('function dayLabel('))+
    source.slice(source.indexOf('function capacityIntervals('),source.indexOf('const STRAT_ORDER=')),ctx);
  vm.runInContext(source.slice(source.indexOf('function cascade('),source.indexOf('// 檢查單一方塊')),ctx);
  Object.assign(ctx,{console,performance,tx:x=>x,executionOf:(s,id)=>s.execution.find(r=>r.blockId===id),mdw:x=>x,hm:x=>String(x),md:x=>x,stepName:()=> 'Cut',nowAbs:()=>ctx.absOf(day,510)});
  return {ctx,S};
}
const clone=x=>JSON.parse(JSON.stringify(x));
const byId=blocks=>clone(blocks).sort((a,b)=>a.id.localeCompare(b.id));
const equal=(a,b,message)=>assert.deepEqual(clone(a),clone(b),message);
function checkSchedule(S){
  for(const b of S.blocks){
    assert.ok(Number.isInteger(b.qty)&&b.qty>0);
    const O=S.orders.find(o=>o.id===b.oid),rate=S.products.find(p=>p.id===O.pid).steps[b.step].rate;
    assert.ok(b.qty<=Math.floor((b.e-b.s)*rate+1e-8));
    assert.ok(!S.machines.find(m=>m.id===b.m).faults.some(f=>f.date===b.date&&f.s<b.e&&f.e>b.s));
    for(const a of S.blocks)if(a.id!==b.id&&a.date===b.date&&a.s<b.e&&a.e>b.s){
      assert.notEqual(a.m,b.m,'machine overlap');
      assert.notEqual(a.emp,b.emp,'employee overlap'); // Fixture employees each have maxMachines=1.
    }
  }
  for(const o of S.orders)assert.equal(S.blocks.filter(b=>b.oid===o.id).reduce((n,b)=>n+b.qty,0),o.qty);
}
function setup(){
  const h=harness({qty:3,rate:.1}),c=h.ctx,oid=h.S.orders[0].id;
  c.nowAbs=()=>c.absOf(day,480);
  c.S.cal={week:[false,false,false,false,false,false,false],over:{[day]:'work'}};
  c.S.blocks=[{id:'old-first',oid,step:0,m:'m1',emp:'e1',date:day,s:490,e:500,qty:1,pin:false},
    {id:'old-second',oid,step:0,m:'m1',emp:'e1',date:day,s:500,e:520,qty:2,pin:false}];
  const store=new LocalStore();
  // LocalStore's actual validations and serialization run against isolated in-memory storage.
  let saved=JSON.stringify(c.S);
  c.storage={getItem:()=>saved,setItem:(k,v)=>{saved=v;}};
  c.saved=()=>JSON.parse(saved);
  Object.assign(c,{UI:{date:day},STORE:store,assertExecutionProtected,canIncidents:()=>true,canPermissionRaw:()=>true,
    captureFault:()=>{},syncInputs:()=>{},pushUndo:()=>{},closeModal:()=>{},toast:()=>{},showResult:()=>{},
    todayStr:()=>day,nowMin:()=>480,$:()=>null,pvOpt:()=>c.PV.opts[0],pvSummary:()=>'',peopleOf:()=>[],
    commit:()=>{c.lastSave=store.sync(c.S).then(()=>true);return c.lastSave;},
    openPlans:(title,logTitle,kind,ev,strategies,extra)=>{
      const built=c.buildPlans(ev,strategies.filter(s=>s.id===(kind==='fault'?'D':'A')),kind);
      c.PV={...built,...extra,B:JSON.parse(built.base),kind,title,logTitle,
        opts:built.opts.map(o=>({...o,A:JSON.parse(o.state)}))};
    }});
  vm.runInContext(source.slice(source.indexOf('const STRAT_RECOVER='),source.indexOf('// 下游工序連動')),c);
  vm.runInContext(source.slice(source.indexOf('function diffOf('),source.indexOf('function fmtDelta(')),c);
  vm.runInContext(source.slice(source.indexOf('async function pvApply(){'),source.indexOf('Object.assign(MODAL_ACT,{',source.indexOf('async function pvApply(){'))),c);
  const a=source.indexOf('  "m-fault":()=>{'),b=source.indexOf('  "m-mach-save":',a);
  vm.runInContext('var handlers={'+source.slice(a,b)+'};',c);
  c.fault=(start,duration)=>{
    c.UI.modal={id:'m1',fs:start,fd:duration};
    vm.runInContext('handlers["m-fault"]();',c);
  };
  c.recover=()=>{
    c.UI.modal={id:'m1'};vm.runInContext('handlers["m-fix"]({dataset:{v:"0"}});',c);
    assert.equal(c.PV.opts.length,1);return c.PV.opts[0];
  };
  return c;
}
async function withLocal(fn){
  const old=globalThis.localStorage,c=setup();globalThis.localStorage=c.storage;
  try{return await fn(c);}finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
}
async function adoptFirstFault(c){
  checkSchedule(c.S);
  const original=clone(c.S.blocks);
  c.fault(510,10); // Actual handler and optimizer consolidate both pieces before the future outage.
  assert.equal(c.PV.opts.length,1);
  await c.pvApply(); // Actual adoption records F.orig and persists via LocalStore.
  assert.equal(c.S.blocks.length,c.S.orders.length);
  equal(c.S.blocks.filter(b=>b.oid===c.S.orders[0].id).map(({s,e,qty})=>({s,e,qty})),[{s:480,e:510,qty:3}]);
  equal(c.S.machines[0].faults[0].orig,original.map(({oid,step,date,s,e,m,emp,qty})=>({oid,step,date,s,e,m,emp,qty})));
  equal(c.saved().blocks,c.S.blocks);checkSchedule(c.S);
}
async function addBlockingFault(c,duration=690){
  // The current block ends at 08:30, so this actual no-affected-work handler commits directly.
  c.fault(510,duration);await c.lastSave;
  assert.equal(c.S.machines[0].faults.length,2);checkSchedule(c.S);
}

test('actual fault adoption and recovery roll back a failed partial restoration exactly',async()=>withLocal(async c=>{
  await adoptFirstFault(c);await addBlockingFault(c);
  const before=clone(c.S),option=c.recover();
  assert.match(option.lines[0].t,/排不回去，維持原樣/);
  equal(option.A.blocks,before.blocks,'no provisional pieces survive the failed group');
  equal(c.S,before,'preview does not mutate live state');
  checkSchedule(option.A);
  await c.pvApply();
  equal(c.S.blocks,before.blocks);
  equal(c.saved().blocks,before.blocks);
  assert.equal(c.saved().machines[0].faults.length,1,'only the cancelled fault is removed');
}));

for(const status of [null,'running','done'])test(`rollback preserves unrelated ${status||'pinned'} work byte for byte`,async()=>withLocal(async c=>{
  await adoptFirstFault(c);await addBlockingFault(c);
  const o={...c.S.orders[0],id:'unrelated',code:'Other',pid:'p2',qty:1};c.S.orders.push(o);
  c.S.products.push({...c.S.products[0],id:'p2'});
  c.S.machines.push({...c.S.machines[0],id:'m2',products:['p2'],faults:[]});
  c.S.employees.push({...c.S.employees[0],id:'e2',skills:['m2']});
  const protectedBlock={id:'reported',oid:o.id,step:0,m:'m2',emp:'e2',date:day,s:480,e:490,qty:1,pin:true};
  c.S.blocks.push(protectedBlock);
  c.S.execution=status?[{blockId:'reported',status,qtyDone:status==='done'?1:0}]:[];
  // Establish already-reported fixture state; ordinary sync must never introduce execution records.
  c.storage.setItem('',JSON.stringify(c.S));
  const before=clone(c.S),option=c.recover();
  equal(byId(option.A.blocks),byId(before.blocks));
  equal(option.A.execution,before.execution);
  assert.doesNotThrow(()=>assertExecutionProtected(before,option.A));checkSchedule(option.A);
  await c.pvApply();equal(byId(c.saved().blocks),byId(before.blocks));equal(c.saved().execution,before.execution);
}));

test('successful all-original restoration still restores both original slots',async()=>withLocal(async c=>{
  await adoptFirstFault(c);
  const option=c.recover();checkSchedule(option.A);
  equal(option.A.blocks.map(({s,e,qty})=>({s,e,qty})),[{s:490,e:500,qty:1},{s:500,e:520,qty:2}]);
  assert.ok(!option.lines.some(l=>l.k==='fail'));
  await c.pvApply();equal(c.saved().blocks,option.A.blocks);
}));

test('partial-original restoration keeps successful fallback pieces',async()=>withLocal(async c=>{
  await adoptFirstFault(c);await addBlockingFault(c,30);
  const option=c.recover();checkSchedule(option.A);
  equal(option.A.blocks.map(({s,e,qty})=>({s,e,qty})),[{s:490,e:500,qty:1},{s:540,e:560,qty:2}]);
  assert.ok(!option.lines.some(l=>l.k==='fail'));
  await c.pvApply();equal(c.saved().blocks,option.A.blocks);
}));


test('a failed group does not remove another group successfully restored earlier',async()=>withLocal(async c=>{
  const o={...c.S.orders[0],id:'other-group',code:'Other',pid:'p2',qty:1};c.S.orders.push(o);
  c.S.products.push({...c.S.products[0],id:'p2'});
  c.S.machines.push({...c.S.machines[0],id:'m2',products:['p2'],faults:[]});
  c.S.employees.push({...c.S.employees[0],id:'e2',skills:['m2']});
  // Both original slots start at 08:10; stable ordering restores this first-listed group first.
  // Optimization moves it to 08:00, so real diffOf includes it in F.orig.
  c.S.blocks.unshift({id:'other-original',oid:o.id,step:0,m:'m2',emp:'e2',date:day,s:490,e:500,qty:1,pin:false});
  c.storage.setItem('',JSON.stringify(c.S));
  await adoptFirstFault(c);await addBlockingFault(c);
  const before=clone(c.S),option=c.recover();
  const first=before.orders[0].id;
  equal(option.A.blocks.filter(b=>b.oid===first),before.blocks.filter(b=>b.oid===first));
  const other=option.A.blocks.filter(b=>b.oid===o.id);
  assert.equal(other.length,1);
  equal(other.map(({s,e,qty})=>({s,e,qty})),[{s:490,e:500,qty:1}]);
  assert.notEqual(other[0].id,before.blocks.find(b=>b.oid===o.id).id,'successful group keeps its new restoration block');
  checkSchedule(option.A);await c.pvApply();equal(c.saved().blocks,option.A.blocks);
}));
