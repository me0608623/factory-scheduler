// 浮動視窗共用邏輯：拖曳、邊界縮放、最大化／還原、z-order、位置保存。
// 桌面（>800px）啟用；手機維持 CSS 版型（bottom sheet / 底部錨定）。
// 事件分工：pointerdown 於把手→移動超過門檻才視為拖曳（避免吃掉按鈕 click）；
// 縮放把手與把手以外區域不攔截，輸入、選字、捲動不受影響。

export const WIN = { z: 60, count: 0 };
const MOBILE = () => window.matchMedia("(max-width:800px)").matches;
const MARGIN = 6; // 視窗至少留在可視範圍內的邊距

export function clampRect(x, y, w, h, vw, vh) {
  w = Math.min(Math.max(w, 260), vw - MARGIN * 2);
  h = Math.min(Math.max(h, 160), vh);
  x = Math.min(Math.max(x, MARGIN - w + 60), vw - 60); // 至少露出 60px 寬供抓回
  y = Math.min(Math.max(y, 0), vh - 40);               // 至少露出 40px 高
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

function load(key, defaults) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    if (raw && Number.isFinite(raw.x) && Number.isFinite(raw.w) && raw.w > 0) return raw;
  } catch (e) { /* 忽略壞資料 */ }
  return { ...defaults };
}
function save(key, g) { try { localStorage.setItem(key, JSON.stringify(g)); } catch (e) { /* 私密模式 */ } }

function applyGeom(el, g) {
  el.style.left = g.x + "px";
  el.style.top = g.y + "px";
  el.style.width = g.w + "px";
  el.style.height = g.h + "px";
  el.style.right = "auto";
  el.style.bottom = "auto";
}

function suppressClick(el) {
  const kill = e => { e.stopPropagation(); e.preventDefault(); };
  el.addEventListener("click", kill, { capture: true, once: true });
  setTimeout(() => el.removeEventListener("click", kill, true), 250);
}

function startDrag(ev, onMove, onEnd) {
  const sx = ev.clientX, sy = ev.clientY;
  let started = false;
  const move = e => {
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!started && Math.hypot(dx, dy) < 5) return;
    started = true;
    onMove(e, dx, dy);
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    onEnd(!!started);
  };
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}

export function bringToFront(el) {
  el.style.zIndex = String(WIN.z + (WIN.count++ % 18)); // 60–78：低於 modal overlay(80)
}

const HANDLE_DIRS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
function ensureHandles(el) {
  if (el.querySelector(".win-rh")) return;
  for (const dir of HANDLE_DIRS) {
    const h = document.createElement("div");
    h.className = "win-rh rh-" + dir;
    h.dataset.dir = dir;
    h.setAttribute("aria-hidden", "true");
    el.appendChild(h);
  }
}

/**
 * 把元素變成浮動視窗（每次 render 後重新呼叫；模組以 key 記住幾何狀態）。
 * opts: { key, defaults:{x,y,w,h}, handle, maxBtn?, moveOnly? }
 * moveOnly：只管理位置（排程助理等浮動元件），不掛縮放把手、不設寬高。
 * 回傳 { repaint, state }。
 */
