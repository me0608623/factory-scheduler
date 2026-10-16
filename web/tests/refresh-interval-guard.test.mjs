import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

// #68：每分鐘背景刷新「今天」看板，不得清掉使用者正在輸入的內容
// （頁表 cellinp 未 blur 前，輸入只存在 DOM；頁面輸入如 wl-date 的未提交字元同理）
test('minute refresh skips inline cell edits and page views',()=>{
  const line=app.split('\n').find(l=>l.includes('setInterval')&&l.includes('render();},60000)'));
  assert.ok(line,'minute refresh interval exists');
  assert.ok(line.includes('!UI.editCell'),'must skip while a table cell edit is in progress (uncommitted text lives only in the DOM)');
  assert.ok(line.includes('!UI.page'),'must skip while a page view (worklog/shortage/transfer filters) is open');
  assert.ok(line.includes('!UI.modal')&&line.includes('!PV')&&line.includes('!drag'),'existing guards kept');
});
