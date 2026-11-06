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

const source=readFileSync(process.env.FLOW_APP_SOURCE||new URL('../src/app.js',import.meta.url),'utf8');
const day='2026-11-09';
function harness({qty=240,rate=1,downRate=2,batch=30}={}){
  const wb=new ExcelJS.Workbook();
  for(const [name,headers] of Object.entries(IMPORT_HEADERS))wb.addWorksheet(name).addRow(headers);
  wb.getWorksheet('員工').addRow(['e1','Worker',1,'m1','否','']);
  wb.getWorksheet('機台').addRow(['m1','Machine','裁切','p1']);
  wb.getWorksheet('產品工序').addRow(['p1','Product',1,'裁切',rate,0]);
  wb.getWorksheet('員工').addRow(['e2','Pack',1,'m2','否','']);
  wb.getWorksheet('機台').addRow(['m2','Packaging','包裝','p1']);
  wb.getWorksheet('產品工序').addRow(['p1','Product',2,'包裝',downRate,batch]);
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
    source.slice(source.indexOf('function capacityIntervals('),source.indexOf('/* ----- 局部調整')),ctx);
  return {ctx,S,run:(minute=690)=>ctx.autoPlan(ctx.absOf(day,minute))};
}


function block(h,step,s,e,qty,extra={}){return {id:webcrypto.randomUUID(),oid:h.S.orders[0].id,step,m:step?'m2':'m1',emp:step?'e2':'e1',date:day,s,e,qty,pin:false,...extra};}
function flow(h){return materialFlowIssue(h.S.blocks,h.S.orders[0].id,1,h.ctx.absOf,h.S.execution);}
test('Excel-imported batch order does not overtake upstream before downstream fault',()=>{
  const h=harness();h.S.machines[1].faults=[{date:day,s:600,e:780}];
  assert.equal(h.run(480).length,0);assert.equal(flow(h),false);
  assert.deepEqual(h.S.blocks.filter(b=>b.step===1).map(b=>[b.s,b.e,b.qty]),[[780,900,240]]);
});
test('safe batch overlap is retained rather than serializing every downstream step',()=>{
  const h=harness({downRate:1});assert.equal(h.run(480).length,0);assert.equal(flow(h),false);
  assert.equal(h.S.blocks.find(b=>b.step===1).s,510);
});
test('done shortfall uses actual output and returns explicit failure, not planned supply',()=>{
  const h=harness();const b=block(h,0,480,720,240,{pin:true});h.S.blocks.push(b);
  h.S.execution.push({blockId:b.id,status:'done',qtyDone:120});
  assert.equal(h.ctx.placeJob(h.S.orders[0].id,1,240,h.ctx.absOf(day,780)),null);
});
test('completed upstream production permits a safe downstream candidate',()=>{
  const h=harness();const b=block(h,0,480,720,240,{pin:true});h.S.blocks.push(b);
  h.S.execution.push({blockId:b.id,status:'done',qtyDone:240});
  const next=h.ctx.placeJob(h.S.orders[0].id,1,240,h.ctx.absOf(day,780));
  assert.ok(next);h.S.blocks.push(...next);assert.equal(flow(h),false);
});
test('retained downstream work participates in the cumulative check',()=>{
  const h=harness();h.S.blocks.push(block(h,0,480,720,240),block(h,1,510,600,180,{pin:true}));
  assert.equal(h.ctx.placeJob(h.S.orders[0].id,1,60,h.ctx.absOf(day,780)),null);
});
test('excluded downstream work is not double counted; retained work remains intact',()=>{
  const h=harness();const prev=block(h,0,480,720,240),old=block(h,1,510,600,180);
  h.S.blocks.push(prev,old);const before=JSON.stringify(h.S);
  const next=h.ctx.placeJob(h.S.orders[0].id,1,240,h.ctx.absOf(day,780),{ex:new Set([old.id])});
  assert.ok(next);assert.equal(JSON.stringify(h.S),before);
  assert.equal(materialFlowIssue([prev,...next],prev.oid,1,h.ctx.absOf),false);
});
test('excluded upstream work cannot supply material or the initial transfer batch',()=>{
  const h=harness();const prev=block(h,0,480,720,240);h.S.blocks.push(prev);
  assert.equal(h.ctx.placeJob(prev.oid,1,240,h.ctx.absOf(day,780),{ex:new Set([prev.id])}),null);
});
test('safe fallback exhaustion returns null without changing retained blocks',()=>{
  const h=harness();h.S.blocks.push(block(h,0,480,720,240));
  for(let i=0;i<61;i++)h.S.machines[1].faults.push({date:h.ctx.addDays(day,i),s:i?480:600,e:1200});
  const before=JSON.stringify(h.S);
  assert.equal(h.ctx.placeJob(h.S.orders[0].id,1,240,h.ctx.absOf(day,510)),null);
  assert.equal(JSON.stringify(h.S),before);
});
test('retained done downstream quantity uses the report rather than its planned quantity',()=>{
  const h=harness();const prev=block(h,0,480,720,240),done=block(h,1,510,600,180,{pin:true});
  h.S.blocks.push(prev,done);h.S.execution.push({blockId:done.id,status:'done',qtyDone:60});
  const next=h.ctx.placeJob(prev.oid,1,180,h.ctx.absOf(day,780));
  assert.ok(next);h.S.blocks.push(...next);assert.equal(flow(h),false);
});
test('autoPlan reports failure when pinned material violation cannot be repaired',()=>{
  const h=harness();h.S.blocks.push(block(h,0,480,720,240,{pin:true}),block(h,1,510,600,180,{pin:true}));
  const before=JSON.stringify(h.S.blocks);assert.ok(h.run(480).length>0);
  assert.equal(JSON.stringify(h.S.blocks),before);
});
test('unsafe candidates are rejected after at most two candidate searches without modifying state',()=>{
  const h=harness();const prev=block(h,0,480,720,240);h.S.blocks.push(prev);
  let calls=0;h.ctx.placeJobCandidate=()=>{calls++;return [block(h,1,510,600,240)];};
  assert.equal(h.ctx.placeJob(prev.oid,1,240,h.ctx.absOf(day,510)),null);assert.equal(calls,2);
  assert.equal(h.S.blocks.length,1);
});

