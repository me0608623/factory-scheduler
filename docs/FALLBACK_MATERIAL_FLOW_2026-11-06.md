# Browser fallback cumulative material guard

## Reproduction and scope

The Excel importer accepts a 240-piece order with upstream rate 1 piece/minute,
downstream rate 2 and transfer batch 30. Two qualified workers use separate
machines. A downstream fault on 2026-11-09 from 10:00 to 13:00 is valid.

Before the fix, actual `autoPlan` returns no failures: upstream 08:00–12:00,
240 pieces; downstream 08:30–10:00, 180 pieces, then 13:00–13:30, 60 pieces.
At 10:00 downstream output exceeds upstream output by 60 pieces. The final
completion heuristic passes, so adding more timing retries alone cannot fix it.

The independent Python validator rejects this output solely for cumulative
material flow. The actual migration 0029 `_assert_manual_material_flow` function
also rejects it in an isolated PGlite database. The UI's `issuesOf` already warns
about the violation, but `buildPlans` includes the candidate and `enterPreview`
does not mark it inapplicable for this reason. Cloud persistence rejects the
invalid plan. No actual browser/local-persistence result is claimed here.

## Minimal correction

`placeJob` now checks the original planner's returned blocks using the existing
`materialFlowIssue` semantics, including completion reports and retained blocks,
excluding exactly the supplied exclusion IDs. Initial handoff readiness is also
computed from retained supply and actual reported output. A safe first candidate
is unchanged, including valid batch overlap. An unsafe candidate gets one
conservative retry after retained upstream completion. A still-invalid candidate
returns `null`, allowing callers to report failure. The planner does not mutate
retained blocks while testing either candidate.

After each order, `autoPlan` and `planOrder` additionally check all adjacent
material edges, including already-full pinned downstream steps skipped by the
placement loop. On failure they restore that order's pre-placement block list
and report an explicit material failure. Existing pins and previously planned
orders remain; unsafe newly proposed work for this order is discarded.

The original planner body is unchanged and renamed `placeJobCandidate`. No
quantity-rounding logic from PR54 is duplicated. This is a bounded safety guard,
not an optimal material-constrained scheduler: it may delay more than necessary,
and does not search all alternative machine choices after rejecting the original
best candidate. The candidate wrapper validates the placed step against its
predecessor; the order-level check validates adjacent edges for that order, not
unrelated plan defects.

## Verification

- New focused suite: 16 tests pass; on the original app source, 11 fail and 5 pass.
- New suite plus manual, manual-edge and duration-rounding: 36 pass.
- Combined PR54 planner and this guard: 27 pass (16 material and 11 quantity).
- Actual fixed reproduction: downstream 13:00–15:00, 240 pieces; Python validator
  returns no issues. The same snapshot, directly produced by the modified app
  without post-processing, passes the actual SQL guard in isolated PGlite.
  No production database was touched.
- Full frontend suite: 963 passed, 0 skipped; production build and diff check passed.
  The existing bundle-size warning remains.
- Coverage includes valid overlap, actual upstream/downstream done quantities,
  pinned retained work, excluded upstream/downstream work, exhaustion, bounded
  rejection, explicit autoPlan failure, and unchanged state after failure.

Run from `web` after installing locked dependencies:

```
node --test tests/fallback-material-flow.test.mjs tests/manual.test.mjs tests/manual-edge.test.mjs tests/duration-rounding.test.mjs
```

To reproduce red tests, set `FLOW_APP_SOURCE` to the original `web/src/app.js`.


## PR54 integration

A three-way merge has one adjacency conflict at the beginning of the original
`placeJob` body. Keep this wrapper, name the original body `placeJobCandidate`,
and keep PR54's quantity-aware body and simulate changes. PR54's test harness
now injects its already-imported `materialFlowIssue` into its VM context
(test-only follow-up commit `d30d162cdc78976a6a75fc2d54918cb6427c5b4e`). No
other baseline harness was found executing `placeJob`. The combined source and
that one-line harness correction were tested without modifying either PR54's
checkout or this branch's quantity algorithm.
