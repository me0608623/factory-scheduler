import test from 'node:test';
import assert from 'node:assert/strict';
import { tx, I18N, SETTINGS_TEXT, UI_TEXT } from '../src/i18n.js';

test('UI_TEXT 每個鍵都有 en/vi/th 三語', () => {
  for (const [k, v] of Object.entries(UI_TEXT)) {
    for (const lang of ['en', 'vi', 'th']) {
      assert.ok(typeof v[lang] === 'string' && v[lang].length > 0, `UI_TEXT[${k}] 缺 ${lang}`);
    }
  }
});

test('SETTINGS_TEXT 四語鍵集合一致', () => {
  const langs = Object.keys(SETTINGS_TEXT);
  assert.deepEqual(langs.sort(), ['en', 'th', 'vi', 'zh-TW']);
  const base = Object.keys(SETTINGS_TEXT['zh-TW']).sort();
  for (const l of langs) {
    assert.deepEqual(Object.keys(SETTINGS_TEXT[l]).sort(), base, `${l} 鍵集不一致`);
  }
});

test('tx：鍵名式與原文式都查得到；查不到時回原文（zh-TW 安全 fallback）', () => {
  I18N.lang = 'zh-TW';
  assert.equal(tx('關閉'), '關閉');
  assert.equal(tx('不存在的鍵'), '不存在的鍵');
  I18N.lang = 'en';
  assert.equal(tx('close'), 'Close');          // 鍵名式
  assert.equal(tx('未排工作'), 'Unscheduled');   // 原文式
  assert.equal(tx('不存在的鍵'), '不存在的鍵');
  I18N.lang = 'vi';
  assert.equal(tx('未排工作'), 'Chưa xếp lịch');
  I18N.lang = 'th';
  assert.equal(tx('產能分析'), 'วิเคราะห์กำลังผลิต');
  I18N.lang = 'zh-TW';
});
