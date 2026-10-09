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

test('tx 佔位替換：zh fallback 與三語都代入參數，缺參數保留佔位', () => {
  assert.equal(tx('工單 {code}', { code: 'XF-01' }), '工單 XF-01');
  assert.equal(tx('{date} 有 {n} 個問題', { date: '01/02(四)', n: 3 }), '01/02(四) 有 3 個問題');
  assert.equal(tx('工單 {code}'), '工單 {code}');
  I18N.lang = 'en';
  assert.equal(tx('工單 {code}', { code: 'XF-01' }), 'Order XF-01');
  assert.equal(tx('{name} 請假', { name: '阿明' }), 'Leave: 阿明');
  assert.equal(tx('新增 — {table}', { table: tx('欠缺品項') }), 'Add — Shortage');
  I18N.lang = 'zh-TW';
});

test('複合 modal 標題鍵（佔位式）全數有 en/vi/th 三語', () => {
  const keys = ['{date} · 手動排班','手動排班預覽 · 需要處理','手動排班預覽 · 確認','{date} 加班設定','新增員工','新增機台','工單 {code}','新增工單','{date} 有 {n} 個問題','Excel 匯入 · 請修正檔案','Excel 匯入 · 確認取代資料','{name} 請假','{name} 整月班表設定','新增 — {table}','編輯 — {table}','給二廠／回一廠','工作紀錄','工作內容設定','新增工作內容','一般工作排班','新增一般工作排班','方案比較　{n} 套'];
  for (const k of keys) for (const l of ['en','vi','th']) assert.ok(UI_TEXT[k]?.[l], `UI_TEXT[${JSON.stringify(k)}] 缺 ${l}`);
});
