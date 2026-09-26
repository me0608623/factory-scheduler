import test from "node:test";
import assert from "node:assert/strict";
import { remainingQty, quantityForMinutes } from "../src/manual.js";

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
