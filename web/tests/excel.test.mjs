import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { buildScheduleWorkbook, IMPORT_HEADERS, parseImportWorkbook, readImportXlsx } from "../src/excel.js";

function importBook() {
  const wb = new ExcelJS.Workbook();
  for (const [name, headers] of Object.entries(IMPORT_HEADERS)) wb.addWorksheet(name).addRow(headers);
  wb.getWorksheet("員工").addRow(["E01", "張三", 1, "a,e", "否", "2026-09-29"]);
  wb.getWorksheet("機台").addRow(["a", "裁切機", "裁切", "P01"]);
  wb.getWorksheet("機台").addRow(["e", "包裝線", "包裝", "P01"]);
  wb.getWorksheet("產品工序").addRow(["P01", "外殼", 1, "裁切", 2, 0]);
  wb.getWorksheet("產品工序").addRow(["P01", "外殼", 2, "包裝", 4, 0]);
  wb.getWorksheet("工單").addRow(["A01", "P01", 120, "2026-09-30", 1]);
  return wb;
}

test("Excel 匯入：跨表關聯與數值讀取", async () => {
  const wb = importBook();
  const parsed = await readImportXlsx(await wb.xlsx.writeBuffer());
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.data.employees[0].color, 0);
  assert.deepEqual(parsed.data.employees[0].skills, ["a", "e"]);
  assert.deepEqual(parsed.data.employees[0].leaves, ["2026-09-29"]);
  assert.deepEqual(parsed.data.employees[0].otWeekdays, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(parsed.data.products[0].steps[1].proc, "包裝");
  assert.equal(parsed.data.orders[0].due, "2026-09-30");
});

test("Excel 匯入：錯誤資料不能通過預覽", () => {
  const wb = importBook();
  wb.getWorksheet("員工").getCell("D2").value = "不存在的機台";
  wb.getWorksheet("工單").getCell("D2").value = "2026-02-30";
  wb.getWorksheet("工單").addRow(["A01", "P01", 10, "2026-09-30", 1]);
  const parsed = parseImportWorkbook(wb);
  assert.ok(parsed.errors.some(x => x.includes("不存在的機台")));
  assert.ok(parsed.errors.some(x => x.includes("日期不存在")));
  assert.ok(parsed.errors.some(x => x.includes("工單號「A01」重複")));
});

test("Excel 匯出：時間×機台、員工顏色及明細可保留", async () => {
  const state = {
    employees: [{ id: "E01", name: "張三", color: 0 }],
    machines: [{ id: "a", label: "裁切機", proc: "裁切" }],
    products: [{ id: "P01", name: "外殼", steps: [{ proc: "裁切" }] }],
    orders: [{ id: "O01", code: "A01", pid: "P01" }],
    blocks: [{ id: "B1", oid: "O01", step: 0, m: "a", emp: "E01", date: "2026-09-28", s: 540, e: 600, qty: 120, pin: false }],
    dayOT: {},
  };
  const wb = buildScheduleWorkbook(state, "2026-09-28");
  const bytes = await wb.xlsx.writeBuffer();
  const opened = new ExcelJS.Workbook();
  await opened.xlsx.load(bytes);
  const grid = opened.getWorksheet("時間×機台");
  assert.equal(grid.getCell("A5").value, "時間");
  assert.equal(grid.getCell("B8").fill.fgColor.argb, "FFFFE14D");
  assert.match(grid.getCell("B8").value, /張三.*A01 裁切/);
  assert.equal(opened.getWorksheet("排程明細").getCell("I2").value, 120);
});

test("舊版實際排程只讀預覽，不誤當成會清空排程的匯入範本", async () => {
  const wb = new ExcelJS.Workbook();
  const first = wb.addWorksheet("1廠");
  first.getCell("B2").value = "焊接";
  first.getCell("A3").value = new Date("2024-10-23T00:00:00Z");
  first.getCell("B3").value = "品號*800\n14H";
  first.getCell("A4").value = "加班";
  first.getCell("AJ2").value = "休假";
  first.getCell("AJ4").value = "阿明";
  first.getCell("AT3").value = 0;
  const second = wb.addWorksheet("2廠");
  second.getCell("B3").value = "自動4";
  second.getCell("N3").value = "手動機7";
  second.getCell("O4").value = "右";
  second.getCell("AC2").value = "包裝";
  second.getCell("AN2").value = "請假人員";
  second.getCell("AN5").value = "阿華";
  second.getCell("A5").value = new Date("2024-10-23T00:00:00Z");
  second.getCell("B5").value = "產品甲";
  second.getCell("O5").value = "產品乙";
  second.getCell("AC5").value = "產品丙";
  const parsed = await readImportXlsx(await wb.xlsx.writeBuffer(), "排程1023.xlsx");
  assert.equal(parsed.data, null);
  assert.equal(parsed.legacy.selectedDate, "2024-10-23");
  assert.deepEqual(parsed.legacy.dates, ["2024-10-23"]);
  assert.deepEqual(parsed.legacy.days["2024-10-23"]["1廠"].find(x => x.cell === "B3"),
    { cell: "B3", machine: "焊接", value: "品號*800\n14H" });
  assert.equal(parsed.legacy.days["2024-10-23"].overtime["1廠"], true);
  assert.equal(parsed.legacy.days["2024-10-23"].notes["1廠"][0].value, "加班");
  assert.equal(parsed.legacy.days["2024-10-23"]["1廠"].find(x => x.cell === "AJ4").machine, "休假");
  assert.equal(parsed.legacy.days["2024-10-23"]["1廠"].find(x => x.cell === "AT3").value, "0");
  assert.equal(parsed.legacy.days["2024-10-23"]["2廠"].find(x => x.cell === "O5").machine, "手動機7（右）");
  assert.equal(parsed.legacy.days["2024-10-23"]["2廠"].find(x => x.cell === "AC5").machine, "包裝");
  assert.equal(parsed.legacy.days["2024-10-23"]["2廠"].find(x => x.cell === "AN5").machine, "請假人員");
});
