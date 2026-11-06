import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {readImportXlsx,IMPORT_HEADERS} from '../src/excel.js';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';
import {SupabaseStore} from '../src/store/supabase.js';
import {translateImportError} from '../src/import-errors.js';
import {I18N} from '../src/i18n.js';
const E='77777777-7777-4777-8777-777777777771',P='77777777-7777-4777-8777-777777777772',B='11111111-1111-4111-8111-111111111111';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const start=source.indexOf('"x-import-confirm":'),end=source.indexOf('"legacy-save":',start);
const confirmCode='const actions={'+source.slice(start,end)+'};this.confirm=actions["x-import-confirm"];';
async function read(overrides={},count=1){
  const v={color:1,seq:1,batch:0,qty:1,pri:0,...overrides},wb=new ExcelJS.Workbook();
  for(const [name,headers] of Object.entries(IMPORT_HEADERS))wb.addWorksheet(name).addRow(headers);
  wb.getWorksheet('員工').addRow([E,'Synthetic employee',v.color,'a','否','']);
  wb.getWorksheet('機台').addRow(['a','Synthetic machine','裁切',P]);
  for(let i=0;i<count;i++)wb.getWorksheet('產品工序').addRow([P,'Synthetic product',count===1?v.seq:i+1,'裁切',2,v.batch]);
  wb.getWorksheet('工單').addRow(['Synthetic order',P,v.qty,'2026-12-01',v.pri]);
  return readImportXlsx(await wb.xlsx.writeBuffer(),'synthetic.xlsx');
}
function confirmContext(result,S={employees:[],machines:[],products:[],orders:[],blocks:[],groups:[]},store={session:null,authEpoch:0}){
  const events=[],modal={t:'import-preview',base:JSON.stringify(S),filename:'synthetic.xlsx',...result};
  const ctx={S,UI:{modal},STORE:store,canMaster:()=>true,readOnly:false,workCatalog:()=>[],assignments:()=>[],transferOrders:()=>[],factoryOf:e=>e.factory??1,
    pushUndo:()=>events.push('undo'),renderModal:()=>{},tx:x=>x,toast:x=>events.push(x),closeModal:()=>{ctx.UI.modal=null;},runAuto:()=>{},commit:async()=>{events.push('write');return true;}};
  vm.createContext(ctx);vm.runInContext(confirmCode,ctx);return {ctx,events};
}
const fields={color:'員工 第 2 列顏色',seq:'產品工序 第 2 列工序順序',batch:'產品工序 第 2 列幾件可傳下站',qty:'工單 第 2 列數量',pri:'工單 第 2 列優先級'};
async function assertBlocked(result){
  const {ctx,events}=confirmContext(result),before=ctx.S,serialized=JSON.stringify(before);
  await ctx.confirm();assert.equal(ctx.S,before);assert.equal(JSON.stringify(ctx.S),serialized);assert.deepEqual(events,[]);
}
test('XLSX integer text is checked before rounding and underflow, with zero undo or writes',async()=>{
  for(const field of Object.keys(fields))for(const value of ['1.00000000000000001','-1e-400','1e-400','1e-'+'9'.repeat(400),'1e'+'9'.repeat(400)]){
    const result=await read({[field]:value});assert.ok(result.errors.some(e=>e.startsWith(fields[field]+'：')),`${field}: ${value}`);await assertBlocked(result);
  }
});
test('32-bit limits and fractional boundaries produce localized row errors before confirmation',async()=>{
  for(const field of ['qty','batch']){
    for(const value of [2147483648,'2147483648','9007199254740993','0x80000000','2147483647.0000000001']){
      const result=await read({[field]:value});assert.ok(result.errors.some(e=>e.startsWith(fields[field]+'：')));await assertBlocked(result);
    }
    const result=await read({[field]:2147483648});assert.ok(result.errors.includes(fields[field]+'：不得超過 2147483647'));
    try{for(const lang of ['en','vi','th']){I18N.lang=lang;const out=translateImportError(result.errors[0]);assert.notEqual(out,result.errors[0]);assert.ok(out.includes('2147483647'));assert.ok(!/[\u4e00-\u9fff]/.test(out));}}finally{I18N.lang='zh-TW';}
  }
});
test('positive/non-negative domains, zero, and the 1000-row sequence limit remain intact',async()=>{
  for(const overrides of [{qty:0},{qty:-1},{qty:1.5},{batch:-1},{batch:1.5},{color:0},{color:9},{pri:-1},{pri:4},{seq:0},{seq:2}])assert.ok((await read(overrides)).errors.length,JSON.stringify(overrides));
  assert.deepEqual((await read({},1000)).errors,[]);
  const overflow=await read({},1001);assert.ok(overflow.errors.includes('產品工序：最多 1000 列資料'));await assertBlocked(overflow);
  for(const v of [0,'','  ','-0','0e'+'9'.repeat(400),'0e-'+'9'.repeat(400)])assert.deepEqual((await read({batch:v,pri:v})).errors,[],String(v));
});
test('full schema: XLSX exact text and legal boundaries persist without rounding',async()=>{
  const db=await makeDb();
  try{
    await db.query("insert into auth.users(id,email) values ($1,'boss@x')",[B]);
    for(const [qty,batch,expectedQty,expectedBatch] of [
      [2147483647,2147483647,2147483647,2147483647],['2147483647','2147483647',2147483647,2147483647],
      ['2.147483647e9','214748364700e-2',2147483647,2147483647],['1.0','',1,0],['+001e3','-0',1000,0],
      ['0x7fffffff','0b111',2147483647,7],['0o17','0X10',15,16],['.1e1','1000e-3',1,1],['1.',0,1,0],
    ]){
      // Only the isolated PGlite fixture: each import replaces an empty catalog.
      await db.exec('truncate employees,machines,products,orders cascade');
      await db.query("insert into profiles(user_id,role) values ($1,'boss') on conflict(user_id) do update set role='boss'",[B]);
      const store=new SupabaseStore(new FakeSupabase(db,{'boss@x':{id:B,password:'pw'}}));await store.init();await store.login('boss@x','pw');
      const S=await store.load(),result=await read({qty,batch,color:'0x8',pri:'3.0',seq:'1e0'});assert.deepEqual(result.errors,[]);
      const {ctx,events}=confirmContext(result,S,store);ctx.commit=async()=>{events.push('write');await store.sync(ctx.S,null);return true;};
      await ctx.confirm();assert.deepEqual(events,['undo','write','Excel 匯入完成。請建立新排程']);
      assert.deepEqual((await db.query('select qty,priority from orders')).rows,[{qty:expectedQty,priority:3}]);
      assert.deepEqual((await db.query('select seq,transfer_batch from product_steps')).rows,[{seq:0,transfer_batch:expectedBatch}]);
      assert.deepEqual((await db.query('select color from employees')).rows,[{color:7}]);
    }
  }finally{await db.close();}
});
