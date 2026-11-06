# Work-detail focus after viewport shrink

PR [#50](https://github.com/me0608623/factory-scheduler/pull/50), branch `codex/test-schedule-display-20261023`. Baseline `94ecaa7729b29f231c3c4f336ccf491ec0543a31`. Browser checks on 2026-11-06/07 (Asia/Taipei) used the existing local actual-SIM navigation fixture with cloud, write, solve and AI actions blocked.

## Reproduction and repair

P2: shrinking an open work-detail dialog retained keyboard focus outside its scrolling body's visible area. In the actual SIM fixture, opening both detail disclosures and focusing the related-work summary at 360×640, then resizing to 640×360, left the summary at y444.15–467.34 while the body ended at y269.33. A same-width 360×640 to 360×420 change also clipped the end-time select at y414.57–466.57 beneath the body's y329.33 edge. Both hit tests failed. Tab could recover focus, so this was invisible retained focus, not a trapped dialog or lost edits.

The existing sizing function changed the modal dimensions but did not reveal its retained active descendant. The repair adds one synchronous body-scroll adjustment after those dimensions are applied. It changes no focus, markup, timers, listeners, sizing policy or application state. Visible controls and focus in the header/footer stay untouched. A bounded six-CSS-pixel inset accommodates the existing focus ring; oversized controls expose the nearest portion without alternating edges on repeated sizing.

Three independent design candidates and a separate judge compared body-only scrolling, viewport-policy changes and extracted helpers. The chosen design keeps ownership in the existing sizing function and avoids unproven viewport changes. Independent comment and correctness reviews found no actionable issue in the final source/test diff.

## Actual SIM acceptance

| Operation | Result |
| --- | --- |
| Summary, 360×640 → 640×360 | Same focused summary at y240.15–263.34, inside body y112.46–269.33; hit test passes. Both disclosures remain open. |
| End-time select, 360×640 → 360×420 | Same focused field at y271.24–323.24, inside body y144.35–329.33; hit test and visible focus ring pass. |
| Three short/tall cycles with the select | Focus remains visible and body scroll stays at 868.67 CSS px. Background page scroll remains unchanged. |
| Desktop select, 1440×900 → 1440×420 | Field ends at y319.49, above the body edge y325.33; hit test passes. Escape returns to the matching work block. |
| Native keyboard continuation | Summary Space toggles open/closed; Tab reaches the related action. Shift+Tab from end time reaches start time. |
| Header/footer counterexamples | Header Close stays visible. At fixed width 640, footer focus survives 480→360 height with body scroll unchanged. Width changes can legitimately reflow and change native scroll anchoring. The preview button was focused, never activated. |

The observed time values stayed 480/720, and the visible schedule retained ten blocks. Browser checks preserved existing field values; edited-draft and exact DOM-object identity retention were tested by the focused unit model, not independently demonstrated in the browser.

The original three P1 paths were rechecked at 1440×900 and 390×844. The mobile first screen shows the actual SIM work shortcut and the upper portion of actual work blocks. Manual and automatic entries open their respective dialogs. With the assistant expanded, Escape closes each dialog and returns visible focus to its original entry on both desktop and phone. With the assistant expanded, it precedes the board in document flow; scrolling exposes clickable work blocks and both entries without overlap or horizontal overflow. An initial block-center counter returned zero for mobile first-screen blocks because their centers were below the viewport. Screenshot inspection and upper-portion hit tests confirmed visibility; this counter is not a defect or a failed acceptance result. These checks cover entry/open/cancel, not form submission or solver execution.

## Regression evidence

The new seven-test suite first produced two passes and five failures against the baseline, including `focused control 350..420 is inside modal body 100..300`. After the repair, the focused and adjacent suites passed 22/22; the following scoped suite passed 156/156 with zero failures or skips. These counts overlap and must not be added together.

```powershell
node --test web/tests/modal-resize-focus.test.mjs web/tests/week-focus-visibility.test.mjs web/tests/header-offset.test.mjs web/tests/modal-summary-focus.test.mjs web/tests/staff-group-focus.test.mjs web/tests/drawer-splitter.test.mjs web/tests/person-selection-focus.test.mjs web/tests/drawer-return-focus.test.mjs web/tests/goto-navigation.test.mjs web/tests/day-tools-render.test.mjs web/tests/szoom.test.mjs web/tests/szoom-events.test.mjs web/tests/chat-render-focus.test.mjs web/tests/chat-mount.test.mjs web/tests/chat-drawer.test.mjs web/tests/layout-regression.test.mjs web/tests/mobile-navigation-recovery.test.mjs web/tests/board-locate.test.mjs web/tests/modal-return-focus.test.mjs web/tests/tour.test.mjs web/tests/preview-mobile-actions.test.mjs web/tests/test-mode-schedule.test.mjs web/tests/runtime-config.test.mjs web/tests/cloud-load-safety.test.mjs
```

`npm.cmd run build` from `web` passed. The existing bundle-size warning remains. No migration-bearing test or workflow was manually executed.

Local evidence is in `C:/Users/me060/Downloads/Factory-Scheduler-Deep-UX-20261106/`: `modal-resize-baseline.json`, `modal-resize-fixed.json`, `modal-resize-audit-followup.json`, `cross-flow-cancel.json`, `modal-red.log`, `modal-green.log`, `regression.log`, `build.log`, `p1-verification.json`, `correctness-review.md` and `comment-review.md`. The audit follow-up records separate Space-open/closed states and the post-fix header counterexample. Screenshots include `modal-fixed-short-phone.png`, `modal-fixed-landscape.png`, `modal-fixed-short-desktop.png`, `p1-phone-first-screen.png`, `p1-phone-expanded-scrolled.png` and `p1-desktop-expanded-scrolled.png`. These local artifacts and the raw snapshot are excluded from Git.

## Remaining coverage and limits

- Native date-picker selection/cancellation remains unverified. The IAB did not expose a visible calendar; a separate Chrome tab binding failed. A read-only DOM scope reporting an unavailable function is not proof that the browser lacks native picker support.
- Manual-entry empty states are verified. Actual field, error and cancellation acceptance is blocked because the unchanged snapshot contains zero steps with positive remaining quantity in either factory. No orders were fabricated. A future authorized SIM snapshot with naturally unfinished work is needed for those fields.
- App-scale geometry is tested at 1 and 1.25 in the unit model. Browser app-scale changes, native pickers during resize, physical devices and soft-keyboard/visual-viewport offsets remain unverified.
- At 2026-11-06T16:05:44Z, baseline `94ecaa7` had ten passing CI checks, no review threads or submitted reviews, and auto-merge disabled. Raw responses are saved in `ci-before-push.json` and `reviews-before-push.json` beside the local evidence. This is historical evidence, not the status or human approval of the follow-up commit. Check the new head after push.

Snapshot SHA-256 remained `595439DEF53C16F29F4502A3DCFD532E55D1FCD9DD05191769A4F29007F161E8`. Production 1023 was not accessed, and no database write, migration, account change, merge or deployment was performed. The old heartbeat remains paused; this work belongs to the separately active goal, whose deadline and token budget are still unspecified.
