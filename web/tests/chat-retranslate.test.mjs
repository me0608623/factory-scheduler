import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../src/chat-ui.js',import.meta.url),'utf8');

test('#D4 語言切換需重譯聊天面板：refresh 偵測 I18N.lang 變更並呼叫 retranslate',()=>{
  assert.ok(src.includes("if(I18N.lang!==lastLang){lastLang=I18N.lang;retranslate();}"),'refresh 內須有語言變更偵測→retranslate');
  assert.ok(src.includes('const retranslate=()=>'),'須定義 retranslate');
  assert.ok(src.includes("let lastLang=I18N.lang"),'須追蹤 lastLang');
});

test('#D4 送出鈕還原與 mic placeholder 不得再寫死中文',()=>{
  assert.ok(!src.includes("submit.textContent='送出'"),'busy 結束/清除還原須走 tx()');
  assert.ok(!src.includes("input.placeholder='問我排程"),'mic 事件 placeholder 須走 tx()');
  assert.ok(src.includes("tx('送出')") && src.includes("tx('問我排程、請假、趕貨…')"));
});

test('#D4 retranslate 的快捷題目陣列須與初始面板六題一致',()=>{
  const m=src.match(/const QUICK=\[([^\]]+)\]/);
  assert.ok(m,'QUICK 陣列存在');
  const quick=eval('['+m[1]+']');
  assert.equal(quick.length,6,'六題快捷');
  for(const q of quick)assert.ok(src.includes("tx('"+q+"')"),'初始面板模板含 tx()：'+q);
});
