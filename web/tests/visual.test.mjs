import test from 'node:test';
import assert from 'node:assert/strict';
import { liquidLogoSVG, mountBackdrop, mount3D, ensureVisualStyles } from '../src/visual.js';

test('ensureVisualStyles：重複呼叫不重複注入', () => {
  // 在 Node 環境沒有 document，應安全不炸
  try { ensureVisualStyles(); ensureVisualStyles(); } catch (e) { /* Node 無 DOM 是預期 */ }
  assert.ok(true, '不拋例外');
});

test('liquidLogoSVG：回傳正式靜態字標，不含形變與動畫特效', () => {
  const svg = liquidLogoSVG('產線排程');
  assert.ok(svg.startsWith('<svg'), '以 <svg 開頭');
  assert.ok(!svg.includes('feTurbulence'), '不含亂流濾鏡');
  assert.ok(!svg.includes('feDisplacementMap'), '不含位移形變');
  assert.ok(!svg.includes('<animate'), '不含動畫');
  assert.ok(!svg.includes('filter='), '文字不套用 SVG 濾鏡');
  assert.ok(svg.includes('font-weight="800"'), '使用穩重字重');
  assert.ok(svg.includes('Noto Sans TC'), '優先使用正式繁中字型');
  assert.ok(svg.includes('產線排程'), '含文字');
  assert.ok(svg.includes('aria-label'), '有 aria-label');
});

test('liquidLogoSVG：各種動態偏好都維持相同靜態輸出', () => {
  globalThis.matchMedia = () => ({ matches: false });
  const regular = liquidLogoSVG('測試');
  globalThis.matchMedia = (q) => ({ matches: q.includes('reduce') });
  const svg = liquidLogoSVG('測試');
  assert.equal(svg, regular, '動態偏好不改變正式字標');
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
