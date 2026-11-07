# Actual SIM schedule navigation — 2026-10-26

## Reproduced problem and fix

In a real SIM block detail, expanding **Other segments of this order** and activating a segment changed the underlying day but left the original dialog covering the board. This reproduced at 390×844 and 1440×900, including a same-day segment. A second route, More → master data → All orders → an existing SIM order → Current schedule, retained both the dialog and the catalog page. Pressing Escape removed the dialog but still did not display the board.

The shared `goto` handler changed date/view without leaving the modal or page. `render()` consequently reconstructed the old modal or catalog. The fix uses the existing `closeModal()` lifecycle when necessary, clears the page and its URL view, then follows the existing day-navigation path. It does not change schedule data, factory, layout, drawer, or stored zoom preferences. No new function or state is introduced.

Investigation corrected an initial hypothesis: current order-drawer cards use `focus-order`, not `ord`. No drawer change was justified or included. The confirmed catalog path established why closing only the modal would be insufficient. This applies Fix Root Causes at the shared navigation branch and Model the Domain by reusing the existing modal/page state.

## Verification

- Five new behavior tests execute the real `goto`, `render`, modal lifecycle, modal renderer and URL function. Before the source fix, **4 failed and 1 passed**: expected an empty modal root, received the original dialog HTML. The failure was not a fixture exception.
- After the fix, **98/98** scoped tests passed. The command is the [previous 93-test command](UI_SIM_UX_2026-10-26.md#verification) with `web/tests/goto-navigation.test.mjs` added. It covers same-day/cross-day destinations, navigation without a modal, removal of stale launcher focus, return from catalog, and retention of `mode=test` and the URL hash.
- `npm.cmd run build` in `web/` passed with the existing Vite chunk-size warning. No migration-capable full test command was run.
- Independent source/test review found no actionable issue. Scoped comment review found zero added comments or suppressions. These are local reviews, not GitHub human approval.

Actual browser checks used the unchanged full version-26 SIM snapshot with 4,100 blocks. The selected test dates have 10 blocks. Both 390×844 and 1440×900 passed these routes:

| Route | Result |
|---|---|
| Related segment, keyboard Enter | Original dialog removed; selected day board visible |
| Catalog → existing SIM order → current schedule | Dialog and catalog removed; day board visible |
| Empty 2027-12-31 → existing test data | 2027-11-20 with 10 SIM blocks |
| Week date heading, keyboard Enter | 2026-10-23 with 10 SIM blocks |

All eight matrix results show zero dialogs and both manual/automatic entries present. The desktop related-segment check resized an already-open mobile dialog because the read-only fixture blocks pointer-based block editing; it is not proof that the desktop block-opening gesture was tested. The desktop catalog route was exercised entirely at desktop size. The same-day related segment proves the overlay fix; cross-day modal navigation is additionally covered by the automated tests.

## Evidence and boundaries

The original `web/.audit/real-sim-ui-qa.html` is unchanged. A separate untracked `real-sim-navigation-qa.html` adds only `goto`, `ord`, `master`, and `orders` to its navigation allowlist. These existing actions open local views and dialogs. Network, storage, save, solver/AI, account and mutation restrictions remain in place. The snapshot itself is unchanged.

Local evidence is in `C:/Users/me060/Downloads/Factory-Scheduler-SIM-UX-20261026`: `goto-before.json`, `goto-catalog-before.json`, before/after screenshots, `goto-after-matrix.json`, `goto-red.log`, `goto-regression.log`, and `goto-build.log`. Raw snapshot data and local harnesses are excluded from commits.

Production 1023 was not accessed. No migration, database function change, merge or deployment was performed. The date 2026-10-23 in this record refers only to the isolated SIM snapshot. Authenticated cloud sync, saves, physical-phone keyboards and native Safari remain unverified. Keep PR #50 unmerged and auto-merge off.

At the start of this pass, prior head `955dc58` had all ten push/pull-request checks passing and no GitHub reviews or comments. That result is historical and does not certify the new navigation commit. The next continuation should verify its exact head and continue an untested SIM flow, such as week resource-cell navigation or other safe keyboard routes.
