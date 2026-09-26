import test from "node:test";
import assert from "node:assert/strict";
import { overtimeAllowed, overtimeStatus, overtimeWeekdays } from "../src/overtime.js";

test("舊員工加班設定維持全部可或全部不可", () => {
  assert.deepEqual(overtimeWeekdays({ noOT: false }), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(overtimeWeekdays({ noOT: true }), []);
});

test("固定星期與單日臨時調整", () => {
  const e = { otWeekdays: [1, 3, 5], otOverrides: { "2026-09-28": false, "2026-09-29": true } };
  assert.deepEqual(overtimeStatus(e, "2026-09-28"), { available: false, custom: true });
  assert.deepEqual(overtimeStatus(e, "2026-09-29"), { available: true, custom: true });
  assert.equal(overtimeAllowed(e, "2026-09-30"), true);
  assert.equal(overtimeAllowed(e, "2026-10-01"), false);
});
