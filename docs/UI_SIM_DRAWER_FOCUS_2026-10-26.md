# SIM drawer keyboard focus verification

## Reproduction and fix

With the actual SIM snapshot on 2026-10-25, opening More with Enter and closing it with Escape left keyboard focus on BODY at both 390×844 and 1440×900. The next Tab selected the return-to-production link on mobile. The close button at both sizes and a second activation of More on desktop also left focus on BODY. Mobile More → leave calendar → Escape also lost focus.

All three explicit dismissal handlers replace the application DOM without restoring navigation focus. Keeping the old button element would not help because opening the drawer already replaces it. The fix resolves a visible navigation button after the closing render. Mobile leave calendar and notes return to More. Settings returns to a visible settings control, which is not guaranteed to be the exact original settings launcher.

The change uses the existing drawer kind and adds no stored state, helper, or signature. It does not change ordinary rendering, drawer opening, navigation to another page, or modal precedence. Fix Root Causes kept the change in the three explicit dismissal paths. Model the Domain kept the existing drawer string as the destination identity.

## Verification

- The new 18 behavior tests execute the actual key handler, drawer action branches, and navigation markup. Before the fix, 16 failed and 2 passed. The failing More assertion received `undefined` instead of the expected `drawer` action because focus remained on the body.
- After the fix, all 116 scoped tests passed. The command in the previous [navigation verification](UI_SIM_NAVIGATION_2026-10-26.md#verification) additionally includes `web/tests/drawer-return-focus.test.mjs`. No full migration-capable test command was run.
- `npm.cmd run build` passed with the existing chunk-size warning. Independent code/test review and scoped comment review passed. These local reviews do not represent GitHub human approval.
- Eight actual-SIM browser checks passed. Escape, the close button, and toggling More closed return to the visible More button at 390×844 and 1440×900. Mobile leave-calendar and notes dismissal also return to More. Each result retains all 10 day blocks. Settings destination behavior is covered by the automated tests, not authenticated browser testing.
- The three original P1 checks still pass at both sizes. The closed-assistant first viewport contains visible actual schedule blocks and both manual/automatic entries. The expanded assistant ends above the board, with a 72 px gap on mobile and a 98 px gap on desktop.
- Mobile factory switching shows 0 blocks for factory 2 and restores 10 for all factories and factory 1 on this snapshot date. This is a read-only UI check, not a database change.

Test Behavior, Not Implementation shaped the assertions around the visible focus destination. Prove It Works required repeating the original keyboard paths on the real application with the actual SIM snapshot.

## Evidence and limits

Local evidence lives in `C:/Users/me060/Downloads/Factory-Scheduler-SIM-UX-20261026`: `drawer-focus-before.json`, `drawer-focus-after.json`, before/after screenshots, `drawer-red.log`, `drawer-regression.log`, and `drawer-build.log`. The existing navigation fixture continues to block network access, database writes, submissions, and AI/solver calls. The original 16 audit artifacts retain their recorded hashes.

Production 1023 was not accessed. No migration, database function change, merge, deployment, login, or permission change occurred. Physical-device keyboards and authenticated cloud operation remain unverified. PR #50 stays unmerged with auto-merge off. The previous head `588001d` had ten successful CI checks; the new commit needs its own CI result.
