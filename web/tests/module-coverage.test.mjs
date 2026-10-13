// 模組覆蓋棘輪：src/ 每個可測模組都必須被至少一個測試檔 import（靜態或動態）。
// 例外清單須附理由；新增模組而未加測試會在此變紅。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const EXEMPT = {
  app: "UI 巨檔，以原始碼棘輪測試覆蓋（i18n-behavior/preview-ui 等）",
  main: "應用程式進入點（副作用裝配，不適單元測試）",
  "chat-ui": "DOM 聊天面板（候選清單明載排除，純邏輯在 chat.js 已測）",
};

test("每個 src 模組（例外除外）至少被一個測試檔 import", () => {
  const modules = fs.readdirSync(path.join(root, "..", "src"))
    .filter(f => f.endsWith(".js"))
    .map(f => f.replace(/\.js$/, ""));
  const testsText = fs.readdirSync(root).filter(f => f.endsWith(".test.mjs"))
    .map(f => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
  const missing = modules.filter(m => !EXEMPT[m] && !testsText.includes(`src/${m}.js`));
  assert.deepEqual(missing, [],
    `這些模組沒有任何測試 import（新增模組請同步補契約測試，或在本測試 EXEMPT 附理由）：${missing.join(", ")}`);
});
