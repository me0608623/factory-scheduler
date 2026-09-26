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
    if (name === "c" && ref && value !== "") {
      const col = /^([A-Z]+)/.exec(ref)?.[1];
      if (col && col.length <= 2 && (col.length === 1 || col <= "BH")) {
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
const headerText = value => String(value ?? "").replace(/\s+/g, " ").trim();
export function legacyCatalog(first, second) {
  const catalog = { "1廠": { stations: [], people: [], notes: [] }, "2廠": { stations: [], people: [], notes: [] } };
  const add = (factory, kind, col, row, label, note = "") => {
    const name = headerText(label);
    if (name) catalog[factory][kind].push({ cell: `${col}${row}`, label: name, ...(note ? { note } : {}) });
  };
  const oneHead = first.get(2) || new Map();
  for (let n = 2; n <= 27; n++) add("1廠", "stations", colName(n), 2, oneHead.get(colName(n)));
  for (let n = 28; n <= 31; n++) add("1廠", "people", colName(n), 2, oneHead.get(colName(n)), "原表以人名作欄名；是否仍在職、會操作哪些設備待確認");
  const oneTop = first.get(1) || new Map();
  for (const col of ["A", "J", "Q", "AB"]) add("1廠", "notes", col, 1, oneTop.get(col));

  const twoPeople = second.get(2) || new Map();
  const twoHead = second.get(3) || new Map();
  const twoSide = second.get(4) || new Map();
  let machine = "";
  for (let n = 2; n <= 27; n++) {
    const col = colName(n);
    machine = headerText(twoHead.get(col)) || machine;
    const side = headerText(twoSide.get(col));
    if (twoHead.get(col) || side) add("2廠", "stations", col, 3, machine + (side ? `（${side}）` : ""));
    add("2廠", "people", col, 2, twoPeople.get(col), machine ? `原表標在 ${machine} 上方；技能與目前是否在職待確認` : "是否在職待確認");
  }
  add("2廠", "stations", "AC", 2, "包裝");
  add("2廠", "people", "AC", 2, twoPeople.get("AC"), "原表為包裝組合欄，需確認實際人員");
  const twoTop = second.get(1) || new Map();
  for (const col of ["A", "B", "N", "AC"]) add("2廠", "notes", col, 1, twoTop.get(col));
  return catalog;
}
function factoryDays(rows, factory, days) {
  const headers = rows.get(factory === "1廠" ? 2 : 3) || new Map();
  const upper = rows.get(2) || new Map();
  const sides = rows.get(4) || new Map();
  const columns = [];
  let heading = "", operator = "", group = "";
  for (let n = 2; n <= (factory === "1廠" ? 60 : 42); n++) {
    const col = colName(n);
    const raw = String(headers.get(col) || "").trim();
    let label;
    if (factory === "1廠") {
      if (n <= 27) { heading = raw || heading; label = heading || `原表 ${col} 欄`; }
      else if (n <= 31) label = raw || `包裝 ${col} 欄`;
      else if (n <= 35) label = raw || "支援二場";
      else if (n === 36) label = raw || "休假";
      else label = raw || `其他 ${col} 欄`;
    } else if (n <= 28) {
      heading = raw || heading;
      operator = String(upper.get(col) || "").trim() || operator;
      label = (heading || `原表 ${col} 欄`) + (sides.get(col) ? `（${sides.get(col)}）` : "");
    } else {
      group = String(upper.get(col) || "").trim() || group;
      label = group || `其他 ${col} 欄`;
    }
    columns.push({ col, machine: label, operator: factory === "2廠" && n <= 28 ? operator : "" });
  }
  let date = "";
  for (const [rowNo, cells] of [...rows].sort((a, b) => a[0] - b[0])) {
    if (rowNo < (factory === "1廠" ? 3 : 5)) continue;
    const nextDate = dateOf(cells.get("A"));
    if (nextDate) {
      date = nextDate;
      if (!days[date]) days[date] = { "1廠": [], "2廠": [], overtime: {}, notes: { "1廠": [], "2廠": [] } };
    }
    if (!date) continue;
    if (String(cells.get("A") || "").includes("加班")) days[date].overtime[factory] = true;
    if (!nextDate && String(cells.get("A") || "").trim())
      days[date].notes[factory].push({ cell: `A${rowNo}`, value: String(cells.get("A")) });
    for (const { col, machine, operator } of columns) {
      const value = String(cells.get(col) || "").trim();
      if (value) days[date][factory].push({ cell: `${col}${rowNo}`, machine, value, ...(operator ? { operator } : {}) });
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
  const sourceRows = {};
  for (const factory of ["1廠", "2廠"]) {
    const target = targets.get(sheets.get(factory));
    if (!target || target.includes("..")) throw new Error(`找不到「${factory}」工作表`);
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    sourceRows[factory] = sheetCells(await safeXml(zip, path), strings);
    factoryDays(sourceRows[factory], factory, days);
  }
  const dates = Object.keys(days).sort();
  const match = /(?:^|\D)(\d{1,2})(\d{2})(?:\D|$)/.exec(filename);
  const hinted = match && dates.find(d => +d.slice(5, 7) === +match[1] && +d.slice(8, 10) === +match[2]);
  return { dates, days, catalog: legacyCatalog(sourceRows["1廠"], sourceRows["2廠"]), selectedDate: hinted || dates.at(-1) || "" };
}
