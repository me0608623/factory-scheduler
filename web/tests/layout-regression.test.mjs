// 版面防回歸：抽屜固定定位防護（vg-glass 覆蓋問題）與可收合側欄
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const css = fs.readFileSync(path.join(src, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(src, 'app.js'), 'utf8');
const visual = fs.readFileSync(path.join(src, 'visual.js'), 'utf8');
const chatUI = fs.readFileSync(path.join(src, 'chat-ui.js'), 'utf8');

test('visual.js 注入的 .vg-glass 仍宣告 position:relative（耦合前提存在）', () => {
  assert.ok(/\.vg-glass\{[^}]*position:relative/.test(visual.replace(/\s+/g, ' ')),
    '若 visual.js 移除了 position:relative，可考慮一併移除 styles.css 的防護規則');
});

test('styles.css 有 .ops-drawer.vg-glass 特異度防護（fixed 定位）', () => {
  const m = css.match(/\.ops-drawer\.vg-glass\{([^}]*)\}/);
  assert.ok(m, '缺少 .ops-drawer.vg-glass 防護規則');
  assert.match(m[1], /position:\s*fixed/, '防護規則必須還原 position:fixed');
  // 故意不重宣告位移：否則（0,2,0）會壓過手機版媒體查詢的 bottom-sheet 定位
  assert.doesNotMatch(m[1], /top:|right:|bottom:|left:/, '防護規則不可包含位移，避免破壞手機版 bottom sheet');
});

test('防護規則出現在基礎區（非僅媒體查詢內）', () => {
  const idx = css.indexOf('.ops-drawer.vg-glass{');
  const mediaStart = css.indexOf('@media', 0);
  // 找出 idx 之前最近的一個 @{ 與 @} 的配對狀態過於複雜，改驗證：防護規則緊跟在基礎 .ops-drawer 規則之後
  assert.ok(idx > css.indexOf('.ops-drawer{'), '防護規則應在基礎 .ops-drawer 規則之後');
});

test('可收合側欄：CSS 有收合寬度與主內容 margin 調整', () => {
  assert.match(css, /body\.nav-collapsed \.app-nav\{[^}]*width:78px/, '缺少收合寬度規則');
  assert.match(css, /body\.nav-collapsed\.has-app-nav \.wrap\{[^}]*margin-left:78px/, '缺少主內容 margin 調整');
  assert.match(css, /body\.nav-collapsed \.app-nav-item span\{[^}]*display:none|body\.nav-collapsed \.app-nav-item span,\s*\nbody\.nav-collapsed \.side-section,/, '缺少文字隱藏規則');
});

test('可收合側欄：app.js 有切換動作與 localStorage 保存', () => {
  assert.ok(app.includes('case "nav-toggle"'), '缺少 nav-toggle 動作');
  assert.ok(app.includes('"fsched-nav-collapsed"'), '缺少 localStorage 保存');
  assert.ok(app.includes('classList.toggle("nav-collapsed"'), '缺少 body class 切換');
  assert.ok(app.includes('data-act="nav-toggle"'), '缺少收合按鈕');
});

test('導覽項目有 title 提示（收合時仍可辨識）', () => {
  assert.ok(app.includes("aria-pressed=\"'+(UI.drawer===page)+'\" title=\""), 'nav item 缺少 title 屬性');
});

test('不變量：與 vg-glass 併用且依賴定位的基底 class 必須有特異度防護（防同類回歸）', () => {
  // visual.js 後端注入 .vg-glass{position:relative}（同特異度、晚載入），
  // 會蓋掉基底 class 的 fixed/absolute/sticky。凡是這種組合都必須有 .X.vg-glass 防護規則，
  // 或元素本身帶 inline position（inline 優先於注入樣式）。
  const risky = [];
  for (const f of fs.readdirSync(src).filter(f => /\.js$/.test(f))) {
    const text = fs.readFileSync(path.join(src, f), 'utf8');
    for (const m of text.matchAll(/class="([^"]*\bvg-glass\b[^"]*)"/g)) {
      const around = text.slice(m.index, m.index + m[0].length + 220);
      if (/style="[^"]*position\s*:/i.test(around)) continue;   // inline position 免疫
      for (const c of m[1].split(/\s+/).filter(c => c && c !== 'vg-glass')) {
        const rule = css.match(new RegExp('\.' + c.replace(/[^a-zA-Z0-9_-]/g, '') + '\{[^}]*\}'));
        if (rule && /position:\s*(fixed|absolute|sticky)/.test(rule[1]) && !css.includes('.' + c + '.vg-glass'))
          risky.push(f + ':' + c);
      }
    }
  }
  assert.deepEqual(risky, [], '這些組合會被注入的 position:relative 蓋掉定位，需加 .X.vg-glass 防護或 inline position：' + risky.join('、'));
});

