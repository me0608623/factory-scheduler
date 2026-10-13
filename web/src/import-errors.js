// 匯入錯誤翻譯（顯示層）：excel.js 的錯誤字串是模板格式（中文寫死），在此以樣式比對轉為 tx() 鍵。
// 未能辨識的錯誤原文回傳，永遠安全。新錯誤類別需同步補 PATTERNS（見 import-errors.test.mjs 完整性測試）。
// 欄位／表名等短標籤自帶字典（不進 UI_TEXT，避免覆蓋既有同名鍵的他處譯文）。
import { tx, I18N } from "./i18n.js";

const pick = dict => name => (I18N.lang === "zh-TW" || !dict[name]?.[I18N.lang] ? name : dict[name][I18N.lang]);
const TABLES = pick({
  員工: { en: "Employees", vi: "Nhân viên", th: "พนักงาน" },
  機台: { en: "Machines", vi: "Máy", th: "เครื่องจักร" },
  產品工序: { en: "Product steps", vi: "Công đoạn sản phẩm", th: "ขั้นตอนสินค้า" },
  工單: { en: "Orders", vi: "Đơn hàng", th: "ใบสั่งงาน" },
});
const FIELDS = pick({
  顏色: { en: "color", vi: "màu", th: "สี" },
  請假日期: { en: "leave dates", vi: "ngày nghỉ", th: "วันลา" },
  期限: { en: "due date", vi: "hạn", th: "กำหนดส่ง" },
  數量: { en: "quantity", vi: "số lượng", th: "จำนวน" },
  優先級: { en: "priority", vi: "độ ưu tiên", th: "ลำดับความสำคัญ" },
  工序順序: { en: "step order", vi: "thứ tự công đoạn", th: "ลำดับขั้นตอน" },
  每分鐘件數: { en: "pieces per minute", vi: "số cái mỗi phút", th: "ชิ้นต่อนาที" },
  幾件可傳下站: { en: "batch to next step", vi: "số cái chuyển bước sau", th: "จำนวนส่งขั้นถัดไป" },
});
const UNITS = pick({
  位: { en: "employee", vi: "nhân viên", th: "พนักงาน" },
  台: { en: "machine", vi: "máy", th: "เครื่อง" },
  項: { en: "item", vi: "mục", th: "รายการ" },
});
const LABELS = pick({
  員工代號: { en: "Employee ID", vi: "Mã nhân viên", th: "รหัสพนักงาน" },
  機台代號: { en: "Machine ID", vi: "Mã máy", th: "รหัสเครื่อง" },
  工單號: { en: "Order no.", vi: "Số đơn", th: "เลขที่ใบสั่งงาน" },
});

const glue = () => (I18N.lang === "zh-TW" ? "" : " ");
const rowPlace = (table, n) => tx("{table} 第 {n} 列", { table: TABLES(table), n });

// 每列：[RegExp, (m) => 譯文]
const PATTERNS = [
  [/^缺少「(.+)」工作表$/, m => tx("缺少「{s}」工作表", { s: m[1] })],
  [/^(.+)：第 (\d+) 欄應為「(.+)」$/, m => tx("{s}：第 {n} 欄應為「{h}」", { s: TABLES(m[1]) || m[1], n: m[2], h: m[3] })],
  [/^(.+)：最多 1000 列資料$/, m => tx("{s}：最多 1000 列資料", { s: TABLES(m[1]) || m[1] })],
  [/^(.+)「(.*)」重複$/, m => tx("{label}「{v}」重複", { label: LABELS(m[1]) || m[1], v: m[2] })],
  [/^「(員工|機台|產品工序)」至少填一(位|台|項)$/, m => tx("「{s}」至少填一{unit}", { s: m[1], unit: UNITS(m[2]) })],
  [/^產品「(.*)」工序順序須從 1 連續編號$/, m => tx("產品「{id}」工序順序須從 1 連續編號", { id: m[1] })],
  [/^員工「(.*)」的可操作機台「(.*)」不存在$/, m => tx("員工「{e}」的可操作機台「{m}」不存在", { e: m[1], m: m[2] })],
  [/^機台「(.*)」的可做產品「(.*)」不存在$/, m => tx("機台「{m}」的可做產品「{p}」不存在", { m: m[1], p: m[2] })],
  [/^工單「(.*)」的產品「(.*)」不存在$/, m => tx("工單「{o}」的產品「{p}」不存在", { o: m[1], p: m[2] })],
  [/^產品「(.*)」第 (\d+) 站「(.*)」沒有可操作的機台與員工$/, m => tx("產品「{id}」第 {n} 站「{proc}」沒有可操作的機台與員工", { id: m[1], n: m[2], proc: m[3] })],
];