for(const method of ['autoPlan','planOrder']){
  test(`${method} rolls back new upstream work that overtakes a fully pinned downstream step`,()=>{
    const h=harness();const pinned=block(h,1,510,630,240,{pin:true});h.S.blocks.push(pinned);
    const run=()=>method==='autoPlan'?h.ctx.autoPlan(h.ctx.absOf(day,480)):h.ctx.planOrder(pinned.oid,h.ctx.absOf(day,480));
    const fails=run();assert.ok(fails.some(x=>x.includes('前站累積產量不足')));
    assert.equal(h.ctx.S.blocks.length,1);assert.equal(h.ctx.S.blocks[0],pinned);
  });
  test(`${method} reports existing retained material violation without deleting pins`,()=>{
    const h=harness();const up=block(h,0,480,720,240,{pin:true}),down=block(h,1,510,630,240,{pin:true});h.S.blocks.push(up,down);
    const fails=method==='autoPlan'?h.ctx.autoPlan(h.ctx.absOf(day,480)):h.ctx.planOrder(up.oid,h.ctx.absOf(day,480));
    assert.ok(fails.length>0);assert.equal(h.ctx.S.blocks.length,2);
    assert.equal(h.ctx.S.blocks[0],up);assert.equal(h.ctx.S.blocks[1],down);
  });
}
test('rollback preserves a previously planned order and pinned done block/report identities',()=>{
  const h=harness(),first=h.S.orders[0];
  const second={...first,id:webcrypto.randomUUID(),code:'Second',pri:2};h.S.orders.push(second);
  const pinned=block(h,1,510,630,240,{oid:second.id,pin:true});h.S.blocks.push(pinned);
  const report={blockId:pinned.id,status:'done',qtyDone:240};h.S.execution.push(report);
  const fails=h.run(480);assert.ok(fails.some(x=>x.startsWith('Second')));
  for(const step of [0,1])assert.equal(h.S.blocks.filter(b=>b.oid===first.id&&b.step===step).reduce((n,b)=>n+b.qty,0),240);
  assert.equal(materialFlowIssue(h.S.blocks,first.id,1,h.ctx.absOf,h.S.execution),false);
  assert.equal(h.S.blocks.filter(b=>b.oid===second.id).length,1);
  assert.equal(h.S.blocks.find(b=>b.id===pinned.id),pinned);assert.equal(h.S.execution[0],report);
});
