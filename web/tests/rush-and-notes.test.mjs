import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRush, shortageRowFlags } from '../src/rush.js';
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

test('欠缺品項列旗標：二廠未排與「晚」判定', () => {
  assert.deepEqual(shortageRowFlags(row()), { f2Empty: false, late: false });                    // 10/1 出貨、10/2 完成 → 不晚
  assert.equal(shortageRowFlags(row({ f2: { startDate: '', dueDate: '', itemProcess: '', desc: '', qty: null, note: '' } })).f2Empty, true);
  assert.equal(shortageRowFlags(row({ f2: { startDate: '2026-10-02', dueDate: '2026-10-03', itemProcess: 'x', desc: '', qty: 1, note: '' } })).late, true);   // 完成晚於出貨
  assert.equal(shortageRowFlags(row({ f1: { shipDate: '2026-10-01', vendor: '', desc: '', shortQty: null, note: '' } })).late, false);   // 沒出貨日不標晚
});

test('欠缺品項自訂欄位：合法可存、超長拒絕、也能滿足非空條件', () => {
  validateRush([row({ custom: { 模具號: 'M-07', 運費: '對方付' } })]);
  assert.throws(() => validateRush([row({ custom: { 模具號: 'x'.repeat(201) } })]), /200 字/);
  const emptyBoth = { id: 'r9', f1: { shipDate: '', vendor: '', desc: '', shortQty: null, note: '' }, f2: { startDate: '', dueDate: '', itemProcess: '', desc: '', qty: null, note: '' } };
  assert.throws(() => validateRush([emptyBoth]), /至少要填/);
  validateRush([{ ...emptyBoth, custom: { 註記: '先佔位' } }]);
});
