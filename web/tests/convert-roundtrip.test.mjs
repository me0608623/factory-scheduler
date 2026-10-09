import test from 'node:test';
import assert from 'node:assert/strict';
import { toSnapshot, fromSnapshot } from '../src/convert.js';

// 標準化狀態（模擬 normalizeState 後）
const mkState = () => ({
  employees: [{ id: 'e1', name: 'E1', code: 'E01', factory: 1, active: true, noOT: false,
    maxMachines: 1, skills: ['m1'], leaves: [], color: 0, otWeekdays: [1,2,3,4,5], otOverrides: {},
    reviewStatus: 'confirmed' }],
  machines: [{ id: 'm1', label: 'M1', factory: 1, proc: 'cut', products: ['p1'], active: true,
    faults: [], reviewStatus: 'confirmed' }],
  products: [{ id: 'p1', name: 'P1', active: true, steps: [{ proc: 'cut', rate: 2, batch: 0, factory: 1 }] }],
  orders: [{ id: 'o1', code: 'O1', pid: 'p1', qty: 100, due: '2026-10-15', pri: 1, note: '' }],
  blocks: [{ id: 'b1', oid: 'o1', step: 0, m: 'm1', emp: 'e1', date: '2026-10-10', s: 480, e: 540, qty: 50, pin: false }],
  cal: { week: [false, true, true, true, true, true, true], over: {} },
  dayOT: {},
  execution: [],
  machineLayout: [],
  transferOrders: [], rushOrders: [], workLog: [],
  workContents: [], workAssignments: [], workReferenceOrders: [],
  groups: [], groupMembers: [], leaveRequests: [], memos: [],
  log: [], version: 1,
});

test('toSnapshot → fromSnapshot round-trip：資料完整性', () => {
  const S = mkState();
  const snap = toSnapshot(S, {});
  const back = fromSnapshot(snap);
  assert.equal(back.employees.length, 1);
  assert.equal(back.employees[0].name, 'E1');
  assert.equal(back.machines.length, 1);
  assert.equal(back.orders.length, 1);
  assert.equal(back.orders[0].code, 'O1');
  assert.equal(back.blocks.length, 1);
  assert.equal(back.blocks[0].qty, 50);
});

test('toSnapshot：工單備註保留', () => {
  const S = mkState();
  S.orders[0].note = '急單';
  const snap = toSnapshot(S, {});
  assert.equal(snap.orders[0].note, '急單');
});

test('toSnapshot：execution confirmed 旗標保留', () => {
  const S = mkState();
  S.execution = [{ blockId: 'b1', status: 'done', qtyDone: 50, confirmed: true }];
  const snap = toSnapshot(S, {});
  assert.equal(snap.work_execution[0].confirmed, true);
});

test('toSnapshot：machine_layout 序列化', () => {
  const S = mkState();
  S.machineLayout = [{ machineId: 'm1', x: 50, y: 30 }];
  const snap = toSnapshot(S, {});
  assert.equal(snap.machine_layout.length, 1);
  assert.equal(snap.machine_layout[0].x, 50);
});

test('fromSnapshot：null execution 安全降級', () => {
  const snap = toSnapshot(mkState(), {});
  snap.work_execution = null;
  const back = fromSnapshot(snap);
  assert.deepEqual(back.execution, []);
});

test('fromSnapshot：null／undefined 輸入不丟例外', () => {
  const a = fromSnapshot(null);
  assert.ok(a, 'null 輸入回傳可用狀態');
  const b = fromSnapshot(undefined);
  assert.ok(b, 'undefined 輸入回傳可用狀態');
  assert.deepEqual(a.execution, []);
  assert.deepEqual(b.execution, []);
});
