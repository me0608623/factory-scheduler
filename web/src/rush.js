// 特別趕貨紀錄的資料規則（純邏輯；UI 與本機儲存共用）
//
// 一列紀錄 = 現場 Excel 的一列：
//   f1（一廠 · 欠貨）：shipDate 出貨日期 / vendor 廠商 / desc 描述（品號） / shortQty 欠貨數量 / note 備註
//   f2（二廠 · 加工）：startDate 開工時間 / dueDate 預計完成日期 / itemProcess 品號製程 / desc 描述 / qty 數量 / note 備註
// 可以只填一邊；不推測年份、產能或工序，數字與日期由使用者自己填。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TEXT_FIELDS = [
  ["f1", "vendor", 60], ["f1", "desc", 120], ["f1", "note", 200],
  ["f2", "itemProcess", 120], ["f2", "desc", 120], ["f2", "note", 200],
];
const DATE_FIELDS = ["f1.shipDate", "f1.dueDate2", "f2.startDate", "f2.dueDate"];

function nonEmptyText(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function validQty(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return false;
  return n;
}

export function validateRush(orders) {
  if (!Array.isArray(orders)) throw new Error("趕貨紀錄格式不正確");
  if (orders.length > 2000) throw new Error("趕貨紀錄超過 2000 列，請分批整理");
  const ids = new Set();
  for (const r of orders) {
    if (!r || typeof r !== "object" || Array.isArray(r)) throw new Error("趕貨紀錄格式不正確");
    if (!r.id || typeof r.id !== "string") throw new Error("趕貨紀錄缺少 id");
    if (ids.has(r.id)) throw new Error("趕貨紀錄 id 重複");
    ids.add(r.id);
    const f1 = r.f1 || {}, f2 = r.f2 || {};
    for (const [side, key, max] of TEXT_FIELDS) {
      const v = (side === "f1" ? f1 : f2)[key];
      if (v !== null && v !== undefined && String(v).length > max)
        throw new Error(`趕貨紀錄的${side === "f1" ? "一廠" : "二廠"}欄位超過 ${max} 字`);
    }
    for (const path of DATE_FIELDS) {
      const [side, key] = path.split(".");
      const v = (side === "f1" ? f1 : f2)[key];
      if (nonEmptyText(v) && !DATE_RE.test(String(v).trim()))
        throw new Error("趕貨日期請用 YYYY-MM-DD 格式");
    }
    if (validQty(f1.shortQty) === false) throw new Error("欠貨數量需為 0 以上的整數");
    if (validQty(f2.qty) === false) throw new Error("二廠數量需為 0 以上的整數");
    const hasF1 = [f1.shipDate, f1.vendor, f1.desc, f1.shortQty, f1.note].some(nonEmptyText);
    const hasF2 = [f2.startDate, f2.dueDate, f2.itemProcess, f2.desc, f2.qty, f2.note].some(nonEmptyText);
    if (!hasF1 && !hasF2) throw new Error("每一列至少要填一廠欠貨或二廠加工的內容");
  }
}

// 整頁「欠缺品項」用的列旗標（純邏輯，供畫面與測試共用）
export function shortageRowFlags(row) {
  const f1 = row?.f1 || {}, f2 = row?.f2 || {};
  const f2Empty = ![f2.startDate, f2.dueDate, f2.itemProcess, f2.desc, f2.qty, f2.note]
    .some(v => v !== null && v !== undefined && String(v).trim() !== "");
  const late = !!(f1.shipDate && f2.dueDate && f2.dueDate > f1.shipDate);
  return { f2Empty, late };
}
