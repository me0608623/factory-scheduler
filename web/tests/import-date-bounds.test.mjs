import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ExcelJS from 'exceljs';
import {readImportXlsx,IMPORT_HEADERS} from '../src/excel.js';
import {makeDb,FakeSupabase} from './fake-supabase.mjs';
import {SupabaseStore} from '../src/store/supabase.js';

const B='11111111-1111-4111-8111-111111111111';
const E='77777777-7777-4777-8777-777777777771';
const P='77777777-7777-4777-8777-777777777772';
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const start=source.indexOf('"x-import-confirm":'),end=source.indexOf('"legacy-save":',start);
const confirmCode='const actions={'+source.slice(start,end)+'};this.confirm=actions["x-import-confirm"];';
async function workbook({due='2026-12-01',leave='',numFmt,date1904=false}={}){
  const wb=new ExcelJS.Workbook();wb.properties.date1904=date1904;
  for(const [name,headers] of Object.entries(IMPORT_HEADERS))wb.addWorksheet(name).addRow(headers);
  wb.getWorksheet('員工').addRow([E,'date test',1,'a','否',leave]);
  wb.getWorksheet('機台').addRow(['a','date test','裁切',P]);
  wb.getWorksheet('產品工序').addRow([P,'date test',1,'裁切',2,0]);
  wb.getWorksheet('工單').addRow(['date-test',P,1,due,0]);
  if(numFmt)wb.getWorksheet('工單').getCell('D2').numFmt=numFmt;
  return readImportXlsx(await wb.xlsx.writeBuffer(),'synthetic-dates.xlsx');
}
function confirmFixture(S,result,store,commit){
  const events=[];
  const modal={t:'import-preview',base:JSON.stringify(S),filename:'synthetic-dates.xlsx',...result};
  const ctx={S,UI:{modal},STORE:store,canMaster:()=>true,readOnly:false,
    workCatalog:()=>[],assignments:()=>[],transferOrders:()=>[],factoryOf:e=>e.factory??1,
    pushUndo:()=>events.push('undo'),renderModal:()=>{},tx:x=>x,toast:x=>events.push(x),
    closeModal:()=>{ctx.UI.modal=null;},runAuto:()=>{},
    commit:async entry=>{events.push('commit');return commit(ctx.S,entry);}};
  vm.createContext(ctx);vm.runInContext(confirmCode,ctx);
  return {ctx,events,modal};
}

test('XLSX zero-year due and leave stop confirmation before undo, state changes or persistence',async()=>{
  for(const date of ['0000-01-01','0000-02-29','0000-12-31'])for(const field of ['due','leave']){
    const result=await workbook({[field]:field==='leave'?`2026-12-01,${date}`:date});
    assert.ok(result.errors.some(e=>e.includes('日期不存在')),`${field}: ${date}`);
    const S={employees:[],machines:[],products:[],orders:[],blocks:[],groups:[]};
    const before=JSON.stringify(S);
    const f=confirmFixture(S,result,{session:null,authEpoch:0},()=>assert.fail('must not reach persistence'));
    await f.ctx.confirm();
    assert.equal(f.ctx.S,S);assert.equal(JSON.stringify(S),before);assert.deepEqual(f.events,[]);
    assert.equal(f.ctx.UI.modal,f.modal);assert.equal(f.modal.importCandidate,undefined);
  }
});

test('XLSX dates preserve existing calendar, Date cell and Excel serial behavior',async()=>{
  for(const due of ['0001-01-01','0004-02-29','0099-12-31','0100-01-01','2000-02-29','2400-02-29','9999-12-31']){
    const result=await workbook({due});assert.deepEqual(result.errors,[],due);assert.equal(result.data.orders[0].due,due);
  }
  for(const due of ['0001-02-29','0100-02-29','1900-02-29','2026-02-29','2026-04-31','2100-02-29']){
    const result=await workbook({due});assert.ok(result.errors.some(e=>e.includes('日期不存在')),due);
  }
  for(const due of ['10000-01-01',46000,new Date('0001-01-01T00:00:00Z'),new Date('0099-12-31T00:00:00Z')]){
    const result=await workbook({due});assert.ok(result.errors.some(e=>e.includes('日期須為 YYYY-MM-DD')),String(due));
  }
  // Preserve ExcelJS decoding and UTC day extraction, not Excel's fictitious 1900-02-29.
  for(const [due,numFmt,date1904,expected] of [
    ['2026-2-3',undefined,false,'2026-02-03'],
    [new Date('2026-02-03T18:00:00Z'),undefined,false,'2026-02-03'],
    [59,'yyyy-mm-dd',false,'1900-02-27'],[60,'yyyy-mm-dd',false,'1900-02-28'],
    [61,'yyyy-mm-dd',false,'1900-03-01'],[46000.75,'yyyy-mm-dd',false,'2025-12-09'],
    [0,'yyyy-mm-dd',true,'1904-01-01'],[46000,'yyyy-mm-dd',true,'2029-12-10']]){
    const result=await workbook({due,numFmt,date1904});assert.deepEqual(result.errors,[],String(due));assert.equal(result.data.orders[0].due,expected);
  }
});

test('valid dates pass real XLSX confirmation and SupabaseStore PostgreSQL roundtrip',async()=>{
  const db=await makeDb();
  try{
    await db.exec('truncate employees,machines,products,orders cascade');
    await db.query("insert into auth.users(id,email) values ($1,'date-test@x')",[B]);
    await db.query("update profiles set role='boss' where user_id=$1",[B]);
    for(const date of ['0001-01-01','0004-02-29','0099-12-31','2000-02-29','9999-12-31']){
      await db.exec('truncate employees,machines,products,orders cascade');
      await db.query("insert into profiles(user_id,role) values ($1,'boss') on conflict(user_id) do update set role='boss'",[B]);
      const store=new SupabaseStore(new FakeSupabase(db,{'date-test@x':{id:B,password:'pw'}}));
      await store.init();await store.login('date-test@x','pw');
      const S=await store.load(),result=await workbook({due:date,leave:date});
      assert.deepEqual(result.errors,[]);
      const f=confirmFixture(S,result,store,async(state,entry)=>{await store.sync(state,entry);return true;});
      await f.ctx.confirm();
      assert.deepEqual(f.events,['undo','commit','Excel 匯入完成。請建立新排程']);assert.equal(f.ctx.UI.modal,null);
      assert.deepEqual((await db.query('select due_date::text as due from orders')).rows,[{due:date}]);
      assert.deepEqual((await db.query('select date::text from leaves')).rows,[{date}]);
    }
  }finally{await db.close();}
});
