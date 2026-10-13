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

test('輪43 棘輪：EN 掃描發現的缺譯呼叫點必須走 tx（抽屜鈕/空狀態/廠別/日期星期/本機徽章）', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const factory = fs.readFileSync(new URL('../src/factory.js', import.meta.url), 'utf8');
  // 抽屜三鈕＋復原
  assert.match(app, /btn\('manual-add',tx\('＋手動排班'\)/, '＋手動排班須 tx');
  assert.match(app, /btn\('auto',tx\('⚡ 自動排班'\)/, '⚡ 自動排班須 tx');
  assert.match(app, /btn\('undo',tx\('復原上一步'\)/, '復原上一步須 tx');
  // 空狀態與一般工作區
  assert.match(app, /tx\('這天還沒有排程。可按「＋手動排班」安排未排入的工作，或使用「自動排程」。'\)/, '看板空狀態須 tx');
  assert.match(app, /workGridHTML\(tx\('一般工作／純人工排班'\)/, '一般工作區標題須 tx');
  assert.match(app, /workGridHTML\(tx\('依工作內容查看'\)/, '依工作內容查看標題須 tx');
  // 廠別：中央 factoryName 走 tx；頂欄/平面圖/分組 select 同
  assert.match(factory, /factoryName = value => tx\(/, 'factoryName 須走 tx');
  assert.match(app, /\[\[1,tx\('1 廠'\)\],\[2,tx\('2 廠'\)\]\]/, '廠別標籤須 tx');
  // 日期星期：mdw 依語言輸出（EN (Tue)／zh（二））
  assert.match(app, /WD_EN=\["Sun","Mon","Tue"/, 'mdw 需有英文星期表');
  // 本機徽章
  assert.match(app, /:tx\('本機'\)\)/, '本機徽章須 tx');
  // 平面圖圖例與提示
  assert.match(app, /tx\(\{busy:'排程中',idle:'閒置',fault:'故障'\}\[st\]\)/, '平面圖圖例須 tx');
  assert.match(app, /tx\('目前為自動排列/, '平面圖提示須 tx');
});
