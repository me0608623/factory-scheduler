import test from "node:test";
import assert from "node:assert/strict";
import { capacityIntervals } from "../src/capacity.js";

const day = "2026-09-28";
const blocks = [
  { id: "a", date: day, m: "a", emp: "e", s: 480, e: 600 },
  { id: "b", date: day, m: "b", emp: "e", s: 540, e: 660 },
  { id: "c", date: day, m: "c", emp: "e", s: 600, e: 720 },
];

test("同時顧機台上限與交接邊界", () => {
  assert.deepEqual(capacityIntervals(blocks, day, { id: "e", maxMachines: 2 }), [[540, 660]]);
  assert.deepEqual(capacityIntervals(blocks, day, { id: "e", maxMachines: 2 }, new Set(), 1), []);
  assert.deepEqual(capacityIntervals(blocks, day, { id: "e", maxMachines: 1 }), [[480, 720]]);
  assert.deepEqual(capacityIntervals(blocks, day, { id: "e", maxMachines: 2 }, new Set(["b"])), []);
  assert.deepEqual(capacityIntervals(blocks, "2026-09-29", { id: "e", maxMachines: 2 }), []);
});