// 列位錯誤：place＝「表 第 N 列」＋可選欄位後綴＋「：訊息」
const ROW_MESSAGES = [
  [/^：請填入值，不要使用公式或連結$/, (f, m) => tx("{place}：請填入值，不要使用公式或連結", { place: m.place })],
  [/^：請填正數$/, (f, m) => tx("{place}{field}：請填正數", { place: m.place, field: m.field })],
  [/^：請填正整數$/, (f, m) => tx("{place}{field}：請填正整數", { place: m.place, field: m.field })],
  [/^：請填非負數$/, (f, m) => tx("{place}{field}：請填非負數", { place: m.place, field: m.field })],
  [/^：請填非負整數$/, (f, m) => tx("{place}{field}：請填非負整數", { place: m.place, field: m.field })],
  [/^：日期須為 YYYY-MM-DD$/, (f, m) => tx("{place}{field}：日期須為 YYYY-MM-DD", { place: m.place, field: m.field })],
  [/^：日期不存在$/, (f, m) => tx("{place}{field}：日期不存在", { place: m.place, field: m.field })],
  [/^：顏色編號須為 1–8$/, (f, m) => tx("{place}：顏色編號須為 1–8", { place: m.place })],
  [/^：不加班請填「是」或「否」$/, (f, m) => tx("{place}：不加班請填「是」或「否」", { place: m.place })],
  [/^：員工代號與姓名必填$/, (f, m) => tx("{place}：員工代號與姓名必填", { place: m.place })],
  [/^：機台代號與名稱必填$/, (f, m) => tx("{place}：機台代號與名稱必填", { place: m.place })],
  [/^：工序須為裁切、沖壓、焊接、組裝或包裝$/, (f, m) => tx("{place}：工序須為裁切、沖壓、焊接、組裝或包裝", { place: m.place })],
  [/^：產品代號與名稱必填$/, (f, m) => tx("{place}：產品代號與名稱必填", { place: m.place })],
  [/^：同一產品代號的名稱須一致$/, (f, m) => tx("{place}：同一產品代號的名稱須一致", { place: m.place })],
  [/^：工單號與產品代號必填$/, (f, m) => tx("{place}：工單號與產品代號必填", { place: m.place })],
  [/^：優先級須為 0–3$/, (f, m) => tx("{place}：優先級須為 0–3", { place: m.place })],
];

export function translateImportError(text) {
  for (const [re, build] of PATTERNS) {
    const m = text.match(re);
    if (m) return build(m);
  }
  const row = text.match(/^(員工|機台|產品工序|工單) 第 (\d+) 列(.*)$/);
  if (row) {
    const fieldMatch = row[3].match(/^(顏色|請假日期|期限|數量|優先級|工序順序|每分鐘件數|幾件可傳下站)(.*)$/);
    const fieldName = fieldMatch ? fieldMatch[1] : null;
    const rest = fieldMatch ? fieldMatch[2] : row[3];
    const place = rowPlace(row[1], row[2]);
    const field = fieldName ? glue() + FIELDS(fieldName) : "";
    for (const [re, build] of ROW_MESSAGES) {
      const m = rest.match(re);
      if (m) return build(field, { place, field });
    }
  }
  return text;
}

export const translateImportErrors = errors => errors.map(translateImportError);
