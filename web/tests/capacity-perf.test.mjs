import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { capacityIntervals } from '../src/capacity.js';

const day = '2026-10-09';
const employee = { id: 'e1', maxMachines: 3 };
const block = (id, s, e, overrides = {}) => ({
  id, date: day, emp: employee.id, s, e, ...overrides,
});
const mixed = [
  block('weighted', 480, 600, { weight: 2 }),
  block('ordinary', 540, 660),
  block('overlap', 570, 630),
  block('full', 720, 780, { weight: 3 }),
];

test('capacityIntervals: mixed weighted and ordinary blocks return exact occupied intervals', () => {
  assert.deepEqual(capacityIntervals(mixed, day, employee), [[540, 600], [720, 780]]);
  // Extra capacity raises the threshold, rather than adding demand.
  assert.deepEqual(capacityIntervals(mixed, day, employee, new Set(), 1), [[570, 600]]);
});

test('capacityIntervals: only matching employee and day contribute occupancy', () => {
  const blocks = [
    ...mixed,
    block('other-employee', 0, 1440, { emp: 'e2', weight: 100 }),
    block('other-day', 0, 1440, { date: '2026-10-10', weight: 100 }),
  ];
  assert.deepEqual(capacityIntervals(blocks, day, employee), [[540, 600], [720, 780]]);
  assert.deepEqual(capacityIntervals(blocks, day, { id: 'absent', maxMachines: 1 }), []);
  assert.deepEqual(capacityIntervals([], day, employee), []);
});

test('capacityIntervals: half-open handoffs never create phantom overlap', () => {
  const blocks = [block('before', 480, 540), block('after', 540, 600)];
  assert.deepEqual(capacityIntervals(blocks, day, { id: 'e1', maxMachines: 2 }), []);
  // At capacity one, adjacent full intervals merge without a gap.
  assert.deepEqual(capacityIntervals(blocks, day, { id: 'e1', maxMachines: 1 }), [[480, 600]]);
  const separated = [block('before', 480, 540), block('after', 541, 600)];
  assert.deepEqual(capacityIntervals(separated, day, { id: 'e1', maxMachines: 1 }), [[480, 540], [541, 600]]);
});

test('capacityIntervals: drag exclusions use block IDs, not employee IDs', () => {
  assert.deepEqual(capacityIntervals(mixed, day, employee, new Set(['weighted'])), [[720, 780]]);
  assert.deepEqual(capacityIntervals(mixed, day, employee, new Set(['ordinary'])), [[570, 600], [720, 780]]);
  assert.deepEqual(capacityIntervals(mixed, day, employee, new Set(['e1'])), [[540, 600], [720, 780]]);
});

test('capacityIntervals: bounded 35-employee workload computes every occupied interval', (t) => {
  const employees = Array.from({ length: 35 }, (_, i) => ({ id: `e${i}`, maxMachines: 3 }));
  const expected = Array.from({ length: 48 }, (_, i) => [i * 20 + 6, i * 20 + 12]);
  const blocks = employees.flatMap(({ id: emp }) => expected.flatMap(([s, e], i) => [
    block(`${emp}-${i}-weighted`, s - 6, e, { emp, weight: 2 }),
    block(`${emp}-${i}-ordinary`, s, e + 4, { emp }),
  ]));
  assert.equal(blocks.length, 3360);
  // A generous smoke-test budget catches gross regressions, not normal CI timing noise.
  // Exact results are checked for all 350 calls, so an empty/no-op helper cannot pass.
  const started = performance.now();
  let checkedIntervals = 0;
  for (let repeat = 0; repeat < 10; repeat++) {
    for (const employee of employees) {
      const result = capacityIntervals(blocks, day, employee, new Set(), 0);
      assert.deepEqual(result, expected);
      checkedIntervals += result.length;
    }
  }
  const elapsed = performance.now() - started;
  assert.equal(checkedIntervals, 16800);
  t.diagnostic(`350 capacity queries over 3360 blocks: ${elapsed.toFixed(1)}ms`);
  assert.ok(elapsed < 5000, `capacity workload took ${elapsed.toFixed(1)}ms (budget 5000ms)`);
});
