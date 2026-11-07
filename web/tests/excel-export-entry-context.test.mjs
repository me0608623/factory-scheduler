import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ExcelJS from 'exceljs';
import {scheduleXlsx} from '../src/excel.js';
import {assignments,workCatalog} from '../src/general-work.js';
import {inFactory} from '../src/factory.js';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const start=source.indexOf('"x-xlsx":async()=>{'),end=source.indexOf('"x-template":',start);
assert.ok(start>=0&&end>start,'actual export action exists');
const code='const actions={'+source.slice(start,end).replace('await import("./excel.js")','await loadExcel()')+'};this.exportXlsx=actions["x-xlsx"];';
const date='2026-11-09',later='2026-11-10';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const state=()=>({
  employees:[{id:'e1',name:'Alice',factory:1,color:0},{id:'e2',name:'Bob',factory:2,color:1}],
  machines:[{id:'m1',label:'Machine One',factory:1},{id:'m2',label:'Machine Two',factory:2}],
  products:[{id:'p1',name:'Product One',steps:[{proc:'Cut',factory:1}]}],
  orders:[{id:'o1',code:'ORDER-ONE',pid:'p1'}],
  blocks:[
    {id:'b1',oid:'o1',step:0,m:'m1',emp:'e1',date,s:480,e:490,qty:10,pin:false},
    {id:'b2',oid:'o1',step:0,m:'m2',emp:'e2',date,s:480,e:490,qty:20,pin:false},
    {id:'b3',oid:'o1',step:0,m:'m1',emp:'e1',date:later,s:480,e:490,qty:30,pin:false},
  ],
  workContents:[
    {id:'w1',name:'EQUIPMENT-WORK',factory:1},
    {id:'w2',name:'MANUAL-WORK',factory:1},
    {id:'w3',name:'PLANT-TWO-WORK',factory:2},
  ],
  workAssignments:[
    {id:'a1',workId:'w1',emp:'e1',resourceId:'m1',date,s:490,e:500,qty:0,orderId:'ref1'},
    {id:'a2',workId:'w2',emp:'e1',resourceId:null,date,s:500,e:510,qty:null,orderId:null},
    {id:'a3',workId:'w3',emp:'e2',resourceId:null,date,s:500,e:510,qty:5,orderId:null},
    {id:'a4',workId:'w2',emp:'e1',resourceId:null,date:later,s:500,e:510,qty:7,orderId:null},
  ],
  workReferenceOrders:[{id:'ref1',code:'REFERENCE-ONE'}],dayOT:{[date]:true},
});
function harness(){
  const calls=[],files=[],notices=[],renders=[];
  const module={scheduleXlsx:async(state,date)=>{calls.push({state,date});return scheduleXlsx(state,date);}};
  const ctx={UI:{date,factory:1,modal:{t:'export'}},S:state(),structuredClone,Blob,assignments,workCatalog,inFactory,
    shownMachines:()=>ctx.S.machines.filter(m=>inFactory(m,ctx.UI.factory)),factoryName:f=>'Plant '+f,
    loadExcel:async()=>module,saveFile:(name,blob)=>files.push({name,blob}),toast:s=>notices.push(s),renderModal:()=>renders.push(ctx.UI.modal),
  };
  vm.createContext(ctx);vm.runInContext(code,ctx);
  return {ctx,calls,files,notices,renders,module};
}
// The handler scopes machines/production by visible machines and general work by its
// catalog's factory. Date filtering remains the workbook's job, including manual work.
function expectedInput(s,factory){
  const copy=structuredClone(s),ids=new Set(copy.machines.filter(m=>inFactory(m,factory)).map(m=>m.id));
  return {...copy,machines:copy.machines.filter(m=>ids.has(m.id)),blocks:copy.blocks.filter(b=>ids.has(b.m)),
    workAssignments:copy.workAssignments.filter(a=>inFactory(copy.workContents.find(w=>w.id===a.workId)||{},factory))};
}
async function workbook(file){const wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.blob.arrayBuffer());return wb;}
const textOf=sheet=>{const cells=[];sheet.eachRow(row=>row.eachCell(cell=>cells.push(String(cell.value??''))));return cells.join('\n');};

for(const factory of [1,2,'all'])test(`lazy import retains clicked date, factory ${factory} and state after navigation/replacement`,async()=>{
  const h=harness(),load=deferred();h.ctx.UI.factory=factory;
  const original=h.ctx.S,expected=expectedInput(original,factory),before=JSON.stringify(original);
  h.ctx.loadExcel=()=>load.promise;
  const task=h.ctx.exportXlsx();
  assert.equal(h.ctx.UI.modal.exporting,true);
  h.ctx.UI.modal=null; // Closing does not cancel an export that was already requested.
  h.ctx.UI.date=later;h.ctx.UI.factory=factory===1?2:1;
  h.ctx.S=state();h.ctx.S.blocks=[];h.ctx.S.workAssignments=[];
  load.resolve(h.module);await task;
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].date,date);
  assert.deepEqual(h.calls[0].state,expected);
  assert.equal(h.files[0].name,`產線排程_${factory==='all'?'跨廠':'Plant '+factory}_${date}.xlsx`);
  const detail=(await workbook(h.files[0])).getWorksheet('排程明細');
  assert.equal(detail.rowCount,factory===1?4:factory===2?3:6);
  assert.equal(JSON.stringify(original),before);assert.deepEqual(h.ctx.S.blocks,[]);
  assert.equal(h.ctx.UI.modal,null);assert.equal(h.ctx.UI.date,later);assert.deepEqual(h.notices,[]);
});

