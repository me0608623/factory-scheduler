import { test } from "node:test";
import assert from "node:assert/strict";
import { factoryOf, factoryPreference, inFactory, orderFactories, orderInFactory, compatible, orderRoute } from "../src/factory.js";

test("舊資料預設 1 廠；同一工單可在兩廠出現", () => {
  const products = [{ id: "p", steps: [{ proc: "裁切" }, { proc: "焊接", factory: 2 }] }];
  const order = { pid: "p" };
  assert.equal(factoryOf({}), 1);
  assert.equal(inFactory({}, 1), true);
  assert.deepEqual(orderFactories(order, products), [1, 2]);
  assert.equal(orderInFactory(order, products, 1), true);
  assert.equal(orderInFactory(order, products, 2), true);
});

test("機台、人員與工序必須同廠", () => {
  const machine = { id: "m", factory: 2, proc: "焊接", products: ["p"] };
  const product = { id: "p" };
  const step = { proc: "焊接", factory: 2 };
  assert.equal(compatible({ factory: 2, skills: ["m"] }, machine, product, step), true);
  assert.equal(compatible({ factory: 1, skills: ["m"] }, machine, product, step), false);
  assert.equal(compatible({ factory: 2, skills: ["m"] }, machine, product, { ...step, factory: 1 }), false);
});

test("重新整理後保留跨廠檢視選擇", () => {
  assert.equal(factoryPreference("all"), "all");
  assert.equal(factoryPreference("2"), 2);
  assert.equal(factoryPreference("1"), 1);
  assert.equal(factoryPreference(null), 1);
  assert.equal(factoryPreference("invalid"), 1);
});

test("orderRoute 去除連續重複廠別；orderFactories 全域去重；缺產品回空", () => {
  const products = [{ id: "p", steps: [{ factory: 1 }, { factory: 1 }, { factory: 2 }, { factory: 1 }] }];
  assert.deepEqual(orderRoute({ pid: "p" }, products), [1, 2, 1]);
  assert.deepEqual(orderFactories({ pid: "p" }, products), [1, 2]);
  assert.deepEqual(orderRoute({ pid: "x" }, products), []);
  assert.deepEqual(orderRoute({ pid: "p" }, [{ id: "p", steps: [] }]), []);
});
