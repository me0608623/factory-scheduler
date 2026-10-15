import test from 'node:test';
import assert from 'node:assert/strict';
import { dateVal, applySort, TF_SORT, RUSH_SORT, WL_SORT } from '../src/table-sort.js';

test('date sorting rejects impossible calendar days and respects leap years', () => {
  for (const value of ['2026-02-30','2025-02-29','1900-02-29','2026-04-31','2026-13-01','2026-00-10','2026-01-00','2026-01-32']) {
    assert.equal(dateVal(value),null,value);
    assert.equal(dateVal(value+'T08:00'),null,value+' timestamp');
  }
  assert.equal(dateVal('2024-02-29'),20240229);
  assert.equal(dateVal('2000-02-29T08:00'),20000229);
  assert.equal(dateVal('2026-04-30'),20260430);
});

test('all date columns keep invalid values last in both directions without modifying rows', () => {
  for (const column of [...TF_SORT,...RUSH_SORT,...WL_SORT].filter(c=>c.type==='date')) {
    const row = (id,value) => {
      const parts=column.key.split('.');
      return parts.length===2 ? {id,[parts[0]]:{[parts[1]]:value}} : {id,[parts[0]]:value};
    };
    const rows=[row('bad','2026-13-01'),row('early','2026-01-01'),row('impossible','2026-02-30'),row('late','2026-12-31'),row('empty','')];
    const original=structuredClone(rows);
    assert.deepEqual(applySort(rows,{...column,dir:'asc'}).map(r=>r.id),['early','late','bad','impossible','empty'],column.key);
    assert.deepEqual(applySort(rows,{...column,dir:'desc'}).map(r=>r.id),['late','early','bad','impossible','empty'],column.key);
    assert.deepEqual(rows,original);
  }
});
