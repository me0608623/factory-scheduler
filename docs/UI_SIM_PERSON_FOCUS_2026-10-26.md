# SIM person selection focus verification

## Reproduction and fix

In the leave calendar, selecting a person updated the calendar but lost keyboard focus. Actual SIM checks at 1440×900 with Enter and 390×844 with Space left `document.activeElement` on BODY. The next Tab moved to the return-to-production link outside the drawer. That link was never activated. Pointer selection reproduced the same lost focus on mobile.

The `focus-person` handler updates `UI.focus` and calls `render()`, which replaces the app DOM. The selected person and calendar were correct, but the focused button was disconnected. History shows this handler predates the recent drawer dismissal changes.

The one-line fix focuses the newly rendered person button with `aria-pressed="true"` immediately after rendering. It uses the existing selection state and adds no persistent state, helper, or data operation. Model the Domain kept the existing employee selection shape. Fix Root Causes placed focus restoration in the action that requests the redraw.

## Verification

The four new tests execute the actual handler, render function, and people calendar renderer. Before the fix, all four failed at `focus follows the selected person after redraw`: the active element had an empty dataset instead of the selected person's `focus-person` dataset. After the fix, all four passed. Cases cover changing and repeating selections, calendar identity, connected focus, preserved navigation context, and frozen schedule/leave data.

- Actual SIM mobile Space, repeated Enter, and last-person Enter retain the selected button's focus. The selected button is fully inside the horizontally scrolled person list. Tab advances to the next person; after the last person, it reaches the month control. The month control was not activated.
- Actual SIM desktop Enter and repeated pointer selection retain focus. Tab advances to the next person inside the drawer. The calendar heading matches the selected person, with 31 October dates and the same ten day blocks.
- Original P1 checks pass at 390×844 and 1440×900. Actual day blocks and both scheduling entries are visible. The expanded assistant ends above the board with gaps of 72 px and 98 px respectively.
- All 120 scoped tests pass. Run the 116-test command in [drawer focus verification](UI_SIM_DRAWER_FOCUS_2026-10-26.md#verification), adding `web/tests/person-selection-focus.test.mjs`. The web build passes with the existing chunk-size warning. No migration-capable full test command was run.
- Scoped comment review found no added comments or suppressions. Independent source/test review passed and independently reran the four new tests.

Test Behavior, Not Implementation informed the selection, calendar, and active-focus assertions. Prove It Works required the actual SIM keyboard and pointer checks beyond the VM tests.

## Evidence and limits

Local evidence is in `C:/Users/me060/Downloads/Factory-Scheduler-SIM-UX-20261026`: `person-focus-before-after.json`, before/after screenshots, `person-red.log`, `person-regression.log`, and `person-build.log`. The snapshot and screenshots remain local. All 16 original audit files retain their original hashes.

The browser used the existing network-blocked actual SIM snapshot. Tests did not edit leave dates, submit data, or activate the return-to-production link. Physical-phone keyboards and native Safari remain unverified. The separate machine-selection action has a similar source pattern but is blocked by this fixture and remains an unverified follow-up.

Production 1023 was not accessed. No migration, database function change, account change, merge, or deployment occurred. Keep PR #50 unmerged with auto-merge off. Prior head `c95a24b` had ten successful CI checks; the new head must be checked separately.
