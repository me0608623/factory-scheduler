import ExcelJS from "exceljs";

const COLORS = ["FFE14D", "4CDB6E", "F58CF0", "4FE3EE", "FFA64D", "AFC0FF", "FF9A9A", "BFEA6C"];
const PROCS = new Set(["裁切", "沖壓", "焊接", "組裝", "包裝"]);
export const IMPORT_HEADERS = {
  員工: ["員工代號", "姓名", "顏色編號(1-8)", "可操作機台", "不加班(是/否)", "請假日期(逗號分隔)"],
  機台: ["機台代號", "機台名稱", "工序", "可做產品"],
  產品工序: ["產品代號", "產品名稱", "工序順序", "工序", "每分鐘件數", "幾件可傳下站"],
  工單: ["工單號", "產品代號", "數量", "期限(YYYY-MM-DD)", "優先級(0-3)"],
};

const pad = n => String(n).padStart(2, "0");
const hm = n => pad(Math.floor(n / 60)) + ":" + pad(n % 60);
const dateLabel = d => {
  const [y, m, day] = d.split("-").map(Number);
  const weekday = "日一二三四五六"[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
  return `${m}/${day}（${weekday}）`;
};
const colorOf = employee => "FF" + COLORS[((employee?.color || 0) % COLORS.length + COLORS.length) % COLORS.length];
const fill = argb => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

export function buildScheduleWorkbook(state, date) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "產線排程";
  const grid = workbook.addWorksheet("時間×機台", { views: [{ state: "frozen", xSplit: 1, ySplit: 5 }] });
  grid.properties.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 1, orientation: "landscape" };
  grid.columns = [{ width: 13 }, ...state.machines.map(() => ({ width: 28 }))];
  const last = state.machines.length + 1;
  grid.mergeCells(2, 1, 2, last);
  grid.getCell(2, 1).value = `產線排程　${dateLabel(date)}`;
  grid.getCell(2, 1).font = { name: "Arial", size: 15, bold: true, color: { argb: "FF172331" } };
  grid.getCell(3, 1).value = "時間以 30 分鐘顯示；精確到分鐘的時段請看「排程明細」。";
  grid.getCell(3, 1).font = { name: "Arial", size: 10, italic: true, color: { argb: "FF64748B" } };
  grid.getRow(5).values = ["時間", ...state.machines.map(m => `${m.id} ${m.label}`)];
  grid.getRow(5).height = 26;
  grid.getRow(5).eachCell(cell => {
    cell.fill = fill("FF20354B");
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  for (let t = 480, rowNo = 6; t < 1200; t += 30, rowNo++) {
    const row = grid.getRow(rowNo);
    row.height = 38;
    row.getCell(1).value = hm(t);
    row.getCell(1).font = { name: "Arial", size: 10, bold: true, color: { argb: "FF334155" } };
    row.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(1).fill = fill(t % 60 === 0 ? "FFF1F5F9" : "FFF8FAFC");
    state.machines.forEach((machine, index) => {
      const cell = row.getCell(index + 2);
      const work = state.blocks.filter(b => b.date === date && b.m === machine.id && b.s < t + 30 && b.e > t)
        .sort((a, b) => a.s - b.s);
      if (t >= 720 && t < 780 && !work.length) {
        cell.value = "午休";
        cell.fill = fill("FFE2E8F0");
        cell.font = { name: "Arial", size: 10, color: { argb: "FF64748B" } };
      } else if (work.length) {
        cell.value = work.map(b => {
          const employee = state.employees.find(e => e.id === b.emp);
          const order = state.orders.find(o => o.id === b.oid);
          const product = order && state.products.find(p => p.id === order.pid);
          const step = product?.steps[b.step];
          return `${employee?.name || "未指定"}　${order?.code || "?"} ${step?.proc || "?"}\n${hm(b.s)}–${hm(b.e)}　${b.qty}件`;
        }).join("\n");
        const employees = new Set(work.map(b => b.emp));
        cell.fill = fill(employees.size === 1 ? colorOf(state.employees.find(e => e.id === work[0].emp)) : "FFFFF1C2");
        cell.font = { name: "Arial", size: 9, color: { argb: "FF152238" } };
        if (work.length > 1) row.height = Math.max(row.height, 60);
      } else if (t >= 1020 && !state.dayOT?.[date]) {
        cell.value = "未開加班";
        cell.fill = fill("FFF1F5F9");
        cell.font = { name: "Arial", size: 9, color: { argb: "FF94A3B8" } };
      }
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
      cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } }, right: { style: "hair", color: { argb: "FFE2E8F0" } } };
    });
  }
  const detail = workbook.addWorksheet("排程明細", { views: [{ state: "frozen", ySplit: 1 }] });
  detail.columns = [12, 13, 12, 12, 12, 14, 13, 14, 12, 12, 10].map(width => ({ width }));
  detail.addRow(["日期", "機台", "開始", "結束", "員工", "工單", "產品", "工序", "數量", "固定", "狀態"]);
  detail.getRow(1).eachCell(cell => {
    cell.fill = fill("FF20354B");
    cell.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  detail.getRow(1).height = 25;
  state.blocks.filter(b => b.date === date).sort((a, b) => a.s - b.s || a.m.localeCompare(b.m)).forEach(b => {
    const employee = state.employees.find(e => e.id === b.emp);
    const machine = state.machines.find(m => m.id === b.m);
    const order = state.orders.find(o => o.id === b.oid);
    const product = order && state.products.find(p => p.id === order.pid);
    const row = detail.addRow([date, `${machine?.id || b.m} ${machine?.label || ""}`, hm(b.s), hm(b.e), employee?.name || "", order?.code || "", product?.name || "", product?.steps[b.step]?.proc || "", b.qty, b.pin ? "是" : "否", ""]);
    row.getCell(5).fill = fill(colorOf(employee));
    row.eachCell(cell => { cell.font = { name: "Arial", size: 10, color: { argb: "FF172331" } }; cell.alignment = { vertical: "middle" }; });
  });
  return workbook;
}

export async function scheduleXlsx(state, date) {
  return buildScheduleWorkbook(state, date).xlsx.writeBuffer();
}

function cellValue(cell, errors, place) {
  const value = cell.value;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    errors.push(`${place}：請填入值，不要使用公式或連結`);
    return "";
  }
  return value ?? "";
}
function text(value) { return String(value ?? "").trim(); }
function list(value) { return text(value).split(/[,，、;；]/).map(x => x.trim()).filter(Boolean); }
function positive(value, place, errors, integer = false, allowZero = false) {
  const n = typeof value === "number" ? value : Number(text(value));
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n)) || (allowZero ? n < 0 : n <= 0)) {
    errors.push(`${place}：請填${allowZero ? "非負" : "正"}${integer ? "整" : ""}數`);
    return 0;
  }
  return n;
}
function dateValue(value, place, errors) {
  let s = text(value);
  if (value instanceof Date) s = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) { errors.push(`${place}：日期須為 YYYY-MM-DD`); return ""; }
  const normalized = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  const d = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== normalized) {
    errors.push(`${place}：日期不存在`); return "";
  }
  return normalized;
}
function rowsOf(workbook, name, errors) {
  const sheet = workbook.getWorksheet(name);
  if (!sheet) { errors.push(`缺少「${name}」工作表`); return []; }
  const headers = IMPORT_HEADERS[name];
  headers.forEach((header, index) => {
    if (text(sheet.getRow(1).getCell(index + 1).value) !== header) errors.push(`${name}：第 ${index + 1} 欄應為「${header}」`);
  });
  const rows = [];
  for (let n = 2; n <= sheet.rowCount; n++) {
    const row = sheet.getRow(n);
    const values = headers.map((_, index) => cellValue(row.getCell(index + 1), errors, `${name} 第 ${n} 列`));
    if (values.every(v => text(v) === "")) continue;
    rows.push({ n, values });
    if (rows.length > 1000) { errors.push(`${name}：最多 1000 列資料`); break; }
  }
  return rows;
}
function unique(items, key, label, errors) {
  const seen = new Set();
  for (const item of items) {
    const value = item[key];
    if (!value) continue;
    if (seen.has(value)) errors.push(`${label}「${value}」重複`);
    seen.add(value);
  }
}

