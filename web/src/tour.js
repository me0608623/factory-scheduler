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

export function startTour(steps, { tx = (k) => k, onFinish } = {}) {
  document.querySelectorAll(".tour-spot,.tour-card").forEach((e) => e.remove());
  const visible = (sel) => { const el = document.querySelector(sel); return el && el.offsetParent !== null ? el : null; };
  const list = steps.filter((s) => visible(s.sel)); // 隱藏中的步驟自動跳過（如手機上的聊天列）
  let i = 0;
  const spot = document.createElement("div");
  spot.className = "tour-spot";
  const card = document.createElement("div");
  card.className = "tour-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", tx("新手導覽"));
  document.body.append(spot, card);
  let onResize;

  const stop = (finished) => {
    removeEventListener("resize", onResize);
    removeEventListener("scroll", onResize, true);
    spot.remove(); card.remove();
    try { localStorage.setItem(TOUR_DONE_KEY, "1"); } catch (e) {}
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
    const el = visible(st.sel);
    if (!el) { i++; return _render(); }
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
    if (b.dataset.tour === "next") { i++; i >= list.length ? stop(true) : render(); }
    else if (b.dataset.tour === "prev") { i = Math.max(0, i - 1); render(); }
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
