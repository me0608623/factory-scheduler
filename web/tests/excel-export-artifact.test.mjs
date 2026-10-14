// R42：匯出 Excel 產物層驗證——scheduleXlsx 的最終位元組必須是有效 xlsx（zip 魔數、非平凡大小、
// 含 worksheet/sharedStrings entry）。內容正確性（時間×機台、顏色、明細）由 excel.test.mjs 的
// buildScheduleWorkbook 往返測試覆蓋；本測試補的是「最終下載位元組」這一層。
import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleXlsx} from '../src/excel.js';

const day='2026-10-15';
const state={
  employees:[{id:'e1',name:'甲',factory:1,skills:['m1'],leaves:[]}],
  machines:[{id:'m1',label:'裁切機1',proc:'裁切',factory:1,products:['p1'],faults:[]}],
  products:[{id:'p1',name:'外殼',steps:[{proc:'裁切',factory:1}]}],
  orders:[{id:'o1',pid:'p1',qty:10,due:'2026-10-20',code:'A01'}],
  blocks:[{id:'b1',oid:'o1',step:0,m:'m1',emp:'e1',date:day,s:480,e:540,qty:10,pin:false}],
  workAssignments:[],workContents:[],execution:[],rushOrders:[],transferOrders:[],workLog:[],
  cal:{week:[1,1,1,1,1,1,1],over:{}},
};

test('scheduleXlsx produces a valid xlsx (zip) artifact with worksheet entries',async()=>{
  const bytes=await scheduleXlsx(state,day);
  const u=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  assert.ok(u.length>1000,'non-trivial size: '+u.length);
  assert.equal(u[0],0x50,'zip magic P');
  assert.equal(u[1],0x4b,'zip magic K');
  // 掃 local file header 名稱，確認 zip 內含工作表與共用字串
  const names=[];
  for(let i=0;i<u.length-30;i++){
    if(u[i]===0x50&&u[i+1]===0x4b&&u[i+2]===3&&u[i+3]===4){
      const nameLen=u[i+26]|(u[i+27]<<8);
      names.push(String.fromCharCode(...u.slice(i+30,i+30+nameLen)));
    }
  }
  assert.ok(names.some(n=>n.startsWith('xl/worksheets/sheet')),'worksheet entry present');
  assert.ok(names.includes('xl/sharedStrings.xml'),'sharedStrings present');
  assert.ok(names.includes('xl/workbook.xml'),'workbook.xml present');
});
