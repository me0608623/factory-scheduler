import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { translateImportError, translateImportErrors } from "../src/import-errors.js";
import { parseImportWorkbook, IMPORT_HEADERS } from "../src/excel.js";
import { I18N } from "../src/i18n.js";

// 樣本＝excel.js 全部錯誤類別各一（zh 輸入 → en 期望輸出）
const SAMPLES = [
  ["缺少「工單」工作表", "Missing the “工單” sheet"],
  ["工單：第 2 欄應為「期限(YYYY-MM-DD)」", "Orders: column 2 should be “期限(YYYY-MM-DD)”"],
  ["員工：最多 1000 列資料", "Employees: at most 1000 data rows"],
  ["員工代號「E01」重複", "Employee ID “E01” is duplicated"],
  ["「員工」至少填一位", "“員工” needs at least one employee"],
  ["產品「P01」工序順序須從 1 連續編號", "Product “P01”: step numbers must run 1, 2, 3… consecutively"],
  ["員工「E01」的可操作機台「b」不存在", "Employee “E01”: operable machine “b” does not exist"],
  ["機台「a」的可做產品「PX」不存在", "Machine “a”: product “PX” does not exist"],
  ["工單「A01」的產品「PX」不存在", "Order “A01”: product “PX” does not exist"],
  ["產品「P01」第 2 站「包裝」沒有可操作的機台與員工", "Product “P01” step 2 (包裝): no machine and employee can run it"],
  ["員工 第 2 列：請填入值，不要使用公式或連結", "Employees row 2: enter a value, not a formula or link"],
  ["員工 第 2 列顏色：請填正整數", "Employees row 2 color: enter a positive whole number"],
  ["產品工序 第 2 列每分鐘件數：請填正數", "Product steps row 2 pieces per minute: enter a positive number"],
  ["產品工序 第 2 列幾件可傳下站：請填非負整數", "Product steps row 2 batch to next step: enter a non-negative whole number"],
  ["工單 第 2 列優先級：請填非負整數", "Orders row 2 priority: enter a non-negative whole number"],
  ["工單 第 2 列數量：請填正整數", "Orders row 2 quantity: enter a positive whole number"],
  ["工單 第 2 列期限：日期須為 YYYY-MM-DD", "Orders row 2 due date: date must be YYYY-MM-DD"],
  ["員工 第 2 列請假日期：日期不存在", "Employees row 2 leave dates: that date does not exist"],
  ["員工 第 2 列：顏色編號須為 1–8", "Employees row 2: color number must be 1–8"],
  ["員工 第 2 列：不加班請填「是」或「否」", "Employees row 2: no-overtime must be 是 (yes) or 否 (no)"],
  ["員工 第 2 列：員工代號與姓名必填", "Employees row 2: employee ID and name are required"],
  ["機台 第 2 列：機台代號與名稱必填", "Machines row 2: machine ID and name are required"],
  ["機台 第 2 列：工序須為裁切、沖壓、焊接、組裝或包裝", "Machines row 2: process must be one of 裁切, 沖壓, 焊接, 組裝, 包裝"],
  ["產品工序 第 2 列：產品代號與名稱必填", "Product steps row 2: product code and name are required"],
  ["產品工序 第 2 列：同一產品代號的名稱須一致", "Product steps row 2: the same product code must keep one name"],
  ["產品工序 第 2 列工序順序：請填正整數", "Product steps row 2 step order: enter a positive whole number"],
  ["工單 第 2 列：工單號與產品代號必填", "Orders row 2: order number and product code are required"],
  ["工單 第 2 列：優先級須為 0–3", "Orders row 2: priority must be 0–3"],
];

test("匯入錯誤翻譯：zh 恆等、en 逐式精確", () => {
  I18N.lang = "zh-TW";
  for (const [input] of SAMPLES) assert.equal(translateImportError(input), input, `zh 應恆等：${input}`);
  I18N.lang = "en";
  for (const [input, expected] of SAMPLES) assert.equal(translateImportError(input), expected, `en 譯文：${input}`);
  I18N.lang = "zh-TW";
});

test("匯入錯誤翻譯：未辨識錯誤原文回傳（安全 fallback）", () => {
  I18N.lang = "en";
  assert.equal(translateImportError("某種未知的新錯誤"), "某種未知的新錯誤");
  I18N.lang = "zh-TW";
});

// 完整性： kitchen-sink 壞檔觸發的每條解析錯誤都必須被映射（非 zh 語言譯文 ≠ 原文且無未預期中文）
function badBook() {
  const wb = new ExcelJS.Workbook();
  for (const [name, headers] of Object.entries(IMPORT_HEADERS)) wb.addWorksheet(name).addRow(headers);
  const emp = wb.getWorksheet("員工");
  emp.addRow(["E01", "張三", 9, "zz", "也許", "2026-13-01"]);          // 顏色1-8、機台zz不存在、是/否、日期不合法
  emp.addRow([null, "李四", 1, "", "否", ""]);                          // 代號姓名必填
  emp.addRow(["E01", "王五", 1, "", "否", ""]);                         // 代號重複
  const mach = wb.getWorksheet("機台");
  mach.addRow(["a", "裁切機", "電鍍", "PX"]);                          // 工序枚舉、產品PX不存在
  mach.addRow([null, "裁切機2", "裁切", ""]);                          // 代號名稱必填
  const prod = wb.getWorksheet("產品工序");
  prod.addRow(["P01", "外殼", 1, "裁切", 0, -1]);                       // 每分鐘件數正數、可傳下站非負整數
  prod.addRow(["P01", "不同名", 3, "包裝", 2, 0]);                      // 名稱一致、順序連續（1,3）
  prod.addRow([null, null, 1, "裁切", 2, 0]);                           // 代號名稱必填
  const ord = wb.getWorksheet("工單");
  ord.addRow(["A01", "PX", 0, "2026/10/01", 1]);                        // 數量正整數、產品不存在、日期格式
  ord.addRow([null, "P01", 10, "2026-10-01", 4]);                      // 必填、優先級0-3
  ord.addRow(["A01", "P01", 10, "2026-10-01", -1]);                    // 重複、優先級非負整數
  return wb;
}

test("匯入錯誤翻譯完整性：kitchen-sink 壞檔的每條錯誤在 en/vi/th 皆有譯文且無未預期中文", () => {
  const errors = parseImportWorkbook(badBook()).errors;
  assert.ok(errors.length >= 18, `觸發的錯誤數應≥18，實得 ${errors.length}：${JSON.stringify(errors)}`);
  // 允許保留的中文＝模板資料字面（表頭/工作表名/工序名/是 否）
  const literals = [
    ...Object.keys(IMPORT_HEADERS),
    ...Object.values(IMPORT_HEADERS).flat(),
    "裁切", "沖壓", "焊接", "組裝", "包裝", "是", "否",
  ];
  for (const lang of ["en", "vi", "th"]) {
    I18N.lang = lang;
    for (const error of errors) {
      const out = translateImportError(error);
      assert.notEqual(out, error, `${lang} 未映射：${error}`);
      let residual = out;
      for (const lit of literals) residual = residual.split(lit).join("");
      assert.ok(!/[\u4e00-\u9fff]/.test(residual), `${lang} 譯文殘留未翻譯中文：${error} → ${out}`);
    }
  }
  I18N.lang = "zh-TW";
  assert.deepEqual(translateImportErrors(errors), errors);
});
