// i18n 覆蓋稽核 v2（字典已搬至 i18n.js）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "src");
const app = fs.readFileSync(path.join(web, "app.js"), "utf8");
const i18n = fs.readFileSync(path.join(web, "i18n.js"), "utf8");

// 1) rendered data-act 的按鈕文字（非 tx 包裹）
const hardcodedButtons = [];
app.split("\n").forEach((line, i) => {
  for (const m of line.matchAll(/btn\('[a-z0-9-]+','([^']*[\u4e00-\u9fff][^']*)'\)/g)) {
    if (!line.includes("tx(")) hardcodedButtons.push(m[1] + " ← app.js:" + (i + 1));
  }
});

// 2) modal 標題（title:'中文' 未包 tx）
const hardcodedTitles = [];
app.split("\n").forEach((line, i) => {
  for (const m of line.matchAll(/title:\s*['"]([^'"]*[\u4e00-\u9fff][^'"]*)['"]/g)) {
    if (!line.includes("tx(")) hardcodedTitles.push(m[1].trim() + " ← :" + (i + 1));
  }
});

// 3) 幫助章節標籤
const helpTabs = app.match(/HELP\s*=\s*\[([\s\S]*?)\]\s*;/)?.[1]
  ?.match(/'([^']*[\u4e00-\u9fff][^']*)'/g)?.map(s => s.replace(/'/g, "")) || [];

// 4) i18n.js 字典鍵數
const uiTextKeys = [...i18n.matchAll(/"([^"]+)":\s*\{/g)].map(m => m[1]);

console.log("=== i18n.js UI_TEXT 鍵數 ===", uiTextKeys.length);
console.log("\n=== 寫死中文按鈕標籤 ===", hardcodedButtons.length);
hardcodedButtons.slice(0, 10).forEach(s => console.log("  " + s));
console.log("\n=== 寫死中文 modal 標題 ===", hardcodedTitles.length);
hardcodedTitles.slice(0, 15).forEach(s => console.log("  " + s));
console.log("\n=== HELP 章節標籤（全中文）===", helpTabs.length, helpTabs.join("、"));
