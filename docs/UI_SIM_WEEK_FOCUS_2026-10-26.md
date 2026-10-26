# SIM week-grid keyboard visibility verification

## Reproduction and fix

At 390×844 and 1024×900, tab across a week row to Sunday, then Shift+Tab toward Monday. Native focus scrolling leaves some cells behind the sticky machine labels. Date headings can similarly disappear behind the corner. The actual SIM populated row reproduced the same issue; center hit tests reached the sticky label instead of the focused target.

Native focus scrolling considers partially visible targets sufficient and does not account for sticky occlusion. CSS scroll-margin and scroll-padding candidates still failed browser checks and were removed. A delegated focusin handler now measures the sticky corner and owning scroller after native scrolling, then changes only horizontal scroll position. It ignores stale targets, clamps scroll bounds and exposes the leading edge when a cell is wider than the usable area. It adds no persistent state, exported API or render lifecycle hook. Fit mode without horizontal overflow does not move.

Independent architecture review preferred this small handler to adding week behavior to the day-board locator lifecycle. Independent code review found no actionable issue and separately passed all eight new tests. Comment review found no added comments or suppressions.

## Verification

- The new behavior tests reproduced five failures before the handler: `tests 8, pass 3, fail 5`. Afterward: `tests 8, pass 8, fail 0`. They cover both edges, visible targets, measured widths and borders, oversized cells, fit mode, stale focus and scroll bounds.
- Actual SIM at 390×844: forward and backward Tab across the week row and backward Tab across date headings all leave the focused target's center unobscured. A populated row also passes. At 1024×900, backward Tab passes at 100% zoom and on populated cells at 80% zoom.
- Mobile fit-week mode retains all 77 cells, the 54px label track and zero horizontal scrolling; backward focus remains visible. Clicking a populated Sunday cell still opens the correct day with ten work blocks. Enter activation also works, and the subsequent mobile work-detail open/Escape path returns focus to the visible shortcut.
- Original P1 checks pass at 390×844 and 1440×900: actual work and both scheduling entries are visible on the initial screen. Expanding the assistant leaves approximately 72px and 98px above the board, respectively. Ten day blocks remain and there is no horizontal document overflow. The local fixture was reset with no unsent draft remaining.
- All 149 scoped tests pass. Run the 141-test command described in [assistant focus verification](UI_SIM_ASSISTANT_FOCUS_2026-10-26.md#verification), adding `web/tests/week-focus-visibility.test.mjs`. `npm.cmd run build` passes with the existing chunk-size warning. These commands do not apply migrations.

## Evidence and limits

Local evidence under `C:/Users/me060/Downloads/Factory-Scheduler-SIM-UX-20261026` includes `week-focus-before.json`, `week-focus-before-mobile.json`, before/after screenshots, `week-focus-after.json`, `week-focus-p1.json`, `week-focus-parent-red-actual.log`, `week-focus-regression.log` and `week-focus-build.log`. Failed CSS trials remain in `week-focus-margin-failed.json` and `week-focus-padding-trial.json`; they are not part of the shipped change. The separate `week-focus-parent-red.log` records a mistyped test filename and is not test-failure evidence.

Acceptance uses the existing actual SIM read-only snapshot and the real application in the in-app browser. Center visibility and cell content were checked; complete outline clearance at the first column, physical-phone keyboards and Safari remain unverified. Unit geometry fixtures supplement, rather than replace, actual SIM acceptance.

No production 1023 access, database write, migration, merge or deployment occurred. All 16 original audit-file hashes are unchanged. Previous head `99e5bc7` passed ten CI checks, with no submitted GitHub review and auto-merge off. Check the new head separately; absence of review comments is not approval.
