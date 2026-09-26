import { test } from "node:test";
import assert from "node:assert/strict";
import { factoryOf, inFactory, orderFactories, orderInFactory, compatible } from "../src/factory.js";

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
