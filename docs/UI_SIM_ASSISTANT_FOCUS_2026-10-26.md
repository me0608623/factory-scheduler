# SIM assistant keyboard visibility verification

## Reproduction and fix

At 1440×900, open the assistant, collapse navigation, open the output drawer, and close it with Escape. Shift+Tab back through navigation to the assistant. The focused quick-action button and text field remained behind the sticky page header. Their center points hit the header instead of the focused controls.

The assistant correctly occupies document flow, but native focus scrolling had no clearance for the sticky header. The existing `--hdr-h` already measures its bottom edge and becomes zero when the header is static. One CSS rule gives assistant controls a top scroll margin of that height plus 8px for rounding and focus-outline clearance. It changes no layout, focus order, application state or data operation.

Fix Root Causes guided reuse of the measured header offset. Prove It Works required the same native keyboard path before and after the change. A new string-matching CSS test would not establish browser scrolling behavior, so this change uses recorded browser reproduction and existing regression tests instead of a test-only commit.

## Verification

- Before: the quick-action button's top was about 237px and the text field's top about 114px, both under a 285px header; both center hit tests failed. After: both controls scroll to about 293px, below the header, and both center hit tests pass.
- Actual SIM checks also pass at 1440×420 with expanded navigation, 390×844 and 844×390. On the smaller widths, the header offset is zero and both focused controls remain visible. No quick action, AI request or submit button was activated.
- Assistant-open output/more drawer switching preserves the draft and ten day blocks. Closing the mobile drawer returns focus to its navigation entry. Closing and reopening the assistant preserves the unsent draft; reloading the read-only fixture then clears it.
- Original P1 checks pass at 390×844 and 1440×900: actual work and both scheduling entries are visible with the assistant closed; expanding it leaves about 72px and 98px between the assistant and board. Ten day blocks remain, with no horizontal document overflow.
- All 141 scoped regression tests pass: run the 139-test command described in [dialog disclosure verification](UI_SIM_SUMMARY_FOCUS_2026-10-26.md#verification), adding `web/tests/header-offset.test.mjs`. `npm.cmd run build` passes with the existing chunk-size warning. Independent review passed and separately reran ten header/chat tests; comment review found no added comments or suppressions.

## Evidence and limits

Local evidence under `C:/Users/me060/Downloads/Factory-Scheduler-SIM-UX-20261026` includes `assistant-sticky-before.json`, `assistant-sticky-after.json`, `assistant-sticky-p1.json`, before/after screenshots, and the `assistant-sticky-regression` and `assistant-sticky-build` logs. Browser checks use the existing actual SIM read-only snapshot. Physical-device keyboards and Safari remain unverified.

No production 1023 access, database write, migration, merge or deployment occurred. Original audit files and snapshot are preserved. Previous head `35c2310` passed ten CI checks, with no submitted GitHub review and auto-merge off; the new commit requires a separate CI check.
