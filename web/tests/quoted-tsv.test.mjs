import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Readable} from 'node:stream';
import vm from 'node:vm';
import ExcelJS from 'exceljs';
import {IMPORT_HEADERS,readImportXlsx} from '../src/excel.js';
import {LocalStore} from '../src/store/local.js';
import {assignments,occupiedWork,workCatalog} from '../src/general-work.js';
import {factoryOf,inFactory} from '../src/factory.js';

const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function slice(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a);
  assert.ok(a>=0&&b>a,`source boundaries: ${start}`);return source.slice(a,b);
}
const code=slice('function rowsTSV(rows){','/* ===== 12.')+
  '\nconst actions={'+slice('"x-copy-day":','"x-print-day":')+
  slice('"x-copy-all":','"x-xlsx":')+slice('"x-import-confirm":','"legacy-save":')+'};this.actions=actions;';
const date='2026-11-09';
// ExcelJS uses the established fast-csv reader; identity mapping avoids number/date coercion.
async function readDelimited(text,delimiter){
  const sheet=await new ExcelJS.Workbook().csv.read(Readable.from([text]),{map:v=>v,parserOptions:{delimiter}});
  return Array.from({length:sheet.rowCount},(_,i)=>sheet.getRow(i+1).values.slice(1));
}
async function workbookBytes(field,label){
  const book=new ExcelJS.Workbook();
  for(const [name,headers] of Object.entries(IMPORT_HEADERS))book.addWorksheet(name).addRow(headers);
  book.getWorksheet('員工').addRow(['E1',field==='employee'?label:'Employee',1,'M1','否','']);
  book.getWorksheet('機台').addRow(['M1',field==='machine'?label:'Machine','裁切','P1']);
  book.getWorksheet('產品工序').addRow(['P1',field==='product'?label:'Product',1,'裁切',1,0]);
  book.getWorksheet('工單').addRow([field==='order'?label:'Order','P1',30,date,0]);
  return book.xlsx.writeBuffer();
}
function fixture(data){
  const before={employees:[],machines:[],products:[],orders:[],blocks:[],groups:[],log:[]};
  const store=new LocalStore(),copied=[],files=[],messages=[];
  const ctx={S:before,UI:{date,factory:1,modal:{t:'import-preview',base:JSON.stringify(before),errors:[],data}},STORE:store,
    canMaster:()=>true,readOnly:false,workCatalog,assignments,occupiedWork,transferOrders:()=>[],factoryOf,inFactory,
    pushUndo:()=>{},renderModal:()=>{},closeModal:()=>{ctx.UI.modal=null;},toast:m=>messages.push(m),tx:x=>x,runAuto:()=>{},
    commit:async()=>{await store.sync(ctx.S);return true;},DAY0:480,DAY1:1200,LUNCH_S:720,LUNCH_E:780,MODALS:{},Blob,
    saveFile:(name,blob)=>files.push({name,blob}),navigator:{clipboard:{writeText:async text=>copied.push(text)}},
    shownMachines:()=>ctx.S.machines.filter(m=>inFactory(m,ctx.UI.factory)),
    emp:id=>ctx.S.employees.find(x=>x.id===id),order:id=>ctx.S.orders.find(x=>x.id===id),prod:id=>ctx.S.products.find(x=>x.id===id),
    stepName:b=>ctx.S.products.find(p=>p.id===ctx.S.orders.find(o=>o.id===b.oid).pid).steps[b.step].proc,
    hm:t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0'),mdw:()=> '11/9（一）',
    WD:'日一二三四五六',parseD:d=>new Date(d+'T00:00:00Z'),byAbs:(a,b)=>a.s-b.s,issuesOf:()=>[],todayStr:()=>date};
  vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,store,copied,files,messages};
}

test('XLSX import and real local persistence preserve labels through actual TSV actions and unchanged CSV',async()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  try{
    for(const label of ['North Team','North, Team','"North Team"','North\tTeam','North\nTeam','North\rTeam']){
      for(const field of ['employee','machine','product','order']){
        const tag=`${field}: ${JSON.stringify(label)}`,storage=new Map();
        Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}});
        const parsed=await readImportXlsx(await workbookBytes(field,label),'synthetic.xlsx');
        assert.deepEqual(parsed.errors,[],tag);
        const f=fixture(parsed.data),{ctx}=f;
        await ctx.actions['x-import-confirm']();assert.equal(ctx.UI.modal,null,tag);
        assert.ok(f.messages.includes('Excel 匯入完成。請建立新排程'),tag);
        ctx.S=await f.store.load();
        // XLSX XML parsing normalizes CR to LF: do not assume lone CR was admitted unchanged.
        const expectedLabel=label.replace(/\r/g,'\n');
        assert.equal({employee:ctx.S.employees[0].name,machine:ctx.S.machines[0].label,
          product:ctx.S.products[0].name,order:ctx.S.orders[0].code}[field],expectedLabel,tag);
        ctx.S.blocks=[{id:'B1',date,m:'M1',emp:'E1',oid:ctx.S.orders[0].id,step:0,s:480,e:510,qty:30}];
        await f.store.sync(ctx.S);ctx.S=await f.store.load();
        const before=JSON.stringify(ctx.S),expected=JSON.parse(JSON.stringify(ctx.allRows())).map(row=>row.map(String));
        await ctx.actions['x-copy-all']();
        assert.deepEqual(await readDelimited(f.copied.at(-1),'\t'),expected,tag);
        await ctx.actions['x-copy-day']();
        const day=await readDelimited(f.copied.at(-1),'\t');
        assert.equal(day.length,26,tag);assert.equal(day[0][0],'11/9（一） 設備排程（純人工見全部明細）');
        assert.deepEqual(day[1],['時間','M1 '+ctx.S.machines[0].label],tag);
        assert.deepEqual(day[2],['08:00',ctx.S.employees[0].name+' '+ctx.S.orders[0].code+' 裁切'],tag);
        for(const row of day.slice(1))assert.equal(row.length,2,tag);
        assert.deepEqual(day[3],['08:30','']);assert.deepEqual(day[10],['12:00','午休']);
        await ctx.actions['x-dl']();
        const csvBytes=new Uint8Array(await f.files[0].blob.arrayBuffer());
        assert.deepEqual([...csvBytes.slice(0,3)],[239,187,191]);
        assert.deepEqual(await readDelimited(await f.files[0].blob.text(),','),expected,tag);
        assert.equal(JSON.stringify(ctx.S),before,tag);
        assert.equal(expected[1][9],'30');assert.deepEqual(expected[1].slice(10),['','']);
      }
    }
  }finally{
    if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;
  }
});

test('TSV serializer quotes CR and mixed delimiters and retains plain, numeric and empty values',async()=>{
  const {ctx}=fixture({});
  const rows=[['Plain','North, Team',30,0,'',null,undefined],['a\rb','a\r\nb','a\tb','a\nb','a"b','"a"','尾']];
  const before=JSON.stringify(rows),text=ctx.rowsTSV(rows);
  assert.equal(text.split('\n')[0],'Plain\tNorth, Team\t30\t0\t\t\t');
  assert.deepEqual(await readDelimited(text,'\t'),rows.map(row=>row.map(v=>String(v??''))));
  assert.equal(JSON.stringify(rows),before);
});
