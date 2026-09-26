import test from "node:test";
import assert from "node:assert/strict";
import { planTimeLimit, planEngineLabel } from "../src/plan-budget.js";

test("小型排程維持每方案 3 秒", () => {
  assert.equal(planTimeLimit({ products: [{ id: "p", steps: [{}, {}, {}] }], orders: [{ pid: "p" }] }), 3);
});

test("達到 2,200 道工序時給每方案 10 秒，避免故障與請假案例全數逾時", () => {
  const products = [{ id: "p", steps: [{}, {}, {}, {}] }];
  const orders = Array.from({ length: 550 }, () => ({ pid: "p" }));
  assert.equal(planTimeLimit({ products, orders: orders.slice(0, 549) }), 3);
  assert.equal(planTimeLimit({ products, orders }), 10);
  assert.equal(planTimeLimit({ products, orders: [...orders, { pid: "missing" }] }), 10);
});

test("未啟動的方案不誤稱已由 OR-Tools 計算", () => {
  assert.equal(planEngineLabel("skipped", "OR-Tools"), "尚未計算（整體等待上限）");
  assert.equal(planEngineLabel("restricted_pairs", "OR-Tools"), "OR-Tools 快速初稿（可行但不保證最佳）");
  assert.equal(planEngineLabel("full", "OR-Tools"), "OR-Tools");
  assert.equal(planEngineLabel(undefined, "瀏覽器"), "瀏覽器備援");
});
