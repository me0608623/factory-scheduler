// 整列標記（人工填色＋文字標註）：以「表:列ID」為鍵，屬個人裝置偏好
// （localStorage；跨帳號共享需產品決策，見 PR 說明）。與業務狀態（歸檔/已回廠/
// 待確認）分開管理，不覆蓋正式業務欄位。

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KEY = "fsched-table-marks-v1";
export const MARK_COLORS = [
  { k: "y", label: "黃" }, { k: "r", label: "紅" }, { k: "g", label: "綠" }, { k: "b", label: "藍" },
];

let cache = null;
function load() {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; }
  catch (e) { cache = {}; }
  if (typeof cache !== "object" || Array.isArray(cache)) cache = {};
  return cache;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); return true; }
  catch (e) { return false; }   // 私密模式／額滿：保留記憶體狀態，回報失敗由 UI 提示
}

export function markOf(table, id) { return load()[table + ":" + id] || null; }
export function setMark(table, id, mark) {
  const k = table + ":" + id;
  const c = load();
  if (mark) c[k] = mark; else delete c[k];
  return save();
}
export function marksAll() { return { ...load() }; }

// 列屬性：class（mk-c 色帶）＋標註圖示按鈕（注入 rowact 欄）
export function markRowAttrs(table, id, extraCls = "") {
  const m = markOf(table, id);
  const cls = (m?.c ? " mk-" + m.c : "") + (m?.n ? " mk-noted" : "") + (extraCls ? " " + extraCls : "");
  return { cls: cls.trim(), noted: !!m?.n };
}
export function markBtns(table, id, txFn) {
  const T = txFn || (k => k);
  const m = markOf(table, id);
  const title = m?.n ? T("標註") + "：" + String(m.n).slice(0, 60) : T("標記／填色");
  return '<button class="mkbtn" data-act="row-mark" data-t="' + esc(table) + '" data-id="' + esc(id) + '" aria-label="' + esc(T("標記／填色")) + '" title="' + esc(title) + '">▮' + (m?.n ? '<i class="mknote">✎</i>' : "") + "</button>";
}
