import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { readImportXlsx } from "../src/excel.js";

const templatePath = new URL("../public/匯入範本.xlsx", import.meta.url);

test("匯入範本可由匯入解析器讀取", async () => {
  const bytes = await readFile(templatePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  assert.equal(workbook.getWorksheet("員工").getCell("A1").value, "員工代號");
  workbook.getWorksheet("員工").getRow(2).values = ["E01", "張三", 1, "a", "否", ""];
  workbook.getWorksheet("機台").getRow(2).values = ["a", "裁切機", "裁切", "P01"];
  workbook.getWorksheet("產品工序").getRow(2).values = ["P01", "外殼", 1, "裁切", 2, 0];
  workbook.getWorksheet("工單").getRow(2).values = ["A01", "P01", 120, "2026-09-30", 1];
  const imported = await readImportXlsx(await workbook.xlsx.writeBuffer());
  assert.deepEqual(imported.errors, []);
  assert.equal(imported.data.orders[0].code, "A01");
});
