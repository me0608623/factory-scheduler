// 主題範圍回歸：深色表格配色只能存在於 prefers-color-scheme:dark（自動）或
// [data-theme=dark]/[data-app-theme=dark]（手動）作用域內。
// 背景（2026-10-10 iPhone 淺色主題深色區塊 bug）：auto 時 root 無 data-* 屬性，
// 裸的 :not(:light) 選擇器在系統淺色時仍命中 → 深棕/深綠按鈕與儲存格。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const css = fs.readFileSync(path.join(src, 'styles.css'), 'utf8');

function auditAutoDarkSelectors(text) {
  const lines = text.split(/\r?\n/);
  let depth = 0, inDark = false, mediaDepth = 0;
  const bad = [];
  lines.forEach((l, i) => {
    if (/@media\s*\(prefers-color-scheme:\s*dark\)/.test(l)) { inDark = true; mediaDepth = depth; }
    if (/:root:not\(\[data-theme/.test(l) && !inDark) bad.push(i + 1);
    depth += (l.match(/{/g) || []).length - (l.match(/}/g) || []).length;
    if (inDark && depth <= mediaDepth) inDark = false;
  });
  return { bad, balance: depth };
}

test('所有 :root:not([data-theme=light]) 自動深色選擇器都包在 prefers-color-scheme:dark 內', () => {
  const { bad, balance } = auditAutoDarkSelectors(css);
  assert.deepEqual(bad, [], `未包 media query 的自動深色選擇器於行：${bad.join(', ')}（淺色系統會誤套深色）`);
  assert.equal(balance, 0, 'styles.css 括號必須平衡');
});

test('表格狀態列與精靈膠囊使用主題變數，不殘留無條件深色 hex', () => {
  for (const sel of ['.sheettable tr.matched td', '.sheettable tr.archived td', '.sheettable tr.returned td']) {
    const bodies = [...css.matchAll(new RegExp(sel.replace('.', '\\.') + '\\{([^}]*)\\}', 'g'))].map(m => m[1]);
    assert.ok(bodies.length >= 1, `缺少 ${sel} 規則`);
    bodies.forEach((b, i) => assert.doesNotMatch(b, /#123020|#1a1e24/, `${sel} 第${i + 1}條不可寫死深色 hex`));
  }
  assert.match(css, /tr\.matched td\{background:var\(--row-matched\)/, 'matched 應有 var(--row-matched) 版本');
  const wp = css.match(/\.wiz-pending\{display:inline-block;background:([^;]+);color:([^;]+)/);
  assert.ok(wp && wp[1].includes('var(--wiz-pending-bg)') && wp[2].includes('var(--wiz-pending-ink)'), 'wiz-pending 應使用主題變數');
  const wo = css.match(/\.wiz-ok\{display:inline-block;background:([^;]+);color:([^;]+)/);
  assert.ok(wo && wo[1].includes('var(--wiz-ok-bg)') && wo[2].includes('var(--wiz-ok-ink)'), 'wiz-ok 應使用主題變數');
  assert.match(css, /\.wiz-foot\{[^}]*background:var\(--wiz-foot-bg\)/, 'wiz-foot 應使用主題變數');
});

test('三個主題範圍都定義了 row/wiz 變數（淺色基底＋自動深色＋手動深色）', () => {
  const light = css.match(/:root\{--pg-f1-head:#ffe14a[^}]*\}/s)?.[0] || '';
  assert.match(light, /--row-matched:#e6f4ea/, '淺色基底缺 --row-matched');
  assert.match(light, /--wiz-foot-bg:rgba\(244,245,247/, '淺色基底缺 --wiz-foot-bg');
  const darkBlocks = css.match(/--row-matched:#123020/g) || [];
  assert.equal(darkBlocks.length, 2, `深色 --row-matched 應定義 2 次（auto+manual），實際 ${darkBlocks.length}`);
});

// —— WCAG 對比度（純數學，值來自 CSS 變數定義）——
function lum(hexOrRgb) {
  let m = hexOrRgb.match(/#([0-9a-f]{6})/i);
  let r, g, b;
  if (m) { r = parseInt(m[1].slice(0, 2), 16) / 255; g = parseInt(m[1].slice(2, 4), 16) / 255; b = parseInt(m[1].slice(4, 6), 16) / 255; }
  else { const n = hexOrRgb.match(/(\d+(\.\d+)?)/g).map(Number); r = n[0] / 255; g = n[1] / 255; b = n[2] / 255; }
  const f = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(fg, bg) {
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('狀態膠囊對比度：淺色主題（深字/淺底）≥ WCAG AA 4.5', () => {
  assert.ok(ratio('#9a5200', '#fef7e0') >= 4.5, `wiz-pending 淺色對比 ${ratio('#9a5200', '#fef7e0').toFixed(2)}`);
  assert.ok(ratio('#14672d', '#e6f4ea') >= 4.5, `wiz-ok 淺色對比 ${ratio('#14672d', '#e6f4ea').toFixed(2)}`);
  assert.ok(ratio('#20252c', '#ffe14a') >= 4.5, `一廠表頭（淺黃底/深字）對比 ${ratio('#20252c', '#ffe14a').toFixed(2)}`);
});

test('狀態膠囊對比度：深色主題（亮字/深底）≥ WCAG AA 4.5', () => {
  assert.ok(ratio('#F2B64A', '#382A0D') >= 4.5, `wiz-pending 深色對比 ${ratio('#F2B64A', '#382A0D').toFixed(2)}`);
  assert.ok(ratio('#4DD08B', '#123020') >= 4.5, `wiz-ok 深色對比 ${ratio('#4DD08B', '#123020').toFixed(2)}`);
});
