import test from 'node:test';
import assert from 'node:assert/strict';
import { workQueue } from '../src/work-queue.js';

const baseS = (nOrders = 1) => ({
  employees: [{ id: 'e1', name: 'E1', skills: [], leaves: [], factory: 1 }],
  machines: [{ id: 'm1', label: 'M1', proc: 'cut', products: ['p1'], factory: 1, faults: [] }],
  products: [{ id: 'p1', name: 'P1', steps: [{ proc: 'cut', rate: 1, batch: 0, factory: 1 }] }],
  orders: Array.from({ length: nOrders }, (_, i) => ({
    id: 'o' + i, code: 'O' + String(i).padStart(3, '0'), pid: 'p1', qty: 100, due: '2026-10-15', pri: 1,
  })),
  blocks: [],
  cal: { week: [false, true, true, true, true, true, true], over: {} },
  dayOT: {}, log: [],
});

test('workQueue：100 工單在 100ms 內完成', () => {
  const S = baseS(100);
  const t0 = performance.now();
  const q = workQueue(S, '2026-10-09');
  const dt = performance.now() - t0;
  assert.equal(q.length, 100);
  assert.ok(dt < 100, `100 工單耗時 ${dt.toFixed(1)}ms 應 <100ms`);
});

test('workQueue：0 工單回空陣列', () => {
  assert.equal(workQueue(baseS(0), '2026-10-09').length, 0);
});

test('workQueue：逾期工單正確標記', () => {
  const S = baseS(3);
  S.orders[0].due = '2026-10-01';
  S.orders[1].due = '2026-10-01';
  S.orders[2].due = '2026-12-31';
  const q = workQueue(S, '2026-10-09');
  assert.equal(q.filter(r => r.overdue).length, 2, '2 筆逾期');
  assert.equal(q.filter(r => !r.overdue).length, 1, '1 筆未逾期');
});

test('workQueue：setupPending 時全部不可排', () => {
  const S = baseS(2);
  S.setupPending = true;
  const q = workQueue(S, '2026-10-09');
  assert.ok(q.every(r => !r.canArrange), 'setupPending 不可排');
});

test('workQueue：缺少產品提示原因', () => {
  const S = baseS(1);
  S.products = [];
  const q = workQueue(S, '2026-10-09');
  assert.ok(q[0].reasons.some(r => r.includes('產品') || r.includes('缺少')), '提示缺少產品');
});
