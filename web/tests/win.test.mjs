// win.js：clampRect 邊界約束的單元測試（純函式，不需 DOM）
import test from 'node:test';
import assert from 'node:assert/strict';
import { clampRect } from '../src/win.js';

test('clampRect：寬高下限保護（≥260×160）', () => {
  const c = clampRect(100, 100, 10, 10, 1920, 1080);
  assert.equal(c.w, 260);
  assert.equal(c.h, 160);
});

test('clampRect：寬高不超過可視範圍', () => {
  const c = clampRect(0, 0, 99999, 99999, 1200, 800);
  assert.ok(c.w <= 1200 - 12, `w=${c.w} 應 ≤1188`);
  assert.ok(c.h <= 800, `h=${c.h} 應 ≤800`);
});

test('clampRect：至少保留 60px 寬可抓回（不整扇拖出畫面右側）', () => {
  const c = clampRect(99999, 100, 470, 900, 1200, 800); // x 超界
  assert.ok(c.x <= 1200 - 60, `x=${c.x} 應 ≤1140`);
  assert.ok(c.x + 60 > 0 || c.x >= -410, '視窗左緣不可完全消失');
});

test('clampRect：y 至少露出 40px 高', () => {
  const c = clampRect(100, -9999, 470, 900, 1200, 800);
  assert.ok(c.y >= 0, 'y 不可為負到看不見');
  const c2 = clampRect(100, 99999, 470, 900, 1200, 800);
  assert.ok(c2.y <= 800 - 40, `y=${c2.y} 應 ≤760`);
});

test('clampRect：合理輸入原樣保留（四捨五入整數）', () => {
  const c = clampRect(300.4, 50.6, 470.2, 800.7, 1920, 1080);
  assert.equal(c.x, 300);
  assert.equal(c.y, 51);
  assert.equal(c.w, 470);
});

test('clampRect：左緣精確鉗制（至少露 60px，其餘可拖出左側）', () => {
  const c = clampRect(-9999, 100, 470, 900, 1200, 800);
  assert.equal(c.x, 6 - 470 + 60, 'x 應 = MARGIN - w + 60（w=470 → -404）');
  assert.ok(c.x + 470 >= 60, '視窗右緣至少留 60px 在畫面內');
});
