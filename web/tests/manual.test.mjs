import test from "node:test";
import assert from "node:assert/strict";
import { batchReadyMinute, materialFlowIssue, remainingQty, quantityForMinutes } from "../src/manual.js";

const toAbs = (date, minute) => Date.parse(date + "T00:00:00Z") / 60000 + minute;

test("手動新增只使用工序尚未排入的件數", () => {
  const blocks = [{ id: "a", oid: "o", step: 0, qty: 40 }, { id: "b", oid: "o", step: 1, qty: 20 }];
  assert.equal(remainingQty(100, blocks, "o", 0), 60);
  assert.equal(quantityForMinutes(30, 2, 60), 60);
  assert.equal(quantityForMinutes(60, 2, 60), 60, "不能超過剩餘件數");
});

test("拉伸既有方塊可把原件數納回可分配量", () => {
  const blocks = [{ id: "a", oid: "o", step: 0, qty: 40 }, { id: "b", oid: "o", step: 0, qty: 60 }];
  assert.equal(remainingQty(100, blocks, "o", 0, "a"), 40);
  assert.equal(quantityForMinutes(20, 2, 40), 40);
  assert.equal(quantityForMinutes(10, 2, 40), 20);
});

test("前站只完成交接批量，也可先安排後站一部分", () => {
  const blocks = [
    { id: "first", oid: "o", step: 0, date: "2026-09-28", s: 480, e: 540, qty: 60 },
    { id: "second", oid: "o", step: 1, date: "2026-09-28", s: 540, e: 570, qty: 30 },
  ];
  assert.equal(batchReadyMinute(120, 60, blocks, "o", 1, toAbs), toAbs("2026-09-28", 540));
  assert.equal(batchReadyMinute(120, 0, blocks, "o", 1, toAbs), Infinity);
  assert.equal(materialFlowIssue(blocks, "o", 1, toAbs), false);
});

test("前站下一批尚未做出時，後站不能提前耗用", () => {
  const blocks = [
    { oid: "o", step: 0, date: "2026-09-28", s: 480, e: 540, qty: 60 },
    { oid: "o", step: 0, date: "2026-09-28", s: 960, e: 1020, qty: 60 },
    { oid: "o", step: 1, date: "2026-09-28", s: 660, e: 720, qty: 24 },
    { oid: "o", step: 1, date: "2026-09-28", s: 780, e: 1020, qty: 96 },
  ];
  assert.equal(materialFlowIssue(blocks, "o", 1, toAbs), true);
});

test("跨日交接批量按前站實際完成時間計算", () => {
  const blocks = [
    { id: "a", oid: "o", step: 0, date: "2026-09-28", s: 960, e: 1020, qty: 30 },
    { id: "b", oid: "o", step: 0, date: "2026-09-29", s: 480, e: 540, qty: 30 },
  ];
  assert.equal(batchReadyMinute(100, 40, blocks, "o", 1, toAbs), toAbs("2026-09-29", 500));
  assert.equal(batchReadyMinute(100, 40, blocks, "o", 1, toAbs, new Set(["b"])), Infinity);
});

test("前站兩台機器並行時，按合計產量判斷交接時間", () => {
  const blocks = [
    { id: "a", oid: "o", step: 0, date: "2026-09-28", s: 480, e: 540, qty: 50 },
    { id: "b", oid: "o", step: 0, date: "2026-09-28", s: 480, e: 540, qty: 50 },
  ];
  assert.equal(batchReadyMinute(100, 60, blocks, "o", 1, toAbs), toAbs("2026-09-28", 520));
});

test("前站與後站同時做時依累積產量判斷，不只看開工時間", () => {
  const blocks = [
    { oid: "o", step: 0, date: "2026-09-28", s: 480, e: 600, qty: 120 },
    { oid: "o", step: 1, date: "2026-09-28", s: 540, e: 660, qty: 120 },
  ];
  assert.equal(materialFlowIssue(blocks, "o", 1, toAbs), false);
  blocks[1].e = 600;
  assert.equal(materialFlowIssue(blocks, "o", 1, toAbs), false, "後站在前站完成時恰好做完是可行的");
  blocks[1].e = 590;
  assert.equal(materialFlowIssue(blocks, "o", 1, toAbs), true);
});
