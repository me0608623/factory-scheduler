// CSS 結構防回歸：括號不平衡會讓瀏覽器丟棄後續所有規則（白畫面等級），
// 動態組合類別（'rs-'+type、'nav-'+page、"tour-"+arrow）無法被靜態掃描，須明文保護。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const css = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'styles.css'), 'utf8');

test('styles.css 括號平衡', () => {
  let d = 0;
  for (const c of css) { if (c === '{') d++; else if (c === '}') d--; }
  assert.equal(d, 0, '大括號不平衡會讓瀏覽器丟棄之後的所有規則');
});

test('動態組合類別與共用樣式仍在（死碼清理不得誤刪）', () => {
  for (const c of ['rs-leave','rs-regular','rs-rest','nav-more','nav-notes','nav-orders','nav-output','nav-people','nav-worklog','tour-up','tour-down','tf-board','tf-row','top-main','top-status','side-brand','side-profile','side-footer'])
    assert.ok(css.includes('.' + c), '樣式 .'+c+' 遺失（它由 JS 動態組合類名，靜態掃描看不到）');
});

test('已結案的死碼類別沒有回流', () => {
  for (const c of ['more-tools','reference-panel','rush-table','rush-sec','side-chrome','drawer-grip','drawer-zoom','codelink','urgent-tag','top-actions','mobile-only','toolset','flash-new','sep-l','diff-result','brush-start','cal-brush-active'])
    assert.ok(!new RegExp('\\.' + c + '(?![a-zA-Z0-9_-])').test(css), '.'+c+' 已結案移除，不應回流');
});
