import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRush } from '../src/rush.js';
import { rowsOf } from '../src/store/diff.js';
import { fromSnapshot, toSnapshot } from '../src/convert.js';
import { effectivePermission } from '../src/permissions.js';

const day = '2026-10-01';
const row = (more = {}) => ({
  id: 'r1',
  f1: { shipDate: day, vendor: 'AVK-5', desc: '521F00137', shortQty: 100, note: '' },
  f2: { startDate: '2026-10-02', dueDate: '', itemProcess: '521F00137', desc: '進貨布輪擦拭', qty: 240, note: '' },
  ...more,
});

test('特別趕貨：合法一列（兩廠都填）可通過驗證', () => {
  validateRush([row()]);
});

test('特別趕貨：只填一廠也可以、兩邊全空要拒絕', () => {
  validateRush([row({ f2: { startDate: '', dueDate: '', itemProcess: '', desc: '', qty: null, note: '' } })]);
  assert.throws(() => validateRush([row({
    f1: { shipDate: '', vendor: '', desc: '', shortQty: null, note: '' },
    f2: { startDate: '', dueDate: '', itemProcess: '', desc: '', qty: null, note: '' },
  })]), /至少要填/);
});

test('特別趕貨：日期格式與數量規則', () => {
  assert.throws(() => validateRush([row({ f1: { shipDate: '2026/10/01', vendor: '', desc: '', shortQty: null, note: '' } })]), /YYYY-MM-DD/);
  assert.throws(() => validateRush([row({ f1: { shipDate: day, vendor: '', desc: 'x', shortQty: -5, note: '' } })]), /整數/);
  assert.throws(() => validateRush([row({ f2: { startDate: day, dueDate: '', itemProcess: 'x', desc: '', qty: 1.5, note: '' } })]), /整數/);
  assert.throws(() => validateRush([row(), row()]), /id 重複/);
});

test('工單備註：資料列與快照往返都保留 note', () => {
  const S = { cal: { week: [false, true, true, true, true, true, true], over: {} }, dayOT: {},
    employees: [], machines: [], products: [],
    orders: [{ id: 'o1', code: 'W01', pid: 'p', qty: 5, due: day, pri: 2, note: '原材料等廠商' }], blocks: [] };
  const rows = rowsOf(S);
  assert.equal(rows.orders.get('o1').note, '原材料等廠商');
  const back = fromSnapshot({ ...toSnapshot(S), calendar: toSnapshot(S).calendar });
  assert.equal(back.orders[0].note, '原材料等廠商');
  const noNote = fromSnapshot({ ...toSnapshot({ ...S, orders: [{ ...S.orders[0], note: null }] }), calendar: toSnapshot(S).calendar });
  assert.equal(noNote.orders[0].note, null);
});

test('特別趕貨權限：老闆與組長預設可改、員工不可', () => {
  assert.equal(effectivePermission('boss', null, 'rush.manage'), true);
  assert.equal(effectivePermission('lead', {}, 'rush.manage'), true);
  assert.equal(effectivePermission('worker', {}, 'rush.manage'), false);
});
