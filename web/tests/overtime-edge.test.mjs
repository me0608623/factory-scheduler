import test from 'node:test';
import assert from 'node:assert/strict';
import { overtimeWeekdays, overtimeDefault, overtimeAllowed, overtimeStatus, ALL_WEEKDAYS } from '../src/overtime.js';

const emp = (over = {}) => ({ noOT: false, otWeekdays: [1,2,3,4,5], otOverrides: over });
const fri = '2026-10-09'; // 週五
const sat = '2026-10-10'; // 週六

test('ALL_WEEKDAYS：0-6 七天', () => {
  assert.equal(ALL_WEEKDAYS.length, 7);
  assert.deepEqual(ALL_WEEKDAYS, [0,1,2,3,4,5,6]);
});

test('overtimeWeekdays：noOT 員工回空陣列', () => {
  assert.deepEqual(overtimeWeekdays({ noOT: true, otWeekdays: [] }), []);
});

test('overtimeWeekdays：指定日期回原樣', () => {
  assert.deepEqual(overtimeWeekdays({ noOT: false, otWeekdays: [1,3,5] }), [1,3,5]);
});

test('overtimeWeekdays：無 otWeekdays 回全部（舊資料相容）', () => {
  assert.deepEqual(overtimeWeekdays({ noOT: false }), [...ALL_WEEKDAYS]);
  assert.deepEqual(overtimeWeekdays({ noOT: true }), []);
});

test('overtimeDefault：週五可加班、週六不可', () => {
  assert.equal(overtimeDefault(emp(), fri), true);
  assert.equal(overtimeDefault(emp(), sat), false);
});

test('overtimeAllowed：單日覆寫優先於週預設', () => {
  const e = emp({ [sat]: true }); // 週六覆寫為可加班
  assert.equal(overtimeAllowed(e, sat), true, '覆寫週六可加班');
  assert.equal(overtimeAllowed(e, fri), true, '週五照預設可');
});

test('overtimeAllowed：覆寫為 false 關閉加班', () => {
  const e = emp({ [fri]: false });
  assert.equal(overtimeAllowed(e, fri), false, '覆寫週五不可');
});

test('overtimeStatus：回傳 custom 旗標', () => {
  const e = emp({ [fri]: true });
  assert.equal(overtimeStatus(e, fri).custom, true);
  assert.equal(overtimeStatus(e, sat).custom, false);
});
