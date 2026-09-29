import test from 'node:test';
import assert from 'node:assert/strict';
import { fromSnapshot, toSnapshot } from '../src/convert.js';
import { rowsOf, diffRows } from '../src/store/diff.js';

const snapshot = () => ({ setup_pending: true, employees: [{ id:'e',name:'來源名',skills:[],
  source_employee_code:'TEST001',source_notes:'設備備註',catalog_sources:['fixture!A1'],
  identity_candidates:[{name:'候選名',source_employee_code:'TEST002',status:'pending'}] }],
  machines:[{id:'m',label:'手動位置',process:'待確認',products:[],catalog_group:'parent',catalog_side:'左'}],
  products:[],orders:[],blocks:[] });
test('原始代號、備註、未合併別名与位置資訊保留於讀寫快照', () => {
  const s=fromSnapshot(snapshot());
  const out=toSnapshot(s);
  assert.equal(out.setup_pending,true);
  for(const field of ['source_employee_code','source_notes','catalog_sources','identity_candidates'])
    assert.deepEqual(out.employees[0][field],snapshot().employees[0][field]);
  assert.equal(out.machines[0].catalog_group,'parent');
  assert.equal(out.machines[0].catalog_side,'左');
  assert.equal(out.employees[0].name,'來源名');
  assert.deepEqual(out.employees[0].skills,[]);
});
test('修改顏色不抹去原始代號及別名，不重寫其他機台', () => {
  const s=fromSnapshot(snapshot()), before=rowsOf(s);
  s.employees[0].color=4;
  const d=diffRows(before,rowsOf(s));
  assert.equal(d.employees.upsert[0].source_employee_code,'TEST001');
  assert.deepEqual(d.employees.upsert[0].identity_candidates,snapshot().employees[0].identity_candidates);
  assert.equal(d.machines,undefined);
});
