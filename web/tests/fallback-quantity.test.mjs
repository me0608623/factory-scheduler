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
import {effectiveBlockQty,batchReadyMinute,quantityForMinutes,materialFlowIssue} from '../src/manual.js';

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
  assert.deepEqual(imported.errors,[]);
  const S={...imported.data,blocks:[],cal:{week:[false,true,true,true,true,true,true],over:{}},dayOT:{},execution:[]};
  const ctx={S,occupiedCapacityIntervals,factoryOf,compatible,assignments,occupiedWork,overtimeAllowed,effectiveBlockQty,batchReadyMinute,quantityForMinutes,materialFlowIssue,uid:()=>webcrypto.randomUUID()};
  vm.createContext(ctx);
  // Run the actual app engine, rather than a second implementation of it.
  vm.runInContext(`const DAY0=480,LUNCH_S=720,LUNCH_E=780,REG_END=1020,DAY1=1200,HORIZON=60,HOLI={};const pad=n=>String(n).padStart(2,'0');const sum=(a,f)=>a.reduce((t,x)=>t+f(x),0);`+
    source.slice(source.indexOf('function parseD('),source.indexOf('function todayStr('))+
    source.slice(source.indexOf('function mergeIv('),source.indexOf('/* ===== 2.'))+
    source.slice(source.indexOf('const emp=id'),source.indexOf('function dayLabel('))+
    source.slice(source.indexOf('function capacityIntervals('),source.indexOf('// 只重排一張工單')),ctx);
  return {ctx,S,run:(minute=690)=>ctx.autoPlan(ctx.absOf(day,minute))};
}
function valid(h,qty,step=0,{grid=true}={}){
  const blocks=h.S.blocks.filter(b=>b.step===step);
  assert.equal(blocks.reduce((n,b)=>n+b.qty,0),qty);
  for(const b of blocks){
    const rate=h.S.products[0].steps[step].rate;
    assert.ok(Number.isInteger(b.qty)&&b.qty>0);
    assert.ok(b.qty<=Math.floor((b.e-b.s)*rate+1e-8),JSON.stringify(b));
    assert.ok(h.ctx.dayInfo(b.date).win.some(w=>b.s>=w.s&&b.e<=w.e));
    if(grid){assert.equal(b.s%10,0);assert.equal(b.e%10,0);}
    assert.ok(!h.S.machines.find(m=>m.id===b.m).faults.some(f=>f.date===b.date&&f.s<b.e&&f.e>b.s));
  }
  return blocks.map(({date,s,e,qty})=>({date,s,e,qty}));
}
test('Excel decimal-rate order gets integer-capacity-safe lunch segments without losing pieces',()=>{
  for(const qty of [9,10]){
    const h=harness({qty});assert.equal(h.run().length,0);
    assert.deepEqual(valid(h,qty),[{date:day,s:690,e:720,qty:4},{date:day,s:780,e:820,qty:qty-4}]);
  }
});
test('exact decimal boundaries and whole-piece rates retain their duration',()=>{
  for(const [qty,rate,end] of [[21,.7,720],[22,.7,790],[90,1.5,810],[1,2,700]]){
    const h=harness({qty,rate});assert.equal(h.run().length,0);valid(h,qty);assert.equal(h.S.blocks.at(-1).e,end);
  }
});
test('fractional capacity lost at a fault split is recovered in later free time',()=>{
  const h=harness({qty:9});h.S.machines[0].faults=[{date:day,s:510,e:540}];
  assert.equal(h.run(480).length,0);
  assert.deepEqual(valid(h,9),[{date:day,s:480,e:510,qty:4},{date:day,s:540,e:580,qty:5}]);
});
test('non-grid fault boundaries retain their endpoints and whole-piece capacity',()=>{
  const h=harness({qty:9});h.S.machines[0].faults=[{date:day,s:515,e:545}];
  assert.equal(h.run(480).length,0);
  assert.deepEqual(valid(h,9,0,{grid:false}),[{date:day,s:480,e:515,qty:5},{date:day,s:545,e:575,qty:4}]);
});
test('zero-piece fragments are skipped and do not consume needed work',()=>{
  const h=harness({qty:1,rate:.02});assert.equal(h.run().length,0);
  assert.deepEqual(valid(h,1),[{date:day,s:780,e:830,qty:1}]);
});
test('small gaps stay unused unless they can finish the remaining pieces',()=>{
  const h=harness({qty:9});assert.equal(h.run(700).length,0);
  assert.deepEqual(valid(h,9),[{date:day,s:780,e:840,qty:9}]);
});
test('remaining integer pieces continue next day without extending past a work window',()=>{
  const h=harness({qty:9});assert.equal(h.run(990).length,0);
  assert.deepEqual(valid(h,9),[{date:day,s:990,e:1020,qty:4},{date:'2026-11-10',s:480,e:520,qty:5}]);
});
test('horizon exhaustion does not return a partial or over-capacity schedule',()=>{
  const h=harness({qty:1,rate:.001});assert.equal(h.run().length,1);assert.equal(h.S.blocks.length,0);
});
test('repeated zero-capacity 30-minute windows never accumulate fractional pieces',()=>{
  const h=harness({qty:1,rate:.01});
  for(let i=0;i<60;i++){
    const date=h.ctx.addDays(day,i);
    h.S.machines[0].faults.push({date,s:510,e:720},{date,s:780,e:1020});
  }
  assert.equal(h.run(480).length,1);assert.equal(h.S.blocks.length,0);
});
test('machine selection scores actual integer-piece completion rather than theoretical minutes',()=>{
  const h=harness();h.S.machines.push({...h.S.machines[0],id:'m2',faults:[]});h.S.employees[0].skills.push('m2');
  h.S.machines[0].faults=[{date:day,s:810,e:840}];
  assert.equal(h.run().length,0);valid(h,9);assert.ok(h.S.blocks.every(b=>b.m==='m2'));
});
test('downstream full and batch handoff remain valid after quantity-aware splitting',()=>{
  for(const batch of [0,4]){
    const h=harness();h.S.products[0].steps.push({proc:'包裝',factory:1,rate:.15,batch});
    h.S.machines.push({id:'m2',proc:'包裝',factory:1,products:['p1'],faults:[]});
    h.S.employees.push({id:'e2',name:'Pack',skills:['m2'],maxMachines:1,leaves:[],noOT:false});
    assert.equal(h.run().length,0);valid(h,9,0);valid(h,9,1);
    assert.equal(materialFlowIssue(h.S.blocks,h.S.orders[0].id,1,h.ctx.absOf),false);
  }
});
