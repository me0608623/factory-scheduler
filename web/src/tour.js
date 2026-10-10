// 新手導覽引擎：spotlight 聚光＋箭頭指向目標＋卡片（上一步／下一步／跳過）。
// 純函式 placement 供測試；引擎本身零依賴，i18n 由呼叫端傳 tx。
// localStorage('fsched-tour-done') 記錄已完成；?motion 參數不影響（無動畫，reduced-motion 安全）。

// —— 純函式：給目標矩形與卡片尺寸、視窗，決定卡片擺放與箭頭方向 ——
export function computePlacement(target, card, viewport, pad = 12) {
  const spaceBelow = viewport.h - target.bottom, spaceAbove = target.top;
  const putBelow = spaceBelow >= card.h + pad + 24 || spaceBelow >= spaceAbove;
  const top = putBelow
    ? Math.min(Math.max(target.bottom + pad, pad), viewport.h - card.h - pad)
    : Math.max(pad, target.top - card.h - pad);
  const left = Math.min(Math.max(pad, target.left + target.width / 2 - card.w / 2), viewport.w - card.w - pad);
  return { top, left, arrow: putBelow ? "up" : "down",
    arrowLeft: Math.min(Math.max(target.left + target.width / 2 - left - 10, 8), card.w - 28) };
}

export const TOUR_DONE_KEY = "fsched-tour-done";

export function tourDone() { try { return !!localStorage.getItem(TOUR_DONE_KEY); } catch (e) { return true; } }

export function startTour(steps, { tx = (k) => k, onFinish, markDone = true, label } = {}) {
  document.querySelectorAll(".tour-spot,.tour-card").forEach((e) => e.remove());
  const visible = (sel) => { const el = document.querySelector(sel); return el && el.offsetParent !== null ? el : null; };
  // 有 pre（前置動作）的步驟保留——目標由 pre 開抽屜／切頁後才出現；其餘隱藏中自動跳過
  const list = steps.filter((s) => s.pre || visible(s.sel));
  let i = 0;
  const spot = document.createElement("div");
  spot.className = "tour-spot";
  const card = document.createElement("div");
  card.className = "tour-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", tx(label || "新手導覽"));
  document.body.append(spot, card);
  let onResize;

  const stop = (finished) => {
    removeEventListener("resize", onResize);
    removeEventListener("scroll", onResize, true);
    spot.remove(); card.remove();
    if (markDone) { try { localStorage.setItem(TOUR_DONE_KEY, "1"); } catch (e) {} }
    onFinish?.(finished);
  };

  let rendering = false;
  const render = () => {
    if (rendering) return;
    rendering = true;
    try { _render(); } finally { rendering = false; }
  };
  const _render = () => {
    const st = list[i];
    if (!st) return stop(true);
    let el = visible(st.sel);
    if (!el && st.pre && !st._preTried) {
      // 前置動作（開抽屜／切頁面）→ 等 UI 重繪後再定位；失敗視同跳過
      st._preTried = true;
      try { st.pre(); } catch (e) { /* ignore */ }
      setTimeout(render, 320);
      return;
    }
    if (!el) { st._preTried = false; i++; return _render(); }
    st._preTried = false;
    try { el.scrollIntoView({ block: "center" }); } catch (e) { /* older engines */ }
    setTimeout(() => { try {
      const r = el.getBoundingClientRect(), v = { w: innerWidth, h: innerHeight };
      Object.assign(spot.style, { left: r.left - 6 + "px", top: r.top - 6 + "px", width: r.width + 12 + "px", height: r.height + 12 + "px" });
      // 卡片先量尺寸再定位
      card.innerHTML =
        '<div class="tour-step">' + (i + 1) + " / " + list.length + "</div>" +
        "<b>" + tx(st.title) + "</b><p>" + tx(st.text) + "</p>" +
        '<div class="tour-btns">' +
        '<button class="btn" data-tour="skip">' + tx("跳過導覽") + "</button>" +
        (i > 0 ? '<button class="btn" data-tour="prev">' + tx("上一步") + "</button>" : "") +
        '<button class="btn primary" data-tour="next">' + (i === list.length - 1 ? tx("完成") : tx("下一步")) + "</button></div>";
      const p = computePlacement(r, { w: Math.min(340, v.w - 24), h: card.offsetHeight || 180 }, v);
      Object.assign(card.style, { top: p.top + "px", left: p.left + "px", maxWidth: Math.min(340, v.w - 24) + "px" });
      card.querySelector(".tour-arrow")?.remove();
      const arrow = document.createElement("div");
      arrow.className = "tour-arrow tour-" + p.arrow;
      arrow.style.left = p.arrowLeft + "px";
      card.appendChild(arrow);
    } catch (e) { console.error('tour render:', e); } }, 50);
  };
  onResize = () => render();
  addEventListener("resize", onResize, { passive: true });
  addEventListener("scroll", onResize, { passive: true, capture: true });
  card.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tour]");
    if (!b) return;
    if (b.dataset.tour === "next") { list.forEach((s) => { s._preTried = false; }); i++; i >= list.length ? stop(true) : render(); }
    else if (b.dataset.tour === "prev") { list.forEach((s) => { s._preTried = false; }); i = Math.max(0, i - 1); render(); }
    else stop(false);
  });
  render();
  return { stop };
}

