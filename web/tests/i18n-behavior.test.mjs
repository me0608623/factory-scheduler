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

test('輪115 棘輪：匯出視窗 hint/CSV 與匯入預覽摘要、警告、確認 toast 全走 tx', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const mustTx = [
    '舊版排程可獨立存為歷史資料',
    '下載全部明細 CSV 檔',
    '員工 {e} 人、機台 {m} 台、產品 {p} 種、工單 {o} 張',
    '匯入範本尚未包含獨立工作內容與一般工作排班',
    '目前匯入範本未包含分組與組員對照',
    '確認後將以 Excel 內容取代現有員工、機台、產品工序與工單',
    '檔案：',
    '匯入範本不含一般工作／跨廠加工資料',
    '目前匯入範本不含分組',
    '目前範本沒有廠別欄',
    '排程已更新，請重新選擇 Excel 檔案預覽',
    '匯入會清空既有排程',
    'Excel 匯入完成。請建立新排程',
    '歷史排程已存入；目前排程沒有變動',
  ];
  for (const key of mustTx) {
    assert.ok(app.includes(`tx('${key}`) || app.includes(`tx("${key}`), `呼叫點須包 tx：${key}`);
  }
});

test('輪115 查證：匯入流程鍵 en/vi/th 皆有譯文（非 zh 語言無 CJK 洩漏）', () => {
  const keys = [
    '下載全部明細 CSV 檔',
    '舊版排程可獨立存為歷史資料，按日期查看 1 廠、2 廠，不改目前排程。批次匯入範本會取代基本資料，只有老闆能確認。',
    '員工 {e} 人、機台 {m} 台、產品 {p} 種、工單 {o} 張',
    '檔案：',
    '匯入範本尚未包含獨立工作內容與一般工作排班，不能覆蓋已建立的資料。歷史排程仍可獨立匯入。',
    '目前匯入範本未包含分組與組員對照，不能覆蓋已建立分組的正式名冊。歷史排程仍可獨立匯入。',
    '確認後將以 Excel 內容取代現有員工、機台、產品工序與工單，並清空現有 {n} 段排程；上班日設定保留。匯入後再按「自動排程」建立新班表。',
    '匯入範本不含一般工作／跨廠加工資料，不能覆蓋目前名冊',
    '目前匯入範本不含分組，不能覆蓋已有分組的正式名冊',
    '目前範本沒有廠別欄，不能覆蓋已設定的 2 廠資料',
    '排程已更新，請重新選擇 Excel 檔案預覽',
    '匯入會清空既有排程；還需要「調整與自動排程」權限',
    'Excel 匯入完成。請建立新排程',
    '歷史排程已存入；目前排程沒有變動',
  ];
  const cjk = /[\u4e00-\u9fff]/;
  for (const lang of ['en', 'vi', 'th']) {
    I18N.lang = lang;
    for (const key of keys) {
      const out = tx(key, { e: 3, m: 2, p: 1, o: 4, n: 5, date: '10/13 (Tue)' });
      assert.notEqual(out, key, `${lang} 缺譯：${key}`);
      assert.ok(!cjk.test(out), `${lang} 譯文含中文：${key} → ${out}`);
    }
  }
  // 佔位符替換有效性
  I18N.lang = 'en';
  assert.equal(tx('員工 {e} 人、機台 {m} 台、產品 {p} 種、工單 {o} 張', { e: 3, m: 2, p: 1, o: 4 }), '3 employees, 2 machines, 1 products, 4 orders');
  assert.equal(tx('檔案：'), 'File: ');
  I18N.lang = 'zh-TW';
});

test('輪116 棘輪：匯入解析必須先開 loading 回饋、完成後以 loading 態守門（防關窗後覆寫）', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const loadOpen = 'openModal({t:"import-preview",filename:file.name,base,loading:true,errors:[],data:null})';
  assert.ok(app.includes(loadOpen), '解析前必須先開 loading modal');
  const loadIdx = app.indexOf(loadOpen);
  const importIdx = app.indexOf('await import("./excel.js")', loadIdx);
  assert.ok(importIdx > loadIdx, 'loading modal 必須在動態載入 excel 模組之前開啟');
  const handler = app.slice(loadIdx, loadIdx + 2000);
  assert.ok((handler.match(/!UI\.modal\.loading/g) || []).length >= 2, '成功與錯誤路徑都要以 loading 態守門');
  assert.ok(app.includes("if(m.loading)return {title:tx('Excel 匯出／匯入'),body:'<div class=\"hint\">'+tx('正在解析 Excel…')+'</div>'}"), 'import-preview 須渲染 loading 態');
});