export function parseImportWorkbook(workbook) {
  const errors = [];
  const employeeRows = rowsOf(workbook, "員工", errors);
  const machineRows = rowsOf(workbook, "機台", errors);
  const stepRows = rowsOf(workbook, "產品工序", errors);
  const orderRows = rowsOf(workbook, "工單", errors);
  const employees = employeeRows.map(({ n, values: v }) => {
    const place = `員工 第 ${n} 列`;
    const color = positive(v[2], `${place}顏色`, errors, true);
    if (color > 8) errors.push(`${place}：顏色編號須為 1–8`);
    const ot = text(v[4]) || "否";
    if (!["是", "否"].includes(ot)) errors.push(`${place}：不加班請填「是」或「否」`);
    const leaves = list(v[5]).map(x => dateValue(x, `${place}請假日期`, errors));
    if (!text(v[0]) || !text(v[1])) errors.push(`${place}：員工代號與姓名必填`);
    return { id: text(v[0]), name: text(v[1]), color: color - 1, skills: list(v[3]), leaves, noOT: ot === "是" };
  });
  const machines = machineRows.map(({ n, values: v }) => {
    const place = `機台 第 ${n} 列`;
    if (!text(v[0]) || !text(v[1])) errors.push(`${place}：機台代號與名稱必填`);
    if (!PROCS.has(text(v[2]))) errors.push(`${place}：工序須為裁切、沖壓、焊接、組裝或包裝`);
    return { id: text(v[0]), label: text(v[1]), proc: text(v[2]), products: list(v[3]), faults: [] };
  });
  const productsByCode = new Map();
  for (const { n, values: v } of stepRows) {
    const place = `產品工序 第 ${n} 列`, id = text(v[0]), name = text(v[1]);
    if (!id || !name) errors.push(`${place}：產品代號與名稱必填`);
    const stepNo = positive(v[2], `${place}工序順序`, errors, true);
    if (!PROCS.has(text(v[3]))) errors.push(`${place}：工序須為裁切、沖壓、焊接、組裝或包裝`);
    const rate = positive(v[4], `${place}每分鐘件數`, errors);
    const batch = positive(v[5] === "" ? 0 : v[5], `${place}幾件可傳下站`, errors, true, true);
    if (!productsByCode.has(id)) productsByCode.set(id, { id, name, numbered: [] });
    const product = productsByCode.get(id);
    if (product.name !== name) errors.push(`${place}：同一產品代號的名稱須一致`);
    product.numbered.push({ n: stepNo, proc: text(v[3]), rate, batch });
  }
  const products = [...productsByCode.values()].map(p => {
    p.numbered.sort((a, b) => a.n - b.n);
    p.numbered.forEach((s, i) => { if (s.n !== i + 1) errors.push(`產品「${p.id}」工序順序須從 1 連續編號`); });
    return { id: p.id, name: p.name, steps: p.numbered.map(({ proc, rate, batch }) => ({ proc, rate, batch })) };
  });
  const orders = orderRows.map(({ n, values: v }) => {
    const place = `工單 第 ${n} 列`;
    if (!text(v[0]) || !text(v[1])) errors.push(`${place}：工單號與產品代號必填`);
    const qty = positive(v[2], `${place}數量`, errors, true);
    const due = dateValue(v[3], `${place}期限`, errors);
    const pri = positive(v[4], `${place}優先級`, errors, true, true);
    if (pri > 3) errors.push(`${place}：優先級須為 0–3`);
    return { id: crypto.randomUUID(), code: text(v[0]), pid: text(v[1]), qty, due, pri };
  });
  unique(employees, "id", "員工代號", errors);
  unique(machines, "id", "機台代號", errors);
  unique(orders, "code", "工單號", errors);
  if (!employees.length) errors.push("「員工」至少填一位");
  if (!machines.length) errors.push("「機台」至少填一台");
  if (!products.length) errors.push("「產品工序」至少填一項");
  const machineIds = new Set(machines.map(x => x.id));
  const productIds = new Set(products.map(x => x.id));
  employees.forEach(e => e.skills.forEach(id => { if (!machineIds.has(id)) errors.push(`員工「${e.id}」的可操作機台「${id}」不存在`); }));
  machines.forEach(m => m.products.forEach(id => { if (!productIds.has(id)) errors.push(`機台「${m.id}」的可做產品「${id}」不存在`); }));
  orders.forEach(o => { if (!productIds.has(o.pid)) errors.push(`工單「${o.code}」的產品「${o.pid}」不存在`); });
  products.forEach(p => p.steps.forEach((step, i) => {
    const capable = machines.some(m => m.proc === step.proc && m.products.includes(p.id) && employees.some(e => e.skills.includes(m.id)));
    if (!capable) errors.push(`產品「${p.id}」第 ${i + 1} 站「${step.proc}」沒有可操作的機台與員工`);
  }));
  return { data: { employees, machines, products, orders }, errors: [...new Set(errors)] };
}

export async function readImportXlsx(arrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  return parseImportWorkbook(workbook);
}
