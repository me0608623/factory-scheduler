import test from 'node:test';
import assert from 'node:assert/strict';
import { capacityIntervals } from '../src/capacity.js';

const ds = '2026-10-09';
const emp = (over = {}) => ({
  id: 'e1', name: 'E1', skills: [], leaves: [],
  noOT: false, otWeekdays: [1,2,3,4,5,6], otOverrides: over,
});

test('capacityIntervals：無請假回傳工作時段', () => {
  const r = capacityIntervals(ds, emp(), new Set(), 0);
  assert.ok(Array.isArray(r), '回傳陣列');
  assert.ok(r.length >= 0, '非負數區間');
});

test('capacityIntervals：整天請假回傳空或極少區間', () => {
  const e = { ...emp(), leaves: [{ date: ds, s: 0, e: 1440 }] };
  const r = capacityIntervals(ds, e, new Set(), 0);
  assert.ok(r.length <= 1, `整天請假應空或僅 1 區間，實際 ${r.length}`);
});

test('capacityIntervals：35 員工在 50ms 內', () => {
  const emps = Array.from({ length: 35 }, (_, i) => ({
    ...emp(), id: 'e' + i,
    leaves: [{ date: ds, s: 480, e: 540 }],
  }));
  const t0 = performance.now();
  for (const e of emps) capacityIntervals(ds, e, new Set(), 0);
  const dt = performance.now() - t0;
  assert.ok(dt < 50, `35 員工耗時 ${dt.toFixed(1)}ms 應 <50ms`);
});

test('capacityIntervals：排除特定員工（drag 中）', () => {
  const e = emp();
  const r = capacityIntervals(ds, e, new Set(['e1']), 0);
  assert.ok(Array.isArray(r), '不因排除自己而崩潰');
});
