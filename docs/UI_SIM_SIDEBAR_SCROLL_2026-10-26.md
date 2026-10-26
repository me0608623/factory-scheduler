# SIM sidebar scrolling verification

## Reproduction and fix

The desktop navigation could not reach More in short windows. With the actual SIM snapshot at 1440×420 and 844×390, the fixed sidebar had 944 px of content but `overflow-y: visible`. More began at y=619, outside both viewports. Wheel input over the sidebar scrolled the main page while the sidebar stayed at scrollTop=0. The collapsed sidebar also placed More outside the viewport at y=481.

The fix gives the desktop sidebar vertical scrolling at widths of at least 681 px. It keeps horizontal overflow hidden and uses a thin scrollbar. The existing mobile bottom navigation applies through 680 px and keeps its previous overflow behavior.

Actual browser testing found that a regular scrollbar reduced the collapsed navigation target to 40 px wide. The thin scrollbar restores about 45×48 px. Independent review then identified a possible clipped expand button. Runtime measurement confirmed its right edge at x=73 beyond the scrollport edge at x=67. Reducing the collapsed brand gap from 10 px to 2 px places the unchanged 30×30 px button entirely inside, ending at x=65. Pointer expansion succeeds.

Fix Root Causes puts scrolling on the constrained navigation container. The patch changes two CSS rules and adds no JavaScript, state, or data operation.

## Verification

- At 1440×420, wheel input now moves sidebar scrollTop to 538 and More appears at y=81. At 844×390, it moves to 568 and More appears at y=51. Pointer clicks open More at both sizes. Escape closes the drawer normally.
- The collapsed 844×390 sidebar scrolls to More, whose target measures about 45×48 px. More opens, and scrolling back to the top permits pointer expansion. The expand button is fully within the scrollport.
- At widths 681, 680, and 390, the sidebar/bottom-bar breakpoint behaves as intended with no horizontal document overflow. The 680 and 390 px views retain four mobile destinations. More still opens on mobile.
- Actual SIM P1 checks pass at 390×844 and 1440×900. Ten day blocks remain, actual blocks and manual/automatic entries are visible in the first viewport, and the expanded assistant ends above the board.
- All 116 existing scoped tests from the [drawer focus verification](UI_SIM_DRAWER_FOCUS_2026-10-26.md#verification) pass on the final CSS. The web build passes with the existing chunk-size warning. No full migration-capable test command was run.
- Scoped comment review passed. The first independent source review raised the expand-button concern; after correction and browser verification, a fresh independent review passed.

No new CSS-text assertion was added. The decisive failing/passing check is actual pointer scrolling and activation in the browser; the existing suite covers neighboring layout and navigation behavior. This follows Test Behavior, Not Implementation and Prove It Works.

## Evidence and limits

Local evidence is in `C:/Users/me060/Downloads/Factory-Scheduler-SIM-UX-20261026`: `sidebar-scroll-before.json`, `sidebar-scroll-after.json`, before/after screenshots, `sidebar-regression.log`, and `sidebar-build.log`. Testing used the existing network-blocked, read-only actual SIM fixture. Viewport resizing is not physical-device testing, and native Safari remains unverified.

Production 1023 was not accessed. No migration, database function change, account change, merge, or deployment occurred. Keep PR #50 unmerged with auto-merge off. Previous head `b7a74af` had ten successful CI checks; new-head CI must be checked separately.
