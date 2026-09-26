import JSZip from "jszip";
import { SaxesParser } from "saxes";

const localName = name => name.split(":").at(-1);
function scan(xml, onOpen, onText = () => {}, onClose = () => {}) {
  const parser = new SaxesParser();
  parser.on("opentag", tag => onOpen(localName(tag.name), tag.attributes));
  parser.on("text", onText);
  parser.on("closetag", tag => onClose(localName(typeof tag === "string" ? tag : tag.name)));
  parser.write(xml).close();
}
function safeXml(zip, path) {
  const file = zip.file(path);
  if (!file) throw new Error(`Excel 缺少 ${path}`);
  if (file._data?.uncompressedSize > 20 * 1024 * 1024) throw new Error("Excel 工作表過大，無法安全預覽");
  return file.async("string");
}
function sharedStrings(xml) {
  const values = [];
  let inItem = false, inText = false, value = "";
  scan(xml, name => {
    if (name === "si") { inItem = true; value = ""; }
    if (name === "t" && inItem) inText = true;
  }, text => { if (inText) value += text; }, name => {
    if (name === "t") inText = false;
    if (name === "si") { values.push(value); inItem = false; }
  });
  return values;
}
function sheetCells(xml, strings) {
  const rows = new Map();
  let rowNo = 0, ref = "", type = "", capture = false, value = "";
  scan(xml, (name, attr) => {
    if (name === "row") rowNo = Number(attr.r);
    if (name === "c") { ref = attr.r || ""; type = attr.t || ""; value = ""; }
    if (name === "v" || (name === "t" && type === "inlineStr")) capture = !!ref;
  }, text => { if (capture) value += text; }, name => {
    if (name === "v" || name === "t") capture = false;
    if (name === "c" && ref && value) {
      const col = /^([A-Z]+)/.exec(ref)?.[1];
      if (col && col.length <= 2 && (col.length === 1 || col <= "AI")) {
        if (!rows.has(rowNo)) rows.set(rowNo, new Map());
        rows.get(rowNo).set(col, type === "s" ? strings[Number(value)] ?? "" : value);
      }
      ref = "";
    }
  });
  return rows;
}
function dateOf(value) {
  if (/^\d{4}-\d{2}-\d{2}/.test(value || "")) return value.slice(0, 10);
  const serial = Number(value);
  if (!Number.isInteger(serial) || serial < 40000 || serial > 80000) return "";
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
}
function colName(n) {
  let s = "";
  for (; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}
function factoryDays(rows, factory, days) {
  const headers = rows.get(factory === "1廠" ? 2 : 3) || new Map();
  const upper = rows.get(2) || new Map();
  const sides = rows.get(4) || new Map();
  const columns = [];
  let heading = "";
  for (let n = 2; n <= (factory === "1廠" ? 27 : 35); n++) {
    const col = colName(n);
    heading = headers.get(col) || (factory === "2廠" && n >= 29 ? upper.get(col) : "") || heading;
    if (heading) columns.push({ col, machine: heading + (factory === "2廠" && sides.get(col) ? `（${sides.get(col)}）` : "") });
  }
  let date = "";
  for (const [rowNo, cells] of [...rows].sort((a, b) => a[0] - b[0])) {
    if (rowNo < (factory === "1廠" ? 3 : 5)) continue;
    const nextDate = dateOf(cells.get("A"));
    if (nextDate) {
      date = nextDate;
      if (!days[date]) days[date] = { "1廠": [], "2廠": [], overtime: {} };
    }
    if (!date) continue;
    if (String(cells.get("A") || "").includes("加班")) days[date].overtime[factory] = true;
    for (const { col, machine } of columns) {
      const value = String(cells.get(col) || "").trim();
      if (value) days[date][factory].push({ cell: `${col}${rowNo}`, machine, value });
    }
  }
}

export async function readLegacyXlsx(arrayBuffer, filename = "") {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const sheets = new Map(), targets = new Map();
  scan(await safeXml(zip, "xl/workbook.xml"), (name, attr) => {
    if (name === "sheet") sheets.set(attr.name, attr["r:id"]);
  });
  if (!sheets.has("1廠") || !sheets.has("2廠")) return null;
  scan(await safeXml(zip, "xl/_rels/workbook.xml.rels"), (name, attr) => {
    if (name === "Relationship") targets.set(attr.Id, attr.Target);
  });
  const strings = zip.file("xl/sharedStrings.xml") ? sharedStrings(await safeXml(zip, "xl/sharedStrings.xml")) : [];
  const days = {};
  for (const factory of ["1廠", "2廠"]) {
    const target = targets.get(sheets.get(factory));
    if (!target || target.includes("..")) throw new Error(`找不到「${factory}」工作表`);
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    factoryDays(sheetCells(await safeXml(zip, path), strings), factory, days);
  }
  const dates = Object.keys(days).sort();
  const match = /(?:^|\D)(\d{1,2})(\d{2})(?:\D|$)/.exec(filename);
  const hinted = match && dates.find(d => +d.slice(5, 7) === +match[1] && +d.slice(8, 10) === +match[2]);
  return { dates, days, selectedDate: hinted || dates.at(-1) || "" };
}
