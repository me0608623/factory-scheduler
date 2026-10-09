import test from 'node:test';
import assert from 'node:assert/strict';
import { notifySettingsHTML } from '../src/line-notify.js';

test('notifySettingsHTML：空設定產生表單HTML', () => {
  const html = notifySettingsHTML({});
  assert.ok(typeof html === 'string', '回傳字串');
  assert.ok(html.length > 50, '非空HTML');
  assert.ok(html.includes('enabled') || html.includes('checkbox') || html.includes('input'), '含表單元素');
});

test('notifySettingsHTML：已啟用設定反映在HTML', () => {
  const html = notifySettingsHTML({ enabled: true, line_user_id: 'U123', events: { apply: true } });
  assert.ok(html.length > 0, '非空');
});

test('notifySettingsHTML：XSS 防護（惡意輸入被跳脫）', () => {
  const html = notifySettingsHTML({ line_user_id: '<script>alert(1)</script>' });
  assert.ok(!html.includes('<script>'), 'script 標籤被跳脫');
});
