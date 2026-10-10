// 通用表格排序：可比較值抽取 + 型別比較器 + 穩定排序 + 表頭／手機排序 UI。
// 排序只影響顯示順序；先套用既有篩選，再排序。空值／無效日期一律排最後（原始文字保留由渲染層負責）。

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function dateVal(v) {
  if (v == null || v === "") return null;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? +(m[1] + m[2] + m[3]) : null;   // YYYYMMDD 數值比較；無效 → null（兩個方向都墊底）
}
export function timeVal(h, m) {
  // 只在時、分皆有值且有效時排序；部分填寫也保持「未知」，不補成午夜。
  if ([h, m].some(v => v == null || typeof v === 'boolean' || String(v).trim() === '')) return null;
  const H = +h, M = +m;
  return Number.isInteger(H) && H >= 0 && H <= 23 && Number.isInteger(M) && M >= 0 && M <= 59 ? H * 60 + M : null;
}
export function numVal(v) { if (v == null || v === "") return null; const n = +v; return Number.isFinite(n) ? n : null; }

export function cmpBy(type, a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (type === "text") return String(a).localeCompare(String(b), "zh-Hant", { numeric: true });
  return (a < b ? -1 : a > b ? 1 : 0);
}

export function applySort(rows, spec) {
  if (!spec || !spec.key) return rows;
  const dir = spec.dir === "desc" ? -1 : 1;
  const keyed = rows.map((r, i) => ({ r, i, v: spec.get(r) }));
  keyed.sort((x, y) => {
    // 空值／無效值：不論升降冪一律墊底（不乘方向）
    if (x.v == null && y.v == null) return x.i - y.i;
    if (x.v == null) return 1;
    if (y.v == null) return -1;
    const c = cmpBy(spec.type, x.v, y.v);
    return c * dir || x.i - y.i;   // 穩定：相同排序值以原始順序固定
  });
  return keyed.map(k => k.r);
}

// 表頭（桌面）：點擊切換升降冪；圖示呈現目前方向。thCls：附加欄位類（如 h-f1）
export function sortTh(table, col, state, tx, thCls = "") {
  const T = tx || (k => k);
  const on = state && state.key === col.key;
  const dir = on ? (state.dir === "desc" ? "↓" : "↑") : "↕";
  return '<th class="' + (thCls ? thCls + " " : "") + "sortable" + (on ? " on" : "") + '"><button class="sortbtn" data-act="sort-col" data-t="' + table + '" data-k="' + col.key + '" title="' + esc(T(col.label)) + '">' + esc(T(col.label)) + "<i>" + dir + "</i></button></th>";
}

// 手機排序列：欄位＋方向＋重設（data-act-change 由 app.js 委派處理）
export function sortBar(table, cols, state, tx) {
  const T = tx || (k => k);
  const cur = state || {};
  const opt = (v, l, s) => '<option value="' + v + '"' + (s ? " selected" : "") + ">" + esc(l) + "</option>";
  return '<div class="sortbar"><span>' + esc(T("排序")) + '</span> <select class="inp" data-act-change="sort-sel" data-t="' + table + '" aria-label="' + esc(T("排序欄位")) + '">' +
    opt("", T("預設")) + cols.map(c => opt(c.key, T(c.label), cur.key === c.key)).join("") + "</select>" +
    '<select class="inp" data-act-change="sort-dir" data-t="' + table + '" aria-label="' + esc(T("排序方向")) + '">' +
    opt("asc", T("由小到大"), cur.dir !== "desc") + opt("desc", T("由大到小"), cur.dir === "desc") + "</select>" +
    '<button class="btn" data-act="sort-reset" data-t="' + table + '">' + esc(T("重設")) + "</button></div>";
}

// 各表可排序欄位（get：列資料 → 可比較值）
export const TF_SORT = [
  { key: "notified", label: "通知日期", type: "date", get: o => dateVal(o.notified) },
  { key: "code", label: "加工編號", type: "text", get: o => o.code },
  { key: "seq", label: "加工序", type: "num", get: o => numVal(o.seq) },
  { key: "totalQty", label: "全部可給數", type: "num", get: o => numVal(o.totalQty) },
  { key: "expectedSend", label: "可給二廠時間", type: "date", get: o => dateVal(o.expectedSend) },
  { key: "urgentQty", label: "急用", type: "num", get: o => numVal(o.urgentQty || 0) },
  { key: "due", label: "要求回一廠時間", type: "date", get: o => dateVal(o.due) },
];
export const RUSH_SORT = [
  { key: "f1.shipDate", label: "出貨日期", type: "date", get: r => dateVal(r.f1?.shipDate) },
  { key: "f1.vendor", label: "廠商", type: "text", get: r => r.f1?.vendor },
  { key: "f1.shortQty", label: "欠貨數量", type: "num", get: r => numVal(r.f1?.shortQty) },
  { key: "f2.startDate", label: "開工", type: "date", get: r => dateVal(r.f2?.startDate) },
  { key: "f2.dueDate", label: "預計完成", type: "date", get: r => dateVal(r.f2?.dueDate) },
  { key: "f2.qty", label: "數量", type: "num", get: r => numVal(r.f2?.qty) },
];
export const WL_SORT = [
  { key: "date", label: "日期", type: "date", get: r => dateVal(r.date) },
  { key: "code", label: "加工編號", type: "text", get: r => r.code },
  { key: "goodQty", label: "合格數", type: "num", get: r => numVal(r.goodQty) },
  { key: "badQty", label: "不良", type: "num", get: r => numVal(r.badQty) },
  { key: "start", label: "開工", type: "time", get: r => timeVal(r.startH, r.startM) },
  { key: "end", label: "完工", type: "time", get: r => timeVal(r.endH, r.endM) },
  { key: "reworkMin", label: "修模時間", type: "num", get: r => numVal(r.reworkMin) },
  { key: "worker", label: "加工者", type: "text", get: r => r.worker },
];