// 導覽步驟（title/text 為 i18n 鍵，以中文原文進 UI_TEXT）
export const TOUR_STEPS = [
  { sel: ".workspace-heading", title: "步驟：今天排程", text: "這裡是機器 × 時間的排程看板：每台機器一列，色塊是工作，顏色代表員工。" },
  { sel: ".datenav", title: "步驟：切換日期", text: "用 ‹ › 前後切換日期；點中間可以跳到任何一天。" },
  { sel: ".factory-switch", title: "步驟：切換廠別", text: "一廠／二廠分開看，跨廠可以看到全部。" },
  { sel: ".pagelink.shortage", title: "步驟：欠缺品項", text: "記錄一廠欠什麼貨、二廠要趕什麼。" },
  { sel: ".pagelink.transfer", title: "步驟：給二廠／回一廠", text: "跨廠加工單：交料、點收、回廠進度都在這裡。" },
  { sel: ".pagelink.floor", title: "步驟：廠區平面圖", text: "一眼看每台機器今天有沒有排程、有沒有故障。" },
  { sel: '[data-act="drawer"][data-v="more"]', title: "步驟：更多功能", text: "現場回報、輪班、權限、說明、登出都在這個選單。" },
  { sel: ".chat-launch", title: "步驟：排程助理", text: "不會用？直接問它：「誰請假？」「哪台機器故障？」（手機的表格頁會自動收起）" },
];

// —— 功能解說：主題式逐步導覽（左側獨立入口）——
// pre：點左側導覽開抽屜／切頁，目標出現後引擎自動定位；步驟隱藏時自動跳過。
const navTo = (v) => () => { document.querySelector('[data-act="drawer"][data-v="' + v + '"]')?.click(); };
export const FEATURE_TOUR_TOPICS = [
  { key: "board",  icon: "today",   title: "排程表觀看" },
  { key: "people", icon: "people",  title: "員工設定" },
  { key: "orders", icon: "orders",  title: "工單設定" },
  { key: "output", icon: "output",  title: "產量" },
  { key: "worklog",icon: "worklog", title: "工作紀錄" },
  { key: "notes",  icon: "notes",   title: "備忘" },
  { key: "chat",   icon: "chat",    title: "排程助理" },
];
export const FEATURE_TOURS = {
  board: [
    { sel: ".workspace-heading", title: "排程看板", text: "每台機器一列、時間由左到右；彩色方塊代表員工的工作。" },
    { sel: ".datenav", title: "切換日期", text: "‹ › 前後換天，點中間可直接選日期；「今天」一键回今天。" },
    { sel: ".factory-switch", title: "切換廠別", text: "一廠、二廠分開看，或選跨廠看全部。" },
  ],
  people: [
    { sel: '[data-act="drawer"][data-v="people"]', title: "員工設定入口", text: "點左側「人」開啟員工面板。" },
    { sel: ".people-pills", title: "人員與狀態", text: "綠＝在班、紅＝請假、黃＝未確定；點人名看當月班表。", pre: navTo("people") },
    { sel: ".people-calendar", title: "月曆式排班", text: "選「上班／休假／未確定」筆刷後點日期即可套用。", pre: navTo("people") },
  ],
  orders: [
    { sel: '[data-act="drawer"][data-v="orders"]', title: "工單入口", text: "點左側「工單」查看全部工單狀態。" },
    { sel: ".drawer-metrics", title: "工單總覽", text: "未完成、會晚、今日要交三個數字一眼掌握。", pre: navTo("orders") },
    { sel: ".order-card", title: "單張工單", text: "綠黃紅灰燈號表示準時與風險；點卡片可聚焦到排程。", pre: navTo("orders") },
    { sel: '[data-act="ord-new"]', title: "新增工單", text: "填工單號、數量、產品與期限，系統會建議排法。", pre: navTo("orders") },
  ],
  output: [
    { sel: '[data-act="drawer"][data-v="output"]', title: "產量入口", text: "點左側「產量」看每台機器的計畫與實際。" },
    { sel: ".output-row", title: "機器產量", text: "計畫件數與現場回報的實際件數對照；點列可聚焦機器。", pre: navTo("output") },
  ],
  worklog: [
    { sel: '[data-act="drawer"][data-v="worklog"]', title: "工作紀錄入口", text: "點左側「工作紀錄」開啟完整紀錄頁。" },
    { sel: ".sheettable", title: "紀錄表格", text: "日期、加工編號、合格與不良、工時都可線上編輯。", pre: navTo("worklog") },
    { sel: ".pageback", title: "返回看板", text: "看完按「回今天」回到排程看板。", pre: navTo("worklog") },
  ],
  notes: [
    { sel: '[data-act="drawer"][data-v="notes"]', title: "備忘入口", text: "點左側「備忘」張貼便條。" },
    { sel: ".memo-grid", title: "便條牆", text: "點便條編輯；右上圓釘可釘選重要事項。", pre: navTo("notes") },
  ],
  chat: [
    { sel: ".chat-launch", title: "排程助理", text: "點右下角藥丸展開助理，可直接用問的。" },
    { sel: ".chat-panel header", title: "聊天視窗", text: "可拖曳標題列移動位置；語音鈕可自動唸出回答。", pre: () => { document.querySelector(".chat-launch")?.click(); } },
    { sel: ".chat-quick", title: "快捷提問", text: "「誰請假？」「哪台機器故障？」一鍵送出。", pre: () => { document.querySelector(".chat-launch")?.click(); } },
  ],
};

