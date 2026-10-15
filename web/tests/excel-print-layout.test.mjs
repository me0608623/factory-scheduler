import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { scheduleXlsx } from '../src/excel.js';

test('exported machine grid retains landscape and one-page printing after XLSX round trip', async () => {
  const state={machines:[{id:'m1',label:'Machine'}],employees:[{id:'e1',name:'Worker'}],
    products:[{id:'p1',name:'Product',steps:[{proc:'Cut'}]}],orders:[{id:'o1',pid:'p1',code:'Order'}],
    blocks:[{id:'b1',date:'2026-10-15',m:'m1',emp:'e1',oid:'o1',step:0,s:480,e:540,qty:10,pin:false}]};
  const original=structuredClone(state);
  const bytes=await scheduleXlsx(state,'2026-10-15');
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const grid=workbook.getWorksheet('時間×機台');
  assert.equal(grid.pageSetup.orientation,'landscape');
  assert.equal(grid.pageSetup.fitToPage,true);
  assert.equal(grid.pageSetup.fitToWidth,1);
  assert.equal(grid.pageSetup.fitToHeight,1);
  assert.match(grid.getCell('B6').value,/Worker.*Order/);
  assert.equal(workbook.getWorksheet('排程明細').getCell('I2').value,10);
  assert.deepEqual(state,original);
});
