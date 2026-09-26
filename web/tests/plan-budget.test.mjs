import test from "node:test";
import assert from "node:assert/strict";
import { planTimeLimit } from "../src/plan-budget.js";

test("小型排程維持每方案 3 秒", () => {
  assert.equal(planTimeLimit({ products: [{ id: "p", steps: [{}, {}, {}] }], orders: [{ pid: "p" }] }), 3);
});

test("達到 2,200 道工序時給每方案 5 秒", () => {
  const products = [{ id: "p", steps: [{}, {}, {}, {}] }];
  const orders = Array.from({ length: 550 }, () => ({ pid: "p" }));
  assert.equal(planTimeLimit({ products, orders: orders.slice(0, 549) }), 3);
  assert.equal(planTimeLimit({ products, orders }), 5);
  assert.equal(planTimeLimit({ products, orders: [...orders, { pid: "missing" }] }), 5);
});
