import test from "node:test";
import assert from "node:assert/strict";
import { buildLegacyConversionDraft } from "../src/legacy-conversion.js";

const example = {
  dates: ["2024-10-23", "2024-10-25"],
  days: {
    "2024-10-23": { "1廠": [{ cell: "B5", machine: "焊接", value: "A040*2400" }], "2廠": [] },
    "2024-10-25": { "1廠": [], "2廠": [{ cell: "O7", machine: "手動機7（右）", operator: "金山", value: "25H5*620\n4H" }] },
  },
  catalog: {
    "1廠": { stations: [{ cell: "B2", label: "焊接" }], people: [] },
    "2廠": { stations: [{ cell: "O3", label: "手動機7（右）" }], people: [
      { cell: "O2", label: "金山" }, { cell: "AC2", label: "包裝-梅+娟" },
    ] },
  },
};

test("舊版草稿保留日期間隔和原格文字，不猜時段、件數或技能", () => {
  const draft = buildLegacyConversionDraft(example, "2026-09-28");
  assert.deepEqual(draft.dates, [
    { sourceDate: "2024-10-23", targetDate: "2026-09-28" },
    { sourceDate: "2024-10-25", targetDate: "2026-09-30" },
  ]);
  assert.equal(draft.work[1].rawText, "25H5*620\n4H");
  assert.equal(draft.work[1].targetDate, "2026-09-30");
  assert.equal(draft.work[1].start, undefined);
  assert.equal(draft.work[1].quantity, undefined);
  assert.deepEqual(draft.scheduleBlocks, []);
  assert.equal(draft.solverReady, false);
  assert.equal(draft.people[1].kind, "team_candidate");
});

test("錯誤日期或重複日期不能轉換", () => {
  assert.throws(() => buildLegacyConversionDraft(example, "2026-02-30"), /日期不存在/);
  assert.throws(() => buildLegacyConversionDraft({ ...example, dates: ["2024-10-23", "2024-10-23"] }, "2026-09-28"), /日期不是遞增/);
});