// —— 功能解說第二波：欠缺品項／給二廠回一廠／更多 ——
const pageTo = (v) => () => { document.querySelector('[data-act="page"][data-v="' + v + '"]')?.click(); };
FEATURE_TOUR_TOPICS.push(
  { key: "shortage", icon: "shortage", title: "欠缺品項" },
  { key: "transfer", icon: "transfer", title: "給二廠／回一廠" },
  { key: "more",     icon: "more",     title: "更多" },
);
Object.assign(FEATURE_TOURS, {
  shortage: [
    { sel: ".pagelink.shortage", title: "欠缺品項入口", text: "點上方「欠缺品項」開啟專頁。" },
    { sel: ".page-title h1", title: "欠貨與補貨對照", text: "左邊一廠欠貨，右邊二廠何時補；同一列是同一張單。", pre: pageTo("shortage") },
    { sel: ".statstrip", title: "統計列", text: "未補、已補與逾期數量一眼掌握。", pre: pageTo("shortage") },
    { sel: ".addrow-head", title: "新增資料", text: "「＋加一列」新增一筆欠缺品項。", pre: pageTo("shortage") },
    { sel: ".sheettable", title: "查看與修改", text: "點儲存格直接修改；狀態欄顯示待補／已補／逾期。", pre: pageTo("shortage") },
    { sel: ".tf-toggle", title: "篩選與歸檔", text: "勾選切換「顯示已歸檔」；完成的事項可歸檔保存。", pre: pageTo("shortage") },
  ],
  transfer: [
    { sel: ".pagelink.transfer", title: "給二廠／回一廠入口", text: "點上方「給二廠／回一廠」開啟跨廠加工專頁。" },
    { sel: ".page-title h1", title: "跨廠加工單", text: "料送二廠加工、何時回一廠；與欠缺品項分開管理。", pre: pageTo("transfer") },
    { sel: ".sheettable", title: "單據與進度", text: "每一列一張跨廠單：交料日、點收、預計回廠與進度都在列上編輯。", pre: pageTo("transfer") },
    { sel: ".addrow-head", title: "建立單據", text: "「＋加一列」建立新的跨廠加工單。", pre: pageTo("transfer") },
    { sel: ".tf-toggle", title: "歸檔與紀錄", text: "切換已歸檔查看歷史單據；完成的單可還原或刪除。", pre: pageTo("transfer") },
  ],
  more: [
    { sel: '[data-act="drawer"][data-v="more"]', title: "更多選單", text: "左側「更多」收納管理與現場功能。" },
    { sel: ".ops-drawer-h h2", title: "選單已展開", text: "以下逐項介紹（依你的權限顯示）。", pre: navTo("more") },
    { sel: '[data-act="manual-add"]', title: "＋手動排班", text: "選工單、機台、人與時段，手動加一塊工作。", pre: navTo("more") },
    { sel: '[data-act="auto"]', title: "自動排班", text: "系統一次算好多種排法供預覽比較。", pre: navTo("more") },
    { sel: '[data-act="incident"]', title: "故障／請假", text: "登記機台故障或人員請假，系統自動重排。", pre: navTo("more") },
    { sel: '[data-act="rosters"]', title: "輪班表", text: "每日人力與班別安排。", pre: navTo("more") },
    { sel: '[data-act="master"]', title: "員工、設備與工單", text: "基本資料管理：搜尋、新增、編輯、刪除。", pre: navTo("more") },
    { sel: '[data-act="settings"]', title: "設定", text: "語言、主題、畫面比例等個人設定。", pre: navTo("more") },
    { sel: '[data-act="tv"]', title: "大螢幕", text: "工廠電視模式：字大、隱藏管理按鈕。", pre: navTo("more") },
    { sel: '[data-act="help"]', title: "操作說明", text: "完整說明文件與新手導覽。", pre: navTo("more") },
    { sel: '[data-act="account"]', title: "帳號與登出", text: "雲端模式的帳號管理（本機模式不顯示）。", pre: navTo("more") },
  ],
});
