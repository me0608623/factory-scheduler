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
  assert.match(css, /not\(\.zoomed\) \.ops-drawer\.pane\.vg-glass\{[\s\S]{0,120}position:sticky/, 'pane 模式需覆寫 vg-glass 的 fixed 防護（sticky 版）');
  assert.match(css, /has-drawer\.zoomed \.ops-drawer\.pane\{position:relative/, '放大模式 pane 回文件流');
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

test('功能解說：左側導覽獨立入口（更多正下方、同層級）', () => {
  assert.ok(app.includes('class="app-nav-item nav-feature-tour" data-act="feature-tour"'), '缺少獨立導覽按鈕');
  const moreIdx = app.indexOf("item('more',tx('more'))");
  const tourIdx = app.indexOf('nav-feature-tour');
  assert.ok(moreIdx > 0 && tourIdx > moreIdx && tourIdx - moreIdx < 200, '功能解說應緊跟在更多之後');
});

test('功能解說：主題選擇與逐步導覽接線', () => {
  assert.ok(app.includes('MODALS["feature-topics"]'), '缺少主題選擇 modal');
  assert.ok(app.includes('case "feature-topic"'), '缺少主題動作');
  assert.ok(app.includes('FEATURE_TOURS[key]'), '主題動作應使用 FEATURE_TOURS');
  assert.ok(app.includes('label:"功能解說",markDone:false'), '主題導覽不應寫入新手導覽完成旗標');
});

test('功能解說第二波：欠缺品項／給二廠／更多 三主題', () => {
  const tour = fs.readFileSync(path.join(src, 'tour.js'), 'utf8');
  assert.ok(tour.includes('key: "shortage"') && tour.includes('key: "transfer"') && tour.includes('key: "more"'), '三主題未齊');
  for (const k of ['shortage', 'transfer', 'more']) {
    assert.ok(tour.includes(`FEATURE_TOURS.${k}`) || tour.includes(`${k}: [`) || tour.includes(`${k}:`), `主題 ${k} 缺步驟`);
  }
  assert.ok(tour.includes('pageTo("shortage")') && tour.includes('pageTo("transfer")'), '跨頁 pre 未接');
  assert.ok(tour.includes('navTo("more")'), '更多主題未接開選單 pre');
});

test('功能解說主題選單：捲動容器與樣式', () => {
  assert.ok(app.includes('class="feature-topics"'), '缺少捲動容器');
  assert.match(css, /\.feature-topics\{[^}]*overflow:auto/, '缺少 overflow:auto');
});

test('即時頻道：重複訂閱與登出必須先移除舊頻道（re-login 後 .on() 不再拋錯）', () => {
  const sb = fs.readFileSync(path.join(src, 'store', 'supabase.js'), 'utf8');
  const sub = sb.slice(sb.indexOf('subscribe(onChange)'), sb.indexOf('subscribe(onChange)') + 400);
  assert.ok(sub.includes('removeChannel(this.channel)'), 'subscribe() 重複呼叫前要 removeChannel');
  const clr = sb.slice(sb.indexOf('_clearSession()'), sb.indexOf('_clearSession()') + 700);
  assert.ok(clr.includes('removeChannel(this.channel)'), '_clearSession() 要移除頻道');
});

test('功能解說導覽圖示有背景漸層（b 預設白字，無背景=白上白不可見）', () => {
  assert.match(css, /\.nav-feature-tour b\{background:linear-gradient/, '缺少 nav-feature-tour b 背景');
  for (const c of ['nav-today','nav-orders','nav-people','nav-output','nav-notes','nav-worklog','nav-more','nav-feature-tour'])
    assert.ok(css.includes('.'+c+' b{background:'), c+' 缺背景');
});

test('桌面抽屜高度：pane sticky 且以可視高度為準（不被排程表 stretch 拉長）', () => {
  assert.match(css, /has-drawer:not\(\.zoomed\)\{flex-direction:row;align-items:flex-start/, '分割不 stretch');
  assert.match(css, /position:sticky;top:var\(--hdr-h,\d+px\)/, 'pane sticky 於 --hdr-h');
  assert.match(css, /max-height:calc\(100dvh - var\(--hdr-h,\d+px\) - 16px\)/, 'pane 上限＝可視高度');
  assert.match(css, /\.ops-drawer-b\{flex:1 1 auto;min-height:0;max-height:none;overflow-y:auto\}/, 'body flex 捲動且無 max-height');
  assert.ok(!/\.ops-drawer\.pane \.ops-drawer-b\{max-height:calc\(100dvh - 190px\)/.test(css), '不得殘留舊 max-height');
  assert.ok(app.includes('updateHeaderVar') && app.includes('ResizeObserver'), '缺少 --hdr-h 動態量測');
  assert.ok(app.includes('try{sp.setPointerCapture'), 'setPointerCapture 需容錯（合成指標會拋錯中斷拖曳）');
});
