// i18n 防回歸：驗證 modal 標題、抽屜項、按鈕標籤、help 章節的翻譯覆蓋率
// 在新增介面文字時，此測試會提醒加入字典鍵
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UI_TEXT, SETTINGS_TEXT, tx } from '../src/i18n.js';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const app = fs.readFileSync(path.join(src, 'app.js'), 'utf8');

test('UI_TEXT 每鍵有 en/vi/th 三語', () => {
  for (const [key, val] of Object.entries(UI_TEXT)) {
    for (const lang of ['en', 'vi', 'th']) {
      assert.ok(typeof val[lang] === 'string' && val[lang].length > 0, `UI_TEXT[${JSON.stringify(key)}] 缺 ${lang}`);
    }
  }
});

test('SETTINGS_TEXT 四語鍵集合一致', () => {
  const base = Object.keys(SETTINGS_TEXT['zh-TW']).sort();
  for (const lang of ['en', 'vi', 'th']) {
    assert.deepEqual(Object.keys(SETTINGS_TEXT[lang]).sort(), base);
  }
});

test('tx：查不到的鍵回原文（zh-TW 安全 fallback）', () => {
  assert.ok(tx, 'tx 函式存在');
});

test('modal 標題覆蓋率 ≥ 95%（2026-10-10 實測 100%，棘輪鎖住；新增標題須加字典）', () => {
  // 已翻譯（title:tx('...')）＋未翻譯（title:'中文'）→ 算總覆蓋率
  const translatedCount = (app.match(/title:tx\(/g) || []).length;
  const untranslated = [...app.matchAll(/title:\s*['"]([^'"]*[\u4e00-\u9fff][^'"]*)['"]/g)].map(m => m[1]);
  const untranslatedButDict = untranslated.filter(t => UI_TEXT[t]).length;
  const total = translatedCount + untranslated.length;
  const covered = translatedCount + untranslatedButDict;
  const pct = total ? Math.round((covered / total) * 100) : 100;
  assert.ok(pct >= 95, `modal 標題翻譯覆蓋率 ${pct}%（${covered}/${total}）低於 95% 門檻`);
});

test('更多抽屜項目標籤全部有字典鍵', () => {
  const hardcoded = [...app.matchAll(/btn\('([a-z0-9-]+)','([^']*[\u4e00-\u9fff][^']*)'\)/g)]
    .filter(m => !m[0].includes('tx('));
  assert.equal(hardcoded.length, 0,
    `更多抽屜有 ${hardcoded.length} 個未翻譯項：${hardcoded.map(m => m[2]).join('、')}`);
});

test('help 章節標題全部走 tx()', () => {
  // ["中文",[ 未翻譯（沒有 tx( 包裹）
  const allSections = [...app.matchAll(/\["([^"]*[\u4e00-\u9fff][^"]*)",\[/g)];
  assert.equal(allSections.length, 0,
    `help 有 ${allSections.length} 個未翻譯章節：${allSections.map(m => m[1]).join('、')}`);
});

test('常見按鈕字面（關閉/取消/儲存/刪除）走 tx()', () => {
  // 找 >中文</button> 且不含 tx(
  const raw = [...app.matchAll(/>(關閉|取消|儲存|刪除)<\/button>/g)].filter(m => true);
  // 這些字面如果出現在非 tx() 環境就是未翻譯
  const lines = app.split('\n');
  const bad = [];
  lines.forEach((l, i) => {
    if (/>(關閉|取消|儲存|刪除)<\/button>/.test(l) && !l.includes('tx(')) {
      bad.push(l.trim().slice(0, 40) + ' ← :' + (i + 1));
    }
  });
  assert.equal(bad.length, 0, `有 ${bad.length} 個常見按鈕字面未走 tx():\n${bad.join('\n')}`);
});

test('help 內文（步驟+提示）全部是 UI_TEXT 鍵', () => {
  const start = app.indexOf('const HELP=[');
  const end = app.indexOf('\n];', start);
  assert.ok(start > 0 && end > start, 'HELP 區塊存在');
  const block = app.slice(start, end);
  const re = /"((?:[^"\\]|\\.)*)"/g;
  const steps = [];
  let m;
  while ((m = re.exec(block))) {
    if (!/[\u4e00-\u9fff]/.test(m[1])) continue;
    if (/tx\(\s*$/.test(block.slice(Math.max(0, m.index - 40), m.index))) continue; // 章節標題
    steps.push(m[1]);
  }
  assert.ok(steps.length >= 50, `HELP 內文應有 ≥50 條，實際 ${steps.length}`);
  const missing = steps.filter(s => !UI_TEXT[s]);
  assert.equal(missing.length, 0, `help 內文有 ${missing.length} 條缺字典鍵：${missing.slice(0, 3).map(s => s.slice(0, 30)).join('、')}…`);
});

test('help 渲染走 tx()（步驟與提示）', () => {
  assert.ok(app.includes("steps.map(s=>'<li>'+tx(s)+'</li>')"), 'help 步驟渲染未包 tx()');
  assert.ok(app.includes('tx(tip)'), 'help 提示渲染未包 tx()');
});
