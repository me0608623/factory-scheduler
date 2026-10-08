// 按鈕完整性稽核（完整版）
// 涵蓋：switch case、Object.assign(MODAL_ACT) 區塊、MODAL_ACT['x']= 括號指派、
//       transfer-ui.js actions 表、document 級 data-act 委派監聽、動態組字 data-act。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "src");
const app = fs.readFileSync(path.join(web, "app.js"), "utf8");
const transferUi = fs.readFileSync(path.join(web, "transfer-ui.js"), "utf8");

// 1) rendered data-act（全部 src 檔）
const rendered = new Map();
for (const f of fs.readdirSync(web).filter((f) => f.endsWith(".js"))) {
  fs.readFileSync(path.join(web, f), "utf8").split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/data-act=\\?["']([a-z0-9_-]+)\\?["']/g)) {
      if (!rendered.has(m[1])) rendered.set(m[1], []);
      rendered.get(m[1]).push(f + ":" + (i + 1));
    }
  });
}
// 動態組字（btn() 工具、模板變數）
const dynamic = new Map();
for (const f of fs.readdirSync(web).filter((f) => f.endsWith(".js"))) {
  fs.readFileSync(path.join(web, f), "utf8").split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/(?:data-act=["']?\+|btn\(["'])([a-zA-Z0-9_-]+)["']?\s*\+|\$\{([a-zA-Z0-9_.]+)\}/g)) {
      const k = m[1] || "⟨" + m[2] + "⟩";
      dynamic.set(k, f + ":" + (i + 1));
    }
  });
}

// 2) switch cases
const cases = new Set();
for (const m of app.matchAll(/case\s+["']([a-z0-9_-]+)["']\s*:/g)) cases.add(m[1]);

// 3) MODAL_ACT：Object.assign 區塊（括號配對＋頂層鍵）＋ 引號括號指派
const modal = new Set();
let idx = 0;
while (true) {
  idx = app.indexOf("Object.assign(MODAL_ACT", idx);
  if (idx < 0) break;
  let i = app.indexOf("{", idx), depth = 0;
  for (; i < app.length; i++) { if (app[i] === "{") depth++; else if (app[i] === "}") { depth--; if (!depth) break; } }
  app.slice(app.indexOf("{", idx), i + 1).split("\n").forEach((l) => {
    const m = l.match(/^\s{2}["']?([a-zA-Z0-9_-]+)["']?\s*:\s*[(fa]/);
    if (m) modal.add(m[1]);
  });
  idx = i;
}
for (const m of app.matchAll(/MODAL_ACT\[["']([a-zA-Z0-9_-]+)["']\]\s*=/g)) modal.add(m[1]);
for (const m of app.matchAll(/MODAL_ACT\.([a-zA-Z0-9_-]+)\s*=/g)) modal.add(m[1]);

// 4) transfer-ui.js actions 表
const transfer = new Set();
{
  const s = transferUi.indexOf("const actions={");
  let i = transferUi.indexOf("{", s), depth = 0;
  for (; i < transferUi.length; i++) { if (transferUi[i] === "{") depth++; else if (transferUi[i] === "}") { depth--; if (!depth) break; } }
  transferUi.slice(transferUi.indexOf("{", s), i + 1).split(/\n|,(?=\s*['"a-zA-Z])/).forEach((seg) => {
    const m = seg.match(/["']?([a-zA-Z0-9_-]+)["']?\s*(?::|\([^)]*\)=>|=>)/);
    if (m && m[1] !== "actions") transfer.add(m[1]);
  });
}

// 5) document 級委派（mousedown/click 直接 closest data-act）
const delegated = new Set();
for (const m of app.matchAll(/closest\('\\?\[data-act=["']([a-z0-9_-]+)["']\]\)?/g)) delegated.add(m[1]);
for (const m of app.matchAll(/dataset\?\.actChange|dataset\.actChange/g)) delegated.add("⟨actChange⟩");

const handled = (a) => cases.has(a) || modal.has(a) || transfer.has(a) || delegated.has(a);
const dead = [...rendered.keys()].filter((a) => !handled(a));
const unreach = [...cases].filter((a) => !rendered.has(a) && !dynamic.has(a));

console.log("rendered:", rendered.size, "／cases:", cases.size, "／MODAL_ACT:", modal.size,
  "／transfer-ui:", transfer.size, "／委派:", [...delegated].join(","));
console.log("=== ❌ 死按鈕（有按鈕、無任何 handler）===", dead.length);
dead.forEach((a) => console.log("  " + a + " ← " + rendered.get(a).slice(0, 3).join(", ")));
console.log("=== ⚠ handler 無靜態按鈕（需動態產生或程式呼叫）===", unreach.length);
unreach.forEach((a) => console.log("  " + a));
