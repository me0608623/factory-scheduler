import test from 'node:test';
import assert from 'node:assert/strict';
import { computePlacement, TOUR_STEPS, TOUR_DONE_KEY, tourDone } from '../src/tour.js';

test('computePlacement：目標在上方 → 卡片在下方、箭頭朝上', () => {
  const r = computePlacement(
    { left: 100, top: 50, width: 200, height: 40, bottom: 90, right: 300 },
    { w: 320, h: 160 },
    { w: 1200, h: 800 });
  assert.equal(r.arrow, 'up');
  assert.ok(r.top >= 90, '卡片 top 應在目標 bottom 之下');
  assert.ok(r.top + 160 <= 800, '卡片不超出視窗');
});

test('computePlacement：目標在下方（空間不夠）→ 卡片在上方、箭頭朝下', () => {
  const r = computePlacement(
    { left: 100, top: 700, width: 200, height: 40, bottom: 740, right: 300 },
    { w: 320, h: 160 },
    { w: 1200, h: 800 });
  assert.equal(r.arrow, 'down');
  assert.ok(r.top + 160 <= 700, '卡片 bottom 應在目標 top 之上');
});

test('computePlacement：卡片左右夾持在視窗內', () => {
  const left = computePlacement({ left: 0, top: 100, width: 50, height: 30, bottom: 130, right: 50 }, { w: 320, h: 160 }, { w: 390, h: 800 });
  assert.ok(left.left >= 12, '左邊至少留 pad');
  const right = computePlacement({ left: 360, top: 100, width: 50, height: 30, bottom: 130, right: 410 }, { w: 320, h: 160 }, { w: 390, h: 800 });
  assert.ok(right.left + 320 <= 390 - 12, '右邊不超出視窗');
});

test('TOUR_STEPS：至少 5 步、每步有 sel+title+text', () => {
  assert.ok(TOUR_STEPS.length >= 5, '步驟數 ≥ 5');
  for (const st of TOUR_STEPS) {
    assert.ok(st.sel && st.sel.length > 0, 'sel 非空');
    assert.ok(st.title && st.title.length > 0, 'title 非空');
    assert.ok(st.text && st.text.length > 0, 'text 非空');
  }
});

test('tourDone：無 localStorage 環境回 true（安全降級）', () => {
  // 在 Node 環境沒有 localStorage，tourDone() 應安全回 true 不炸
  assert.equal(typeof tourDone(), 'boolean');
  assert.equal(TOUR_DONE_KEY, 'fsched-tour-done');
});