test('lazy import snapshots nested records, mutable arrays, reference orders and overtime before in-place edits',async()=>{
  const h=harness(),load=deferred(),expected=expectedInput(h.ctx.S,1);
  h.ctx.loadExcel=()=>load.promise;
  const task=h.ctx.exportXlsx(),s=h.ctx.S;
  // Keep the same state and record identities: copying only arrays or the top-level
  // object would still export these later edits, not the requested schedule.
  s.machines[0].label='CHANGED-MACHINE';s.machines[0].factory=2;s.machines.reverse();
  s.employees[0].name='CHANGED-EMPLOYEE';s.employees[0].color=7;
  s.orders[0].code='CHANGED-ORDER';s.products[0].name='CHANGED-PRODUCT';s.products[0].steps[0].proc='CHANGED-STEP';
  s.blocks[0].qty=999;s.blocks[0].s=600;s.blocks.push({...s.blocks[0],id:'late-block'});
  s.workContents[0].name='CHANGED-WORK';s.workContents[0].factory=2;
  s.workAssignments[0].qty=999;s.workAssignments[1].date=later;s.workAssignments.splice(2,1);
  s.workReferenceOrders[0].code='CHANGED-REFERENCE';s.dayOT[date]=false;
  const after=JSON.stringify(s);
  load.resolve(h.module);await task;
  assert.equal(h.ctx.S,s);assert.equal(JSON.stringify(s),after,'export does not revert live edits');
  assert.deepEqual(h.calls[0].state,expected);
  const wb=await workbook(h.files[0]),grid=wb.getWorksheet('時間×機台'),detail=wb.getWorksheet('排程明細');
  assert.equal(detail.rowCount,4);assert.equal(detail.getCell('I2').value,10);
  assert.equal(detail.getCell('I3').value,0);assert.equal(detail.getCell('I4').value,null);
  assert.match(textOf(detail),/Alice[\s\S]*ORDER-ONE[\s\S]*Product One[\s\S]*Cut/);
  assert.match(textOf(detail),/REFERENCE-ONE[\s\S]*EQUIPMENT-WORK[\s\S]*MANUAL-WORK/);
  assert.match(grid.getCell('B6').value,/ORDER-ONE[\s\S]*EQUIPMENT-WORK/);
  assert.notEqual(grid.getCell('B24').value,'未開加班');
  assert.doesNotMatch(textOf(grid)+'\n'+textOf(detail),/CHANGED|999|PLANT-TWO-WORK/);
});

test('separate export dialogs retain their own lazy-load snapshots when completed in reverse order',async()=>{
  const h=harness(),loads=[deferred(),deferred()];let imports=0;
  h.ctx.loadExcel=()=>loads[imports++].promise;
  const first=h.ctx.exportXlsx();
  h.ctx.UI.date=later;h.ctx.UI.factory=2;h.ctx.UI.modal={t:'export'};
  const secondModal=h.ctx.UI.modal,second=h.ctx.exportXlsx();
  h.ctx.UI.date='2026-11-11';h.ctx.UI.factory='all';
  loads[1].resolve(h.module);await second;
  assert.equal(secondModal.exporting,false);
  loads[0].resolve(h.module);await first;
  assert.deepEqual(h.files.map(f=>f.name),[`產線排程_Plant 2_${later}.xlsx`,`產線排程_Plant 1_${date}.xlsx`]);
  assert.deepEqual(h.calls.map(c=>c.date),[later,date]);
  assert.deepEqual(h.calls.map(c=>c.state.machines.map(m=>m.id)),[['m2'],['m1']]);
  assert.equal(h.ctx.UI.modal,secondModal);assert.equal(secondModal.exporting,false);
  assert.equal(h.renders.length,3,'old completion must not render or reset the newer dialog');
});

test('duplicate click is guarded throughout lazy loading and generation, and completion leaves a newer modal alone',async()=>{
  const h=harness(),load=deferred(),generated=deferred();let imports=0,generations=0;
  h.ctx.loadExcel=()=>{imports++;return load.promise;};
  const task=h.ctx.exportXlsx();await h.ctx.exportXlsx();assert.equal(imports,1);
  load.resolve({scheduleXlsx:()=>{generations++;return generated.promise;}});
  await new Promise(setImmediate);
  await h.ctx.exportXlsx();assert.equal(imports,1);assert.equal(generations,1);
  const newer={t:'other',exporting:'untouched'};h.ctx.UI.modal=newer;
  generated.resolve(new Uint8Array([1]));await task;
  assert.equal(h.files.length,1);assert.equal(h.ctx.UI.modal,newer);assert.equal(newer.exporting,'untouched');
  assert.equal(h.renders.length,1);assert.deepEqual(h.notices,[]);
});

for(const stage of ['snapshot','import','generation'])test(`${stage} failure releases export busy state and retry uses its new entry context`,async()=>{
  const h=harness(),fail=()=>{throw new Error('synthetic '+stage+' failure');};
  if(stage==='snapshot')h.ctx.structuredClone=fail;
  if(stage==='import')h.ctx.loadExcel=fail;
  if(stage==='generation')h.ctx.loadExcel=async()=>({scheduleXlsx:fail});
  await h.ctx.exportXlsx();
  assert.equal(h.ctx.UI.modal.exporting,false);assert.equal(h.files.length,0);
  assert.deepEqual(h.notices,['Excel 匯出失敗：synthetic '+stage+' failure']);
  h.ctx.structuredClone=structuredClone;h.ctx.loadExcel=async()=>h.module;
  h.ctx.UI.date=later;h.ctx.UI.factory=2;
  await h.ctx.exportXlsx();
  assert.equal(h.ctx.UI.modal.exporting,false);assert.equal(h.files.length,1);
  assert.equal(h.files[0].name,`產線排程_Plant 2_${later}.xlsx`);
  assert.equal(h.calls.at(-1).date,later);assert.equal(h.calls.at(-1).state.machines[0].id,'m2');
});
