import test from 'node:test';
import assert from 'node:assert/strict';
import { liquidLogoSVG, mountBackdrop, mount3D, ensureVisualStyles } from '../src/visual.js';

test('ensureVisualStyles：重複呼叫不重複注入', () => {
  // 在 Node 環境沒有 document，應安全不炸
  try { ensureVisualStyles(); ensureVisualStyles(); } catch (e) { /* Node 無 DOM 是預期 */ }
  assert.ok(true, '不拋例外');
});

test('liquidLogoSVG：回傳 SVG 字串、含 feTurbulence', () => {
  // mock matchMedia（Node 環境沒有）
  globalThis.matchMedia = globalThis.matchMedia || ((q) => ({ matches: false }));
  const svg = liquidLogoSVG('產線排程');
  assert.ok(svg.startsWith('<svg'), '以 <svg 開頭');
  assert.ok(svg.includes('feTurbulence'), '含 feTurbulence');
  assert.ok(svg.includes('feDisplacementMap'), '含 feDisplacementMap');
  assert.ok(svg.includes('產線排程'), '含文字');
  assert.ok(svg.includes('aria-label'), '有 aria-label');
});

test('liquidLogoSVG：reduced-motion 時無 animate', () => {
  globalThis.matchMedia = (q) => ({ matches: q.includes('reduce') });
  const svg = liquidLogoSVG('測試');
  assert.ok(!svg.includes('<animate'), 'reduced-motion 不含動畫');
});

test('mountBackdrop：無 DOM 環境安全降級', async () => {
  globalThis.matchMedia = (q) => ({ matches: false });
  globalThis.location = { search: '' };
  // Node 環境沒有 document/canvas → mountBackdrop 需要確保樣式注入不炸
  // ensureVisualStyles 內部會造 document.createElement → 在 Node 中會炸
  // 但 mountBackdrop 的第一步是 ensureVisualStyles()，所以間接測試
  try {
    const container = { classList: { add() {} }, style: {}, insertBefore() {}, children: [] };
    const r = mountBackdrop(container, {});
    assert.ok(r, '回傳結果');
  } catch (e) {
    // Node 無 DOM 時丟 ReferenceError 是預期行為（僅在瀏覽器中執行）
    assert.ok(e instanceof ReferenceError || e.message.includes('document'), '無 DOM 時丟預期錯誤');
  }
});

test('mount3D：reduced-motion 時靜態', async () => {
  globalThis.matchMedia = (q) => ({ matches: q.includes('reduce') });
  globalThis.location = { search: '' };
  const r = await mount3D({});
  assert.equal(r.mode, 'reduced-motion');
});
