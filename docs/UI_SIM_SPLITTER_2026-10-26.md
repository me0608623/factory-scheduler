# SIM drawer splitter verification

## Reproduction and fix

The desktop divider moved opposite to the requested direction. In the actual SIM view at 1440×900, ArrowRight increased the right drawer from 470 to 510 px and moved the divider 40 px left. Dragging the divider 60 px right increased the drawer to 530 px and moved the divider 60 px left.

The drawer has a fixed right edge. Increasing its width moves its left edge and the divider left. Both input handlers added rightward movement to the width. The fix subtracts the pointer delta and uses a negative width delta for ArrowRight. ArrowLeft increases the width. History traces both formulas to the original October 9 splitter implementation.

Only two arithmetic expressions in `initFloatWins()` change. Existing width limits, gesture cleanup, saved preference timing, and CSS updates remain. Model the Domain keeps the existing width state. Fix Root Causes corrects the direction calculation without a new helper or render cycle.

## Verification

- Six new event-driven tests failed before the fix and passed after. One decisive mismatch was `510 !== 430` for the drawer width after ArrowRight. Tests cover pointer directions, pointerup/cancel cleanup, arrow keys, bounds, unrelated keys, and repeated initialization.
- Actual SIM ArrowRight now changes 470 to 430 px and moves the divider 40 px right. ArrowLeft restores 470 px. Pointer movement right by 60 px changes 470 to 410 px and moves the divider right by 60 px; dragging left restores the starting width.
- Repeated keyboard input stops at the existing 280 and 900 px limits at 1440×900. Focus remains on the divider, ten blocks remain, and the document has no horizontal overflow.
- After resizing to 390×844 at the maximum desktop width, the divider is hidden and the mobile drawer fits the screen. Escape returns to the output entry and retains ten blocks.
- Original P1 checks pass at 390×844 and 1440×900. Actual blocks and both scheduling entries are visible. The expanded assistant ends above the board with gaps of about 72 and 98 px.
- All 126 scoped tests pass. Use the command in [drawer focus verification](UI_SIM_DRAWER_FOCUS_2026-10-26.md#verification), adding `web/tests/person-selection-focus.test.mjs` and `web/tests/drawer-splitter.test.mjs`. The web build passes with its existing chunk-size warning. No migration-capable full test command ran.
- Scoped comment review found no added comments or suppressions. Independent source/test review passed and reran all six new tests successfully.

Test Behavior, Not Implementation informed the event-driven tests. Their simplified DOM does not prove browser focus or geometry; Prove It Works required the actual SIM checks above.

## Evidence and limits

Local evidence is in `C:/Users/me060/Downloads/Factory-Scheduler-SIM-UX-20261026`: `splitter-before-after.json`, `splitter-desktop-after.png`, `splitter-red.log`, `splitter-regression.log`, and `splitter-build.log`. The first pointer attempt missed the divider and changed nothing. The successful reproduction used a DOM-confirmed hit point and is separately identified in the evidence.

The fixture blocks network and database writes and keeps preferences in memory. Its initial 470 px width was restored. Original audit files and the raw snapshot remain unchanged. Physical touch dragging and Safari are unverified. The separate stored-width versus viewport-clamp case was subsequently reproduced and fixed below.

No production 1023 access, migration, database change, merge, or deployment occurred. Keep PR #50 unmerged with auto-merge off. Previous head `4babebe` passed ten CI checks; the new head requires a separate status check.

## Follow-up: first keyboard step after viewport clamping

Actual SIM reproduction set the drawer to 900 px at 1440×900, closed it, narrowed the viewport to 1100×800, and reopened it. The drawer displayed at the existing 680 px limit. The first ArrowRight left it at 680 px; only the second moved it to 640 px. Rendering clamps the displayed width without replacing the saved preference. The keyboard handler therefore calculated `min(900 - 40, 680)` for its first step.

The keyboard handler now reads the displayed drawer width, matching the pointer handler. It retains the direction and bounds formulas, updates the same preference, and does not redraw the page. No new helper or state is needed. Model the Domain distinguishes a saved preference from current geometry; Fix Root Causes changes the calculation's starting value.

- Two added behavior tests first failed, with six existing tests passing. After the fix, all eight splitter tests pass. They cover first-step movement, reverse movement, persisted width and retained focus when saved and displayed widths differ.
- In the same actual SIM sequence, the first ArrowRight now changes 680 to 640 px and moves the divider 40 px right. ArrowLeft restores 680 px. Focus stays on the divider, ten blocks remain, and no document horizontal overflow appears.
- At 390×844, the divider is hidden and the drawer fits the viewport despite the larger desktop preference. Escape returns focus to the output entry. The keyboard resize sequence had scrolled the page, so first-screen P1 checks used a fresh fixture: actual blocks and both scheduling entries are visible at 390×844 and 1440×900. The expanded assistant remains above the board with gaps of about 72 and 98 px.
- All 128 scoped regression tests pass using the command described above. The web build passes with the existing chunk-size warning. Independent review passed and reran all eight splitter tests; comment review found no added comments or suppressions.
- Evidence: `splitter-clamp-before-after.json`, `splitter-clamp-desktop-after.png`, `splitter-clamp-mobile-after.png`, `clamp-red.log`, `clamp-regression.log`, and `clamp-build.log` in the same local evidence directory. No raw SIM snapshot is committed.

The fixture was restored to its initial width with the assistant and drawer closed. Head `403cf54` passed all ten CI checks before this follow-up; its empty GitHub review history is not human approval. The follow-up commit needs its own CI check. No production access, migration, database write, merge or deployment occurred.
