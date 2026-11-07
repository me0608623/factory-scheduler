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
  const ctx={S,occupiedCapacityIntervals,factoryOf,compatible,assignments,occupiedWork,overtimeAllowed,effectiveBlockQty,batchReadyMinute,quantityForMinutes,uid:()=>webcrypto.randomUUID()};
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


function faultPlans({qty=9,rate=.15,start=480,end=540,fault=510,machineCount=1}={}){
  const h=harness({qty,rate});
  h.ctx.S.blocks=[{id:'original',oid:h.S.orders[0].id,step:0,m:'m1',emp:'e1',date:day,s:start,e:end,qty,pin:false}];
  for(let i=2;i<=machineCount;i++){
    h.ctx.S.machines.push({...h.ctx.S.machines[0],id:'m'+i,faults:[]});h.ctx.S.employees[0].skills.push('m'+i);
  }
  h.ctx.nowAbs=()=>h.ctx.absOf(day,fault);
  Object.assign(h.ctx,{UI:{date:day,modal:{id:'m1',fs:fault,fd:30}},STORE:null,canIncidents:()=>true,captureFault:()=>{},syncInputs:()=>{},
    openPlans:(title,log,kind,ev,strategies)=>{h.result=h.ctx.buildPlans(ev,strategies,kind);}});
  const a=source.indexOf('  "m-fault":()=>{'),b=source.indexOf('  // 機台修好了',a);
  vm.runInContext('var handler={'+source.slice(a,b)+'};handler["m-fault"]();',h.ctx);
  assert.deepEqual(Array.from(h.result.opts,o=>o.id),['A','B','C','D']);
  return h;
}
function validPlans(h,qty,rate){
  for(const o of h.result.opts){
    const A=JSON.parse(o.state);
    assert.equal(A.blocks.reduce((n,b)=>n+b.qty,0),qty,o.id);
    for(const b of A.blocks){
      assert.ok(Number.isInteger(b.qty)&&b.qty>0,JSON.stringify(b));
      assert.ok(b.qty<=Math.floor((b.e-b.s)*rate+1e-8),JSON.stringify(b));
      assert.ok(!A.machines.find(m=>m.id===b.m).faults.some(f=>f.date===b.date&&f.s<b.e&&f.e>b.s));
    }
    assert.deepEqual(A.execution,[]); // Planned pieces are not actual production reports.
  }
}
test('fault handler produces capacity-safe integer pieces in all four strategies',()=>{
  const h=faultPlans();validPlans(h,9,.15);
  for(const o of h.result.opts)assert.deepEqual(JSON.parse(o.state).blocks.map(({s,e,qty})=>({s,e,qty})),[
    {s:480,e:510,qty:4},{s:540,e:580,qty:5}]);
});
test('zero-piece prefix is omitted and the whole planned quantity is rescheduled',()=>{
  const h=faultPlans({qty:1,rate:.02,end:530,fault:490});validPlans(h,1,.02);
  for(const o of h.result.opts)assert.deepEqual(JSON.parse(o.state).blocks.map(({s,e,qty})=>({s,e,qty})),[{s:520,e:570,qty:1}]);
});
test('splitAt reuses the original block when the prefix contains no whole pieces',()=>{
  const h=harness({qty:1,rate:.02}),b={id:'original',s:480,e:530,qty:1};h.ctx.S.blocks=[b];
  assert.equal(h.ctx.splitAt(b,490),b);assert.equal(b.id,'original');assert.equal(b.s,490);assert.equal(b.qty,1);
  assert.equal(h.ctx.S.blocks.length,1);
});
test('exact and near-end fractions preserve total quantity and nonempty tails',()=>{
  for(const [qty,rate,end,fault] of [[10,.2,540,510],[2,.1,500,499],[1,.1,490,489]]){
    const h=faultPlans({qty,rate,end,fault});validPlans(h,qty,rate);
  }
});
test('splitAt boundary no-ops leave the original block untouched',()=>{
  const h=harness(),b={id:'original',s:480,e:540,qty:9};h.ctx.S.blocks=[b];
  for(const t of [470,480,540,550]){assert.equal(h.ctx.splitAt(b,t),null);assert.deepEqual(b,{id:'original',s:480,e:540,qty:9});}
  assert.equal(h.ctx.S.blocks.length,1);
});
test('fault diff keeps the original unsplit block for restoration bookkeeping',()=>{
  for(const args of [{},{qty:1,rate:.02,end:530,fault:490},{machineCount:2},{machineCount:3}]){
    const h=faultPlans(args),B=JSON.parse(h.result.base);h.ctx.PV={B};
    vm.runInContext(source.slice(source.indexOf('function diffOf('),source.indexOf('function fmtDelta(')),h.ctx);
    for(const option of h.result.opts){
      const gone=h.ctx.diffOf({A:JSON.parse(option.state)}).gone;
      assert.equal(gone.length,1);assert.deepEqual(gone[0],B.blocks[0]);
      // The exact pvApply filter/map must retain original quantity and endpoints.
      const orig=gone.filter(b=>h.ctx.absOf(b.date,b.e)>h.ctx.nowAbs()).map(({oid,step,date,s,e,m,emp,qty})=>({oid,step,date,s,e,m,emp,qty}));
      assert.equal(orig[0].s,480);assert.equal(orig[0].e,args.end||540);assert.equal(orig[0].qty,args.qty||9);
    }
  }
});
test('running and done reports still protect both ordinary and zero-prefix splits',()=>{
  for(const args of [{},{qty:1,rate:.02,end:530,fault:490},{machineCount:2},{machineCount:3}]){
    const h=faultPlans(args);
    for(const status of ['running','done'])for(const option of h.result.opts){
      const B=JSON.parse(h.result.base),A=JSON.parse(option.state),r={blockId:'original',status,qtyDone:0};
      B.execution=[r];A.execution=[{...r}];
      assert.throws(()=>assertExecutionProtected(B,A),/已有現場回報/);
      assert.deepEqual(A.execution,B.execution);
    }
  }
});
test('valid repaired candidates survive actual LocalStore persistence',async()=>{
  const old=globalThis.localStorage;
  try{
    for(const args of [{},{qty:1,rate:.02,end:530,fault:490},{machineCount:2},{machineCount:3}]){
      const h=faultPlans(args);validPlans(h,args.qty||9,args.rate||.15);
      for(const option of h.result.opts){
        let memory=h.result.base;globalThis.localStorage={getItem:()=>memory,setItem:(key,value)=>{memory=value;}};
        const store=new LocalStore(),A=JSON.parse(option.state);await store.sync(A);assert.deepEqual((await store.load()).blocks,A.blocks);
      }
    }
  }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});

