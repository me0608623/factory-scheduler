// 工作紀錄表的資料規則（純邏輯；UI 與本機儲存共用）
// 一列：{id, date, code, goodQty, badQty, startH, startM, endH, endM, reworkMin, worker, note}
// 數字欄允許空（null）＝未填；填了就是 0 以上的整數。時 0–23、分 0–59。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const INT_FIELDS = ["goodQty", "badQty", "reworkMin", "startH", "startM", "endH", "endM"];
const TEXT_MAX = { code: 80, worker: 60, note: 500 };

function nonEmpty(v) { return v !== null && v !== undefined && String(v).trim() !== ""; }
function asInt(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 1e9 ? n : false;
}

export function validateWorkLog(rows) {
  if (!Array.isArray(rows)) throw new Error("工作紀錄格式不正確");
  if (rows.length > 5000) throw new Error("工作紀錄超過 5000 列");
  const ids = new Set();
  for (const r of rows) {
    if (!r || typeof r !== "object" || Array.isArray(r)) throw new Error("工作紀錄格式不正確");
    if (!r.id || typeof r.id !== "string") throw new Error("工作紀錄缺少 id");
    if (ids.has(r.id)) throw new Error("工作紀錄 id 重複");
    ids.add(r.id);
    if (nonEmpty(r.date) && !DATE_RE.test(String(r.date).trim())) throw new Error("日期請用 YYYY-MM-DD");
    for (const [k, max] of Object.entries(TEXT_MAX))
      if (nonEmpty(r[k]) && String(r[k]).length > max) throw new Error(`${k === "code" ? "加工編號" : k === "worker" ? "加工者" : "備註"}超過 ${max} 字`);
    for (const k of INT_FIELDS) {
      const v = asInt(r[k]);
      if (v === false) throw new Error("數字欄請填 0 以上的整數");
      r[k] = v;
    }
    if (r.startH > 23 || r.endH > 23) throw new Error("時請填 0–23");
    if (r.startM > 59 || r.endM > 59) throw new Error("分請填 0–59");
    const any = ["date", "code", "worker", "note", ...INT_FIELDS].some(k => nonEmpty(r[k]));
    if (!any) throw new Error("每一列至少要填一個欄位");
  }
}
