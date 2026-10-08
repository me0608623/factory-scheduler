// 介面文字翻譯覆蓋稽核：抽樣高流量介面的寫死中文字串（未走 tx()）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "src");
const app = fs.readFileSync(path.join(web, "app.js"), "utf8");

// 1) 更多抽屜項目標籤（btn('act','標籤') 形式）
const drawerLabels = [...app.matchAll(/btn\('([a-z0-9-]+)','([^']+)'\)/g)]
  .filter((m) => /[\u4e00-\u9fff]/.test(m[2]))
  .map((m) => m[1] + "｜" + m[2]);

// 2) modal 標題（title:'中文' / title:"中文"）
const modalTitles = [...app.matchAll(/title:\s*['"]([^'"]*[\u4e00-\u9fff][^'"]*)['"]/g)]
  .map((m) => m[1]);

// 3) 常見按鈕字面（'關閉'|'取消'|'儲存'|'刪除' 直接作為標籤出現、未包 tx）
const common = ["關閉", "取消", "儲存", "刪除", "確定", "返回"];
const literalCounts = {};
for (const w of common) {
  const re = new RegExp(`['">（]${w}['"<）]`, "g");
  literalCounts[w] = (app.match(re) || []).length;
}

// 4) tx() 鍵與四語字典完整性
const dictMatch = app.match(/const SETTINGS_TEXT=\{([\s\S]*?)\n\};/);
const keys = [...dictMatch[1].matchAll(/'zh-TW':\{([^}]*)\}/g)][0][1]
  .split(",").map((s) => s.trim().split(":")[0].replace(/'/g, "")).filter(Boolean);
const langs = ["zh-TW", "en", "vi", "th"];
const dictBody = dictMatch[1];
const missing = {};
for (const l of langs) {
  const esc = l.replace("-", "[-]");
  const block = [...dictBody.matchAll(new RegExp(esc + ":\\{([^}]*)\\}", "g"))][0]?.[1] || "";
  missing[l] = keys.filter((k) => !new RegExp(`${k}\\s*:`).test(block));
}

console.log("== 更多抽屜寫死中文標籤 ==", drawerLabels.length);
drawerLabels.forEach((l) => console.log("  " + l));
console.log("\n== modal 標題（寫死中文）==", modalTitles.length);
modalTitles.forEach((t) => console.log("  " + t));
console.log("\n== 常見按鈕字面出現次數（未 tx）==");
Object.entries(literalCounts).forEach(([k, v]) => console.log("  " + k + " ×" + v));
console.log("\n== 字典鍵數 ==", keys.length, "／各語缺鍵 ==", JSON.stringify(missing));