export function floatWindow(el, opts) {
  const st = floatWindow._s ??= new Map();
  let s = st.get(opts.key);
  if (!s) { s = { geom: load(opts.key, opts.defaults), max: false, saved: null, moveOnly: !!opts.moveOnly }; st.set(opts.key, s); }
  st.set(opts.key + ":el", el);

  const applyMove = (el2, g) => {
    el2.style.left = g.x + "px";
    el2.style.top = g.y + "px";
    el2.style.right = "auto";
    el2.style.bottom = "auto";
  };
  const clampMove = g => {
    const w = el.offsetWidth || 160, h = el.offsetHeight || 56;
    const x = Math.min(Math.max(g.x, MARGIN), innerWidth - w - MARGIN);
    const y = Math.min(Math.max(g.y, MARGIN), innerHeight - h - MARGIN);
    return { x: Math.round(x), y: Math.round(y), w, h };
  };

  const paint = () => {
    if (MOBILE()) {
      el.classList.remove("float-win", "win-max");
      el.style.cssText = el.style.cssText.replace(/(^|;)\s*(left|top|width|height|right|bottom):[^;]*/g, "$1");
      el.querySelectorAll(".win-rh").forEach(n => n.remove());
      return;
    }
    el.classList.add("float-win");
    el.classList.toggle("win-max", s.max);
    // 先解除左右同時錨定（left+right 會把 width:auto 拉伸成全寬），再量測自然寬
    el.style.right = "auto";
    el.style.bottom = "auto";
    if (opts.moveOnly) { el.classList.remove("win-max"); applyMove(el, clampMove(s.geom)); return; }
    ensureHandles(el);
    if (s.max) { el.style.left = "0"; el.style.top = "0"; el.style.width = "100vw"; el.style.height = "100dvh"; el.style.right = "auto"; el.style.bottom = "auto"; }
    else applyGeom(el, clampRect(s.geom.x, s.geom.y, s.geom.w, s.geom.h, innerWidth, innerHeight));
  };
  paint();

  const handle = opts.handle instanceof Element ? opts.handle : el.querySelector(opts.handle);
  if (handle && !handle.dataset.winBound) {
    handle.dataset.winBound = "1";
    handle.addEventListener("pointerdown", ev => {
      const onCtl = ev.target.closest("button,input,select,textarea");
      if ((onCtl && !opts.dragOnButton) || MOBILE()) return;
      bringToFront(el);
      const g0 = s.geom;
      startDrag(ev, (e, dx, dy) => {
        if (s.max) return; // 最大化時不拖曳（先還原再拖）
        const c = opts.moveOnly ? clampMove({ ...g0, x: g0.x + dx, y: g0.y + dy })
                                : clampRect(g0.x + dx, g0.y + dy, g0.w, g0.h, innerWidth, innerHeight);
        (opts.moveOnly ? applyMove : applyGeom)(el, c); s.geom = c;
      }, moved => { if (moved) { suppressClick(handle); save(opts.key, s.geom); } });
    });
    handle.addEventListener("dblclick", () => { // 一鍵回預設位置
      if (MOBILE()) return;
      s.max = false; s.geom = { ...opts.defaults };
      save(opts.key, s.geom); paint();
    });
  }
  el.addEventListener("pointerdown", () => { if (!MOBILE()) bringToFront(el); }, { capture: true });
  if (!opts.moveOnly) el.querySelectorAll(".win-rh").forEach(h => {
    if (h.dataset.winBound) return;
    h.dataset.winBound = "1";
    h.addEventListener("pointerdown", ev => {
      ev.preventDefault();
      if (s.max || MOBILE()) return;
      bringToFront(el);
      const dir = h.dataset.dir, g0 = { ...s.geom };
      startDrag(ev, (e, dx, dy) => {
        let { x, y, w, h: hh } = g0;
        if (dir.includes("e")) w = g0.w + dx;
        if (dir.includes("s")) hh = g0.h + dy;
        if (dir.includes("w")) { w = g0.w - dx; x = g0.x + dx; }
        if (dir.includes("n")) { hh = g0.h - dy; y = g0.y + dy; }
        const c = clampRect(x, y, w, hh, innerWidth, innerHeight);
        applyGeom(el, c); s.geom = c;
      }, moved => { if (moved) save(opts.key, s.geom); });
    });
  });
  if (opts.maxBtn && !opts.maxBtn.dataset.winBound) {
    opts.maxBtn.dataset.winBound = "1";
    opts.maxBtn.addEventListener("click", () => {
      s.max = !s.max;
      save(opts.key, { ...s.geom, max: s.max });
      paint();
      opts.maxBtn.textContent = s.max ? "❐" : "□";
      opts.maxBtn.setAttribute("aria-label", s.max ? "還原視窗" : "最大化視窗");
    });
  }
  return { repaint: paint, state: s };
}

/** 視窗尺寸變更時：夾回可視範圍（所有已掛載視窗）；進出手機版時切換浮動／錨定樣式。 */
export function reflowAllWindows() {
  const st = floatWindow._s;
  if (!st) return;
  for (const [k, s] of st) {
    if (k.endsWith(":el")) continue;
    const el = st.get(k + ":el");
    if (!el || !el.isConnected) continue;
    if (MOBILE()) {
      el.classList.remove("float-win", "win-max");
      el.style.cssText = el.style.cssText.replace(/(^|;)\s*(left|top|width|height|right|bottom):[^;]*/g, "$1");
      continue;
    }
    el.classList.add("float-win");
    if (s.max) { if (!s.moveOnly) { el.style.width = "100vw"; el.style.height = "100dvh"; } continue; }
    el.style.right = "auto";
    el.style.bottom = "auto";
    s.geom = s.moveOnly
      ? { ...s.geom, x: Math.min(Math.max(s.geom.x, MARGIN), innerWidth - (el.offsetWidth || 160) - MARGIN), y: Math.min(Math.max(s.geom.y, MARGIN), innerHeight - (el.offsetHeight || 56) - MARGIN) }
      : clampRect(s.geom.x, s.geom.y, s.geom.w, s.geom.h, innerWidth, innerHeight);
    if (s.moveOnly) { el.style.left = s.geom.x + "px"; el.style.top = s.geom.y + "px"; }
    else applyGeom(el, s.geom);
    save(k, s.geom);
  }
}