test('two and three machines cannot swap an over-capacity split tail into its old interval',()=>{
  for(const machineCount of [2,3]){
    const h=faultPlans({machineCount});validPlans(h,9,.15);
    for(const option of h.result.opts.filter(o=>['A','C'].includes(o.id))){
      const blocks=JSON.parse(option.state).blocks;
      assert.equal(blocks[0].qty,4);
      assert.deepEqual(blocks.slice(1).map(({s,e,qty,m})=>({s,e,qty,m})),[{s:510,e:550,qty:5,m:'m2'}]);
    }
  }
});
test('capacity-safe tails still use the original same-time machine swap',()=>{
  for(const machineCount of [2,3]){
    const h=faultPlans({qty:10,rate:.2,machineCount});validPlans(h,10,.2);
    for(const option of h.result.opts.filter(o=>['A','C'].includes(o.id))){
      assert.deepEqual(JSON.parse(option.state).blocks.slice(1).map(({s,e,qty,m})=>({s,e,qty,m})),[{s:510,e:540,qty:5,m:'m2'}]);
      assert.equal(option.lines[0].k,'mach');
    }
  }
});

test('pre-existing rounded-down prefix also requires a longer swapped remainder',()=>{
  // Even Math.round produced prefix5/tail8 here; 60 minutes at .13 only holds7.
  for(const machineCount of [2,3]){
    const h=faultPlans({qty:13,rate:.13,end:580,fault:520,machineCount});validPlans(h,13,.13);
    for(const option of h.result.opts.filter(o=>['A','C'].includes(o.id))){
      assert.deepEqual(JSON.parse(option.state).blocks.map(({s,e,qty})=>({s,e,qty})),[
        {s:480,e:520,qty:5},{s:520,e:590,qty:8}]);
    }
  }
});
