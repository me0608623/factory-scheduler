# SIM dialog disclosure keyboard verification

## Reproduction and fix

Work details contain native disclosure headings for secondary actions and other segments of the same order. At 360×420, Enter and Space expanded them, but Tab from a heading jumped to the top close button instead of entering the revealed content. At 1440×420, Tab from a collapsed heading also jumped to the top, while Shift+Tab jumped to the final preview button.

`modalFocusable()` omitted `summary` elements. The modal Tab handler therefore treated a focused heading as outside its list and forced focus to an endpoint. The selector predates the disclosures added in `307246f`. The one-line fix includes `summary:not([tabindex="-1"])` in the existing list. It changes no Tab handler, disclosure state or data operation.

Fix Root Causes corrects the missing native control type without adding a custom disclosure component. Test Behavior, Not Implementation checks whether the handler wrongly prevents Tab or moves focus.

## Verification

- Four new tests exercise the real helper and keydown handler. Before the fix the interior-summary test failed and three tests passed; all four pass after the fix. They cover native forward/backward continuation, summary and button boundaries, and negative tabindex exclusion.
- Actual SIM at 360×420: Tab from the expanded related-segments heading reaches the actual afternoon segment, then the footer close button. Tab from a collapsed secondary-actions heading skips its buttons and reaches the next heading. Shift+Tab returns to the previous heading. Collapsing related segments makes Tab go directly to the footer. First/last dialog wrapping remains correct.
- At 1440×420, expanded content, collapsed-content skipping and backward navigation also pass. The dialogs fit both viewports without horizontal document overflow. No secondary action or preview was activated.
- Original P1 checks pass at 390×844 and 1440×900: ten actual day blocks remain, work and both scheduling entries are initially visible, and assistant-to-board gaps are about 72 and 98 px.
- All 139 scoped regression tests pass. Use the command described in [staff group verification](UI_SIM_GROUP_FOCUS_2026-10-26.md#verification), adding `web/tests/modal-summary-focus.test.mjs`. The build passes with its existing chunk-size warning. Independent review passed and reran the 11 summary/modal-return tests; comment review found no added comments or suppressions.

## Evidence and limits

Local evidence in `C:/Users/me060/Downloads/Factory-Scheduler-SIM-UX-20261026` includes `summary-focus-before.json`, `summary-focus-after.json`, `summary-focus-p1.json`, `summary-focus-desktop-after.png`, and the `summary-focus-red`, `summary-focus-regression` and `summary-focus-build` logs.

The unit fixture models selector matching and event handling, not native Tab or disclosure visibility. In the observed browser, collapsed descendants can retain client rectangles, so rectangle presence alone was not used as evidence of keyboard visibility. The real SIM browser checks establish the native sequence. Physical phone keyboards and Safari remain unverified.

The existing read-only fixture was restored to the original day with dialogs and assistant closed. Original audit files and raw snapshot remain unchanged. No production 1023 access, database write, migration, merge or deployment occurred. Previous head `49c054a` passed ten CI checks; the new head requires its own check. GitHub had no submitted review and auto-merge remained off.
