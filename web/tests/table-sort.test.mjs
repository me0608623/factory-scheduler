// table-sort / table-marks：比較器、穩定排序、標記存取（個人裝置偏好）
import test from 'node:test';
import assert from 'node:assert/strict';
import { applySort, dateVal, timeVal, numVal, cmpBy, TF_SORT, RUSH_SORT, WL_SORT } from '../src/table-sort.js';

const rows = (arr) => arr.map((v, i) => ({ id: 'r' + i, v }));

test('dateVal：有效日期 → YYYYMMDD；無效/空 → null（排尾）', () => {
  assert.equal(dateVal('2026-10-05'), 20261005);
  assert.equal(dateVal('2026-10-05T08:00'), 20261005);
  assert.equal(dateVal(''), null);
  assert.equal(dateVal('舊資料'), null);
  assert.equal(dateVal(null), null);
});

test('排序：日期升降冪＋空值恆排尾', () => {
  const data = [{ id: 'a', d: '2026-10-02' }, { id: 'b', d: '2026-10-01' }, { id: 'c', d: '' }, { id: 'e', d: '2026-10-03' }];
  const spec = { key: 'd', dir: 'asc', type: 'date', get: r => dateVal(r.d) };
  assert.deepEqual(applySort(data, spec).map(r => r.id), ['b', 'a', 'e', 'c']);
  assert.deepEqual(applySort(data, { ...spec, dir: 'desc' }).map(r => r.id), ['e', 'a', 'b', 'c']);
});

test('排序：時間（時:分合成值）與數量數值比較', () => {
  assert.equal(timeVal(9, 30), 570);
  const nums = [{ id: 'a', n: 120 }, { id: 'b', n: 15 }, { id: 'c', n: null }];
  const spec = { key: 'n', dir: 'asc', type: 'num', get: r => numVal(r.n) };
  assert.deepEqual(applySort(nums, spec).map(r => r.id), ['b', 'a', 'c']);
  assert.deepEqual(applySort(nums, { ...spec, dir: 'desc' }).map(r => r.id), ['a', 'b', 'c']);
});

test('排序：文字 zh localeCompare（含數字感知）', () => {
  const data = [{ id: 'a', t: 'A10' }, { id: 'b', t: 'A2' }, { id: 'c', t: '中文' }];
  const spec = { key: 't', dir: 'asc', type: 'text', get: r => r.t };
  const out = applySort(data, spec).map(r => r.id);
  assert.ok(out.includes('b') && out.includes('a') && out.indexOf('b') < out.indexOf('a'), 'A2 應排在 A10 前（numeric）');
});

test('排序：相同值穩定（原始順序固定，不跳動）', () => {
  const data = rows([5, 3, 5, 3, 5]);
  const spec = { key: 'v', dir: 'asc', type: 'num', get: r => r.v };
  const out = applySort(data, spec).map(r => r.id);
  assert.deepEqual(out, ['r1', 'r3', 'r0', 'r2', 'r4']);
});

test('cmpBy：null 在兩個方向都墊底（由 applySort 處理方向）', () => {
  assert.equal(cmpBy('num', null, 1) > 0, true);
  assert.equal(cmpBy('num', 1, null) < 0, true);
  assert.equal(cmpBy('num', null, null), 0);
});

test('三張表欄位定義齊備（給二廠7/欠缺6/工作紀錄8）', () => {
  assert.equal(TF_SORT.length, 7);
  assert.equal(RUSH_SORT.length, 6);
  assert.equal(WL_SORT.length, 8);
  for (const c of [...TF_SORT, ...RUSH_SORT, ...WL_SORT]) {
    assert.ok(c.key && c.label && ['date', 'num', 'text', 'time'].includes(c.type) && typeof c.get === 'function', c.key);
  }
  // wl 時間欄 get 合成時:分
  const wlStart = WL_SORT.find(c => c.key === 'start');
  assert.equal(wlStart.get({ startH: 8, startM: 30 }), 510);
  assert.equal(wlStart.get({}), null);
});

test('接線：三張表都有 sortTh/sortBar/tableSorted/標記按鈕（防拆線）', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  for (const t of ['tf', 'rush', 'wl']) {
    assert.ok(app.includes('tableSorted('), '缺少 tableSorted 呼叫');
    assert.ok(app.includes('sortBar("' + t + '"'), t + ' 缺 sortBar');
    assert.ok(app.includes('markBtns("' + t + '"'), t + ' 缺 markBtns');
  }
  assert.ok(app.includes('case "sort-col"') && app.includes('case "mk-save"') && app.includes('case "mk-clear"'), '缺少排序/標記動作');
});
