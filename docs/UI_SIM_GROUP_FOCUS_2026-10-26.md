# SIM staff group focus verification

## Reproduction and fix

Changing the staff group on the employee catalog replaced the focused select and left focus on BODY. The next Tab reached the return-to-production link instead of the employee search field. Actual SIM checks reproduced this at 1440×900 and 390×844, including a single Home or End keypress. The selected group and employee results were correct; keyboard continuity was broken.

The change handler saved `UI.group` and called `render()`, which replaces the app HTML. The new select retained the selected option but did not receive focus. This behavior dates to the original staff-group handler in `ebf2f20`. The one-line fix focuses the new `#staff-group-filter` after rendering. It changes no filtering logic, data, or stored preference.

Model the Domain keeps the existing group identifier and native select. Fix Root Causes restores focus where this control is replaced, without changing global render behavior.

## Verification

- Three new event-driven tests first failed at the replacement-select focus assertion, then passed after the fix. They cover a populated group, ungrouped staff, and an empty group followed by all staff. They also check selected values, employee results, unchanged search text and frozen application data.
- Actual SIM desktop and mobile Home/End input now leaves focus on the select. The next Tab reaches `#emp-search`. The empty-group message remains visible and switching back to all restores 13 employees. The populated group shows eight employees; ungrouped shows five. These are existing snapshot results, not generated acceptance data.
- Neither viewport has document horizontal overflow. The original P1 checks also pass: the day retains ten blocks, some blocks and both scheduling entries are visible on the initial screen, and the expanded assistant ends above the board with gaps of 98 px on desktop and 72 px on mobile.
- All 131 scoped tests pass. Run the command described in [splitter verification](UI_SIM_SPLITTER_2026-10-26.md#verification), adding `web/tests/staff-group-focus.test.mjs`. The web build passes with the existing chunk-size warning. No migration-capable full test command ran.
- Independent source/test review passed and reran the three new tests. Comment review found no added comments or suppressions. The local DOM model cannot establish browser focus by itself; Prove It Works required the actual SIM checks above.

## Evidence and limits

Local evidence is under `C:/Users/me060/Downloads/Factory-Scheduler-SIM-UX-20261026`: `group-focus-before.json`, `group-focus-after.json`, `group-focus-p1.json`, `group-focus-mobile-after.png`, `group-focus-red.log`, `group-focus-regression.log`, and `group-focus-build.log`.

The existing navigation fixture uses the actual read-only SIM snapshot and blocks network and database writes. Search-text preservation was checked by the unit test; typing in the browser search field remains blocked by the fixture and was not claimed as an interactive test. Physical phone keyboards and native Safari remain unverified. The fixture was restored to the original day view with drawers and assistant closed. Original audit files and the snapshot remain unchanged.

Previous head `34a6e80` passed all ten CI checks, with no submitted GitHub review and auto-merge off. That result does not establish this follow-up head's CI status. No production 1023 access, migration, database write, merge or deployment occurred.
