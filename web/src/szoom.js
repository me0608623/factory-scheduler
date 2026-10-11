// 排程表專用縮放控制器：與全站 UI.zoom 分離，只影響排程表幾何。
// 日視圖：--hour（時間軸/方塊高度）＋欄寬下限；週視圖：欄寬下限＋列高。
// 座標安全：dayHTML 的 px() 與拖曳的 hourPx() 都讀 zoom 後的值，
// getBoundingClientRect 亦為 zoom 後實際渲染尺寸——三者一致，拖曳換算不需改。

export const SZOOM_KEY = "fsched-schedzoom-v1";
export const SZOOM_MIN = 0.3, SZOOM_MAX = 2.5;
export const SZOOM_STEP = 1.12;                 // 每次滾輪/雙指的倍率
export const WEEK_ENTER = 0.62, WEEK_EXIT = 1.0; // 日→週／週→日 的切換門檻（含遲滯）

const state = { day: 1, week: 1, wheelZoom: true };

export function schedZoomState() { return { ...state }; }

export function loadSchedZoom() {
  try {
    const raw = JSON.parse(localStorage.getItem(SZOOM_KEY) || "null");
    if (raw && Number.isFinite(raw.day) && raw.day >= SZOOM_MIN && raw.day <= SZOOM_MAX) state.day = raw.day;
    if (raw && Number.isFinite(raw.week) && raw.week >= SZOOM_MIN && raw.week <= SZOOM_MAX) state.week = raw.week;
    if (raw && typeof raw.wheelZoom === "boolean") state.wheelZoom = raw.wheelZoom;
  } catch (e) { /* 壞資料回預設 */ }
  return schedZoomState();
}

export function saveSchedZoom() {
  try { localStorage.setItem(SZOOM_KEY, JSON.stringify(state)); } catch (e) { /* 私密模式 */ }
}

export const clampZ = z => Number.isFinite(z)?Math.min(SZOOM_MAX, Math.max(SZOOM_MIN, Math.round(z * 100) / 100)):1;

/** 調整目前視圖的縮放；回傳 {zoom, cross}——cross="week"|"day" 表示跨層級切換建議 */
export function setZoom(view, z) {
  const next = clampZ(z);
  state[view === "week" ? "week" : "day"] = next;
  saveSchedZoom();
  let cross = null;
  if (view === "day" && next <= WEEK_ENTER + 1e-9) cross = "week";
  if (view === "week" && next >= WEEK_EXIT) cross = "day";
  return { zoom: next, cross };
}

export function resetZoom(view) { return setZoom(view, 1); }
export function setWheelZoom(on) { state.wheelZoom = !!on; saveSchedZoom(); return state.wheelZoom; }

/** rAF 節流：高頻滾輪/雙指事件合併為每框一次套用 */
export function rafApply(fn) {
  let queued = false, latest, generation=0;
  const schedule=(...args) => {
    latest=args;
    if (queued) return;
    queued = true;
    const token=generation;
    requestAnimationFrame(() => { if(token!==generation)return;queued=false;fn(...latest); });
  };
  schedule.cancel=()=>{generation++;queued=false;latest=null;};
  return schedule;
}

/**
 * 以 (cx,cy) 為錨點縮放：維持錨點下的內容不動——調整捲動位置補償。
 * 用於滾輪（游標）與雙指（中心點）。scrollEl=橫向捲動容器；縱向補償視窗捲動。
 */
export function captureZoomAnchor(scrollEl,cx,cy){
  if(!scrollEl)return null;
  const cells=[...scrollEl.querySelectorAll('.col,.wcell')];
  const index=cells.findIndex(el=>{const r=el.getBoundingClientRect();return cx>=r.left&&cx<=r.right&&cy>=r.top&&cy<=r.bottom;});
  const rect=(index>=0?cells[index]:scrollEl).getBoundingClientRect();
  return {index,x:(cx-rect.left)/Math.max(1,rect.width),y:(cy-rect.top)/Math.max(1,rect.height)};
}
export function anchorScroll(scrollEl,cx,cy,anchor){
  if(!scrollEl||!anchor)return;
  const cells=[...scrollEl.querySelectorAll('.col,.wcell')];
  const rect=(cells[anchor.index]||scrollEl).getBoundingClientRect();
  scrollEl.scrollLeft+=rect.left+anchor.x*rect.width-cx;
  window.scrollTo(window.scrollX||0,window.scrollY+rect.top+anchor.y*rect.height-cy);
}