test('輪116 查證：正在解析 Excel… 三語有譯文', () => {
  const cjk = /[\u4e00-\u9fff]/;
  for (const lang of ['en', 'vi', 'th']) {
    I18N.lang = lang;
    const out = tx('正在解析 Excel…');
    assert.notEqual(out, '正在解析 Excel…');
    assert.ok(!cjk.test(out), `${lang} 譯文含中文：${out}`);
  }
  I18N.lang = 'zh-TW';
});

test('輪120 查證：排程比對結果鍵三語有譯文＋佔位符正確', () => {
  const cjk = /[\u4e00-\u9fff]/;
  const keys = ['{a} 段 vs {b} 段 · 共同 {c} 段 · {m1} 台 vs {m2} 台 · {e1} 人 vs {e2} 人', '只在 {d}（被移除或改時間）', '只在 {d}（新增或改時間）', '請選兩個不同日期'];
  for (const lang of ['en', 'vi', 'th']) {
    I18N.lang = lang;
    for (const k of keys) {
      const out = tx(k, { a: 2, b: 2, c: 1, m1: 2, m2: 2, e1: 1, e2: 2, d: '10/21' });
      assert.notEqual(out, k, `${lang} 缺譯：${k}`);
      assert.ok(!cjk.test(out), `${lang} 譯文含中文：${out}`);
    }
  }
  I18N.lang = 'en';
  assert.equal(tx('{a} 段 vs {b} 段 · 共同 {c} 段 · {m1} 台 vs {m2} 台 · {e1} 人 vs {e2} 人', { a: 2, b: 2, c: 1, m1: 2, m2: 2, e1: 1, e2: 2 }), '2 blocks vs 2 blocks · 1 in common · 2 vs 2 machines · 1 vs 2 people');
  I18N.lang = 'zh-TW';
});

test('輪121 棘輪：產能分析工單狀態必須走 orderStatus（完成需回報，不得用計畫量充數）＋副標/小時已譯', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const i = app.indexOf('function analyticsPageHTML');
  const seg = app.slice(i, i + 6000);
  assert.ok(i > 0, 'analyticsPageHTML 存在');
  assert.ok(seg.includes('const st=orderStatus(o);'), '工單狀態統計必須複用 orderStatus（與抽屜同口徑）');
  assert.ok(!/effectiveBlockQty/.test(seg), '分析頁不得用 effectiveBlockQty 統計完成（無回報時回傳計畫量）');
  assert.ok(seg.includes("tx('{y} 年 {m} 月（至 {d}）"), '頁首副標須走 tx');
  assert.ok(seg.includes("tx('{h} 小時'"), '加班小時單位須走 tx');
});

test('輪121 查證：產能分析新鍵三語有譯文', () => {
  const cjk = /[\u4e00-\u9fff]/;
  for (const lang of ['en', 'vi', 'th']) {
    I18N.lang = lang;
    const a = tx('{y} 年 {m} 月（至 {d}） · {w} 個工作天 · {e} 位員工 · {n} 台設備', { y: 2026, m: 10, d: '10/14', w: 1, e: 5, n: 5 });
    const b = tx('{h} 小時', { h: 2.5 });
    assert.ok(!cjk.test(a), `${lang} 副標殘留中文：${a}`);
    assert.ok(!cjk.test(b), `${lang} 小時殘留中文：${b}`);
  }
  I18N.lang = 'zh-TW';
});

test('輪121 棘輪：?view= 導航不得清掉其他 query 參數（缺陷#23 local=1/mode=test 重載落入登入牆）', async () => {
  const fs = await import('node:fs');
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.ok(!app.includes('history.replaceState(null,"","?view='), '不得整條 query 換成 ?view=（會丟 local=1/mode=test）');
  assert.ok(!app.includes('history.replaceState(null,"",location.pathname)'), '清 view 也不得丟其他參數（須走 setUrlView(null)）');
  const callSites = (app.match(/setUrlView\(/g) || []).length;
  assert.ok(callSites >= 10, `setUrlView 呼叫點應≥10（helper+9 站點），實得 ${callSites}`);
});

test('輪124 查證：掃描批次②新鍵三語有譯文（聊天鈕/管理模式/缺席/計畫/頁標）', () => {
  const cjk = /[\u4e00-\u9fff]/;
  const keys = ['✦ 排程助理', '管理模式', '今日缺席 {n} 人', '計畫 {p}', '計畫 {p}｜回報 {a}', '{date} 計畫總件數', '左邊一廠欠貨，右邊二廠何時補。同一列同一張單。', '料送二廠加工，何時要回一廠。與欠缺品項分開。'];
  for (const lang of ['en', 'vi', 'th']) {
    I18N.lang = lang;
    for (const k of keys) {
      const out = tx(k, { n: 0, p: 100, a: 80, date: '10/14 (Wed)' });
      assert.notEqual(out, k, `${lang} 缺譯：${k}`);
      assert.ok(!cjk.test(out), `${lang} 譯文含中文：${out}`);
    }
  }
  I18N.lang = 'zh-TW';
});
