# Factory selection keeps keyboard focus

PR [#50](https://github.com/me0608623/factory-scheduler/pull/50), branch `codex/test-schedule-display-20261023`. Baseline `0d0f1b7c978d8fa75140509bcfb0f125354a0a20`. Acceptance on 2026-11-07 Asia/Taipei used the existing local actual-SIM navigation fixture. Cloud, database writes, solver execution and AI submission stayed blocked.

## Reproduction and repair

P2: Enter or Space on a factory button changed the visible schedule but left focus on BODY. The next Tab restarted at the return-to-production link. This reproduced at 1440×900 and 390×844, with the assistant expanded or collapsed, and on repeated selection. Selection and the unsent assistant draft survived. No production link was activated.

The factory action called `render()`, which replaced the focused button through `#app.innerHTML`. The action now retains the original factory group's position across that synchronous redraw and focuses its replacement button. Restoration runs only when that button owned focus and the render left focus on BODY, with no modal or cell editor active. It uses `preventScroll` and leaves selection, rendering and data behavior unchanged.

The header and floor page have separate factory groups. The same-value target must belong to the original group. Current factory selection changes neither page nor group order, so the group position is local to this action. No helper, persistent identity, delay or renderer policy was added. Independent design proposals compared this approach with explicit group attributes and retaining the connected control DOM.

## Actual SIM acceptance

The existing snapshot has work in both factories on October 17. The fixture reached that date through its existing empty-state recovery action. The observed day contains eight factory-1 blocks, one factory-2 block, and nine blocks with all factories selected.

| Operation | Observed result |
| --- | --- |
| Phone 390×844, Enter on factory 1 | The replacement factory-1 button stays focused, selected, visible and hit-testable. Eight blocks remain. Tab reaches factory 2. |
| Phone, Space on factory 2 and repeated Space | Factory 2 retains focus and selection with one block. The unsent assistant draft survives. |
| Phone, Tab then Enter on all factories | All factories retains focus and selection with nine blocks. |
| Desktop 1440×900, Enter and repeated Enter on factory 1 | Factory 1 retains focus and eight blocks. The next Tab reaches factory 2. |
| Desktop, assistant collapsed, Space on factory 2 | Factory 2 retains focus with one block. The repair does not depend on the assistant being open. |
| Landscape 844×390, Enter on factory 2 | The selected control stays fully visible and hit-testable. Page scroll stays at zero. |
| Phone, October 25 factory-2 empty state | Factory 2 retains focus. The existing recovery action reaches October 17 and its actual work. |

These samples retained the draft `檢查既有 SIM 班表`, preserved their selected dates and had no horizontal page overflow. Header keyboard samples started and ended at page scroll zero. Native key input followed a separately observed focus precondition.

The three original P1 paths also pass. At 390×844 with the assistant collapsed, the first screen shows the actual work shortcut and work blocks, with both scheduling entries hit-testable. With the assistant expanded, keyboard navigation and scrolling expose the board and entries below it without overlap. Desktop geometry also places the assistant before the board, and scrolling exposes an actual block. Both desktop and phone open the manual and automatic dialogs; Escape returns visible focus to their respective entries. No schedule calculation or submission was invoked.

## Regression evidence

The new eight-test suite ran on baseline source before integration and produced four focus failures and four passing non-owner cases. The first adjacent run after the repair passed 42 of 43 tests. Its sole failure came from an existing test's source extractor, which assumed the factory case ended with contiguous `break;}`. The multiline case caused that extractor to include following cases and throw `Illegal break statement`.

The existing test now extracts up to the next case and runs the result inside a switch. Its filter, render and no-modal assertions are unchanged. The adjacent run then passed 43/43, and the scoped regression suite passed 168/168 with no failures or skips. `npm.cmd run build` from `web` passed with the existing bundle-size warning.

Comment review found that the new test extracted code from a comment banner. The extraction now starts at the executable `const PV_BLOCK=new Set(` declaration. The final test file was rerun against a separate copy of baseline source, again producing four passes and four focus failures. The patched new suite and adjacent extraction test passed 12/12. The 168-test run and build preceded only this test-anchor change; application source did not change. These test counts overlap.

```powershell
node --test web/tests/factory-selection-focus.test.mjs web/tests/factory.test.mjs web/tests/modal-resize-focus.test.mjs web/tests/week-focus-visibility.test.mjs web/tests/header-offset.test.mjs web/tests/modal-summary-focus.test.mjs web/tests/staff-group-focus.test.mjs web/tests/drawer-splitter.test.mjs web/tests/person-selection-focus.test.mjs web/tests/drawer-return-focus.test.mjs web/tests/goto-navigation.test.mjs web/tests/day-tools-render.test.mjs web/tests/szoom.test.mjs web/tests/szoom-events.test.mjs web/tests/chat-render-focus.test.mjs web/tests/chat-mount.test.mjs web/tests/chat-drawer.test.mjs web/tests/layout-regression.test.mjs web/tests/mobile-navigation-recovery.test.mjs web/tests/board-locate.test.mjs web/tests/modal-return-focus.test.mjs web/tests/tour.test.mjs web/tests/preview-mobile-actions.test.mjs web/tests/test-mode-schedule.test.mjs web/tests/runtime-config.test.mjs web/tests/cloud-load-safety.test.mjs
```

Independent correctness review found no actionable issue and independently passed the final 12 tests. It confirmed the group-order invariant and focus precedence. The supplied browser captures cover factory activation at scroll zero; nonzero-scroll activation remains unverified. Independent evidence-trail review passed with one pointer gap for the rejected coordinate attempt. The append-only trail now cites the exact transcript records for that attempt. Baseline `0d0f1b7` had ten passing CI checks and no review submissions or threads. Auto-merge was disabled. This historical result does not establish CI success or human approval for the follow-up commit.

## Evidence and limits

Local artifacts are in `C:/Users/me060/Downloads/Factory-Scheduler-Deep-UX-20261106/`. The principal records are `factory-focus-baseline.json`, `factory-focus-fixed.json`, `factory-p1-verification.json`, `factory-red.log`, `factory-green.log`, `factory-green-final.log`, `factory-regression.log`, `factory-build.log`, `factory-red-final-anchor.log` and `factory-green-final-anchor.log`. Screenshots include `factory-focus-desktop-fixed.png`, `factory-focus-phone-fixed.png`, `factory-focus-landscape-fixed.png`, `factory-p1-phone-collapsed.png`, `factory-p1-phone-expanded.png` and `factory-p1-desktop.png`. Raw SIM data and local evidence stay outside Git.

A phone scroll attempt did not reach the top. Its misleading provisional step label is explicitly corrected in `factory-p1-verification.json`; it is not first-screen evidence. Control+Home subsequently recorded scroll zero, and the collapsed-assistant screenshot and DOM measurements establish first-screen visibility. A coordinate outside the tab was rejected before input and then corrected using the observed screenshot bounds.

The unit model covers the second factory group and non-owner body, assistant, modal and cell cases. The existing read-only fixture blocks floor-page navigation, so floor-page native interaction remains unverified. The model does not replace the actual SIM keyboard acceptance above. It cannot prove native focus rendering or Tab order.

Native calendar selection, physical devices and soft-keyboard behavior remain unverified. Manual-entry field and error acceptance still lacks eligible unfinished work in the unchanged SIM snapshot; only its empty-state open and cancel paths pass. No fabricated orders or weakened fixture guards were used.

Snapshot and fixture hashes are recorded in the local final manifest. Production 1023, database writes, migrations, account changes, merges and deployments remain outside this work. The old heartbeat remains paused. The separately active goal still has no filled-in deadline or token budget.
