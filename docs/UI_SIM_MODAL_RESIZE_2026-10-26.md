# SIM modal focus after viewport changes

## Reproduction and fix

At 390×844, opening the first-work shortcut with Enter and closing with Escape correctly returned focus to that button. Opening it again, changing the viewport to 1440×900 or 844×390, and then closing left focus on BODY. The next Tab left the page content before returning to its start.

The mobile shortcut is hidden above 680 px but remains connected to the document. `closeModal()` checked connection and disabled state, then tried to focus that hidden button. The original return-focus code predates the mobile shortcut; the later modal race guard is unrelated and must remain.

The fix uses the existing block ID to focus the corresponding visible `.blk` only when the mobile shortcut has become hidden. A visible shortcut remains the return target. Missing, hidden, disabled or disconnected fallback elements are skipped, and a newly opened modal retains its focus. No new helper, state, database operation or general modal fallback was added.

Model the Domain uses the same block ID already shared by the shortcut and schedule block. Fix Root Causes addresses the hidden opener rather than changing the dialog layout or rebuilding the page.

## Verification

- Four tests were added to the existing modal-return suite. Before the fix, the matching-block test failed and six tests passed; after the fix all seven passed. Cases cover normal shortcut return, unavailable fallback targets and the new-modal race guard.
- Actual SIM same-size mobile closing still focuses the shortcut. After changing to desktop or landscape viewport dimensions, Escape now focuses the matching block ID; Tab reaches the next work segment. All ten day blocks remain. The focused block is visible in both viewport sizes.
- The three P1 checks remain successful at 390×844 and 1440×900: actual work and both scheduling entries are visible initially, and the expanded assistant ends above the board with gaps of about 72 and 98 px.
- All 135 scoped regression tests pass using the command in [staff group verification](UI_SIM_GROUP_FOCUS_2026-10-26.md#verification). The web build passes with the existing chunk-size warning. No migration-capable full test command ran.
- Independent review passed and reran all seven modal-return tests. Comment review found no added comments or suppressions. Test Behavior, Not Implementation keeps assertions on the resulting focus; Prove It Works requires the actual SIM checks in addition to the simplified DOM tests.

## Evidence and limits

Local evidence is under `C:/Users/me060/Downloads/Factory-Scheduler-SIM-UX-20261026`: `modal-resize-before.json`, `modal-resize-after.json`, `modal-resize-p1.json`, `modal-resize-desktop-after.png`, `modal-resize-red.log`, `modal-resize-regression.log`, and `modal-resize-build.log`.

The existing fixture uses the actual read-only SIM snapshot and blocks database/network writes. Work blocks received focus but were not activated or edited. Viewport dimensions were changed in the browser; physical device rotation and Safari remain unverified. The fixture was restored to its original day with dialogs, drawers and assistant closed. Original audit files and the snapshot remain unchanged.

Previous head `e3fd8bf` passed all ten CI checks, with no submitted GitHub review and auto-merge off. The new head requires a separate check. No production 1023 access, migration, database change, merge or deployment occurred.