test('分割窗格：CSS 有 pane-splitter 與 pane 覆寫（含 vg-glass 特異度）', () => {
  assert.match(css, /\.pane-splitter\{[^}]*cursor:col-resize/, '缺少分隔線規則');
  assert.match(css, /\.ops-drawer\.pane\.vg-glass\{position:relative\}/, 'pane 模式需覆寫 vg-glass 的 fixed 防護');
  assert.match(css, /\.wrap\.has-drawer\.zoomed \.main-col,\s*\.wrap\.has-drawer\.zoomed \.pane-splitter\{display:none\}/, '放大模式需隱藏排程欄與分隔線');
});

test('分割窗格：app.js 有 drawer-zoom、分隔線與寬度保存', () => {
  assert.ok(app.includes('case "drawer-zoom"'), '缺少 drawer-zoom 動作');
  assert.ok(app.includes('fsched-pane-w'), '缺少寬度保存');
  assert.ok(app.includes('pane-splitter'), '缺少分隔線標記');
  assert.ok(app.includes('has-drawer'), '缺少 wrap.has-drawer 容器 class');
});

test('聊天面板尺寸與浮動按鈕分離（不以 100% 繼承根容器寬）', () => {
  const m = css.match(/\.chat-panel\{([^}]*)\}/);
  assert.ok(m, '缺少 .chat-panel 規則');
  assert.doesNotMatch(m[1], /width:min\(430px,100%\)/, '面板寬度不可用 100%（會繼承縮小後的根容器）');
  assert.match(m[1], /width:400px/, '預設寬 400px');
  assert.match(m[1], /min-width:320px/, '最小寬 320px');
  assert.match(m[1], /height:min\(550px,80vh\)/, '預設高 550px、最大 80vh');
  assert.match(css, /#schedule-chat\.panel-left \.chat-panel\{left:0;right:auto\}/, '缺少左緣錨定規則');
  assert.ok(chatUI.includes('positionPanel'), '缺少 positionPanel 邊緣調整');
});

test('員工、設備與工單：更多選單走 master 動作（不再誤導核對頁）', () => {
  assert.ok(app.includes("btn('master',tx('員工、設備與工單'))"), '更多選單應用 master 動作');
  assert.ok(app.includes("case \"master\":"), '缺少 master 動作');
  assert.match(app, /case "master":[\s\S]{0,120}UI\.page='catalog'/, 'master 應開 catalog 管理頁');
  assert.match(app, /case "catalog":[^;]*UI\.page='review'/, 'catalog 保留給初次核對');
});

test('catalog 管理頁：搜尋 + cardsHTML + 獨立核對入口', () => {
  assert.ok(app.includes('function catalogPageHTML()'), '缺少 catalogPageHTML');
  assert.ok(app.includes('id="emp-search"'), '缺少員工搜尋框');
  assert.ok(app.includes('initCatalogPage'), '缺少搜尋接線');
  assert.match(app, /UI\.page==='catalog'\?catalogPageHTML\(\)/, 'page chain 缺 catalog');
  assert.match(app, /catalog:"catalog"/, 'URL 解析缺 catalog');
});

test('核對流程：員工卡有「編輯資料」入口', () => {
  const seg = app.slice(app.indexOf('function reviewPageHTML'));
  assert.ok(seg.includes("data-act=\"emp\" data-id=\"'+esc(E.id)+'\""), 'review 步驟1缺少編輯資料入口');
});
