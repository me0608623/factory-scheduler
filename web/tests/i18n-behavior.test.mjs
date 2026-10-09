import test from 'node:test';
import assert from 'node:assert/strict';
import { tx, I18N } from '../src/i18n.js';

test('tx：zh-TW 查 UI_TEXT 回原文（fallback 安全）', () => {
  I18N.lang = 'zh-TW';
  assert.equal(tx('關閉'), '關閉');
  assert.equal(tx('刪除'), '刪除');
});

test('tx：en 查 UI_TEXT 回英文', () => {
  I18N.lang = 'en';
  assert.equal(tx('關閉'), 'Close');
  assert.equal(tx('刪除'), 'Delete');
});

test('tx：vi 查 UI_TEXT 回越南文', () => {
  I18N.lang = 'vi';
  assert.equal(tx('關閉'), 'Đóng');
  assert.equal(tx('刪除'), 'Xóa');
});

test('tx：th 查 UI_TEXT 回泰文', () => {
  I18N.lang = 'th';
  assert.equal(tx('關閉'), 'ปิด');
  assert.equal(tx('刪除'), 'ลบ');
});

test('tx：查不到的鍵回原文（永遠安全）', () => {
  I18N.lang = 'en';
  assert.equal(tx('不存在的鍵'), '不存在的鍵');
  I18N.lang = 'zh-TW';
});

test('tx：SETTINGS_TEXT 鍵名式也正常', () => {
  I18N.lang = 'en';
  assert.equal(tx('close'), 'Close');
  assert.equal(tx('save'), 'Save');
  I18N.lang = 'vi';
  assert.equal(tx('close'), 'Đóng');
  I18N.lang = 'zh-TW';
});

test('設定抽屜 en 變數：非 zh-TW 都應回 true（en/vi/th 看英文）', async () => {
  const fs = await import('node:fs');
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const match = source.match(/const en=UI\.prefs\.language([^,]+)/);
  assert.ok(match, 'en 變數存在');
  assert.ok(match[1].includes("!==") && match[1].includes("zh-TW"), 'en 應為 !== zh-TW（非中文都看英文）');
});
