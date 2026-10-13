import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { parseImportWorkbook, IMPORT_HEADERS } from "../src/excel.js";

const templatePath = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "..", "public", "匯入範本.xlsx");
const loadTemplate = async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fs.readFileSync(templatePath));
  return workbook;
};

test("匯入範本：出貨檔與解析器表頭同步", async () => {
  const workbook = await loadTemplate();
  for (const [name, headers] of Object.entries(IMPORT_HEADERS)) {
    const sheet = workbook.getWorksheet(name);
    assert.ok(sheet, `缺少「${name}」工作表`);
    const actual = headers.map((_, i) => String(sheet.getRow(1).getCell(i + 1).value ?? "").trim());
    assert.deepEqual(actual, headers, `「${name}」表頭與解析器不同步`);
  }
  assert.ok(workbook.getWorksheet("填寫說明"), "缺少「填寫說明」工作表");
});

test("匯入範本：空白出貨檔僅含「尚未填寫」語意錯誤", async () => {
  const parsed = parseImportWorkbook(await loadTemplate());
  for (const error of parsed.errors) assert.match(error, /至少填一/, `非預期錯誤：${error}`);
});

test("匯入範本：說明頁範例照抄可通過解析（缺陷 #19 回歸）", async () => {
  const guide = (await loadTemplate()).getWorksheet("填寫說明");
  const built = new ExcelJS.Workbook();
  for (const [name, headers] of Object.entries(IMPORT_HEADERS)) built.addWorksheet(name).addRow(headers);
  let examples = 0;
  for (let r = 2; r <= guide.rowCount; r++) {
    const label = String(guide.getRow(r).getCell(1).value ?? "").trim();
    if (!built.getWorksheet(label)) continue;
    const width = IMPORT_HEADERS[label].length;
    const values = [];
    for (let c = 2; c <= 1 + width; c++) values.push(guide.getRow(r).getCell(c).value ?? "");
    built.getWorksheet(label).addRow(values);
    examples++;
  }
  assert.ok(examples >= 5, `說明頁範例列數異常：${examples}`);
  const parsed = parseImportWorkbook(built);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.data.employees.length, 1);
  assert.equal(parsed.data.machines.length, 2);
  assert.equal(parsed.data.products.length, 1);
  assert.equal(parsed.data.orders.length, 1);
});
