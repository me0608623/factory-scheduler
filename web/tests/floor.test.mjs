import test from 'node:test';
import assert from 'node:assert/strict';
import { floorCells } from '../src/floor.js';

const day = '2026-10-05';
const S = {
  machines: [
    { id: 'a', label: 'A機', proc: '裁切', factory: 1, faults: [{ date: day, fixed: false, s: 480, e: 720 }] },
    { id: 'b', label: 'B機', proc: '裁切', factory: 1, faults: [{ date: '2026-10-04', fixed: false }] },
    { id: 'c', label: 'C機', proc: '包裝', factory: 2, faults: [] },
  ],
  blocks: [
    { m: 'b', date: day, oid: 'o1', emp: 'e1', s: 480, e: 600 },
    { m: 'b', date: '2026-10-04', oid: 'o2', emp: 'e1', s: 480, e: 600 },
  ],
  orders: [{ id: 'o1', code: 'W01' }, { id: 'o2', code: 'W02' }],
  employees: [{ id: 'e1', name: '小明' }],
  machineLayout: [],
};

test('廠別過濾與狀態判定：故障＞當日排程＞閒置', () => {
  const cells = floorCells(S, 1, day);
  assert.equal(cells.length, 2);
  const by = Object.fromEntries(cells.map((c) => [c.id, c]));
  assert.equal(by.a.status, 'fault');            // 當日未修復故障
  assert.equal(by.b.status, 'busy');             // 其他日的故障不算；當日有排程
  const f2 = floorCells(S, 2, day);
  assert.equal(f2.length, 1);
  assert.equal(f2[0].status, 'idle');
});

test('修復的故障不再標紅', () => {
  const fixed = structuredClone(S);
  fixed.machines[0].faults[0].fixed = true;
  const cells = floorCells(fixed, 1, day);
  assert.equal(cells.find((c) => c.id === 'a').status, 'idle');
});

test('摘要包含工單與人員；閒置為空', () => {
  const b = floorCells(S, 1, day).find((c) => c.id === 'b');
  assert.match(b.detail, /W01/);
  assert.match(b.detail, /小明/);
  assert.equal(b.loadMin, 120);
  assert.equal(floorCells(S, 2, day)[0].detail, '');
});

test('沒有佈局時全部自動排列、不重疊', () => {
  const cells = floorCells(S, 1, day);
  assert.ok(cells.every((c) => c.x != null && c.y != null));
  const keys = new Set(cells.map((c) => c.x + ',' + c.y));
  assert.equal(keys.size, cells.length);
  assert.ok(cells.every((c) => c.x >= 0 && c.x <= 98 && c.y >= 0));
});

test('machine_layout 座標優先，其餘自動補位不與之重疊', () => {
  const withLayout = { ...S, machineLayout: [{ machineId: 'a', x: 50, y: 50 }] };
  const cells = floorCells(withLayout, 1, day);
  const a = cells.find((c) => c.id === 'a');
  assert.equal(a.x, 50); assert.equal(a.y, 50);
  const auto = cells.find((c) => c.id === 'b');
  const overlap = auto.x < 60 && auto.x + 10 > 50 && auto.y < 58 && auto.y + 8 > 50;
  assert.equal(overlap, false);
});
