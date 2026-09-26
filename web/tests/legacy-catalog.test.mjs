import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyCatalog } from '../src/legacy-excel.js';

test('原檔名冊保留廠別、欄位與兩側機台，沒有推定技能', () => {
  const first = new Map([
    [1, new Map([['A', '成型1*2人--堅+利']])],
    [2, new Map([['B', '焊接'], ['N', '110'], ['O', '110'], ['AB', '菊']])],
  ]);
  const second = new Map([
    [2, new Map([['N', '金山'], ['AC', '包裝-梅+娟']])],
    [3, new Map([['N', '手動機7']])],
    [4, new Map([['N', '左'], ['O', '右']])],
  ]);
  const catalog = legacyCatalog(first, second);
  assert.deepEqual(catalog['1廠'].stations.map(x => x.label), ['焊接', '110', '110']);
  assert.equal(catalog['1廠'].people[0].label, '菊');
  assert.deepEqual(catalog['2廠'].stations.map(x => x.label), ['手動機7（左）', '手動機7（右）', '包裝']);
  assert.deepEqual(catalog['2廠'].people.map(x => x.label), ['金山', '包裝-梅+娟']);
  assert.equal(catalog['2廠'].people[0].skills, undefined);
});
