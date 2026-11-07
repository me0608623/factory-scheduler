# Atomic calendar and replacement schedule

Migration source `0040_atomic_calendar_schedule.sql` adds `save_calendar_and_blocks`. It is not a production migration instruction. Validate and review before any deployment. This independent draft is based on the deterministic-calendar-fixtures branch; pending migrations 0038/0039 and other draft fixes are not assumed merged.

## Narrow guarantee

When both schedule blocks and calendar rows change, the Store sends one transaction for:

- `calendar_weekly` upserts;
- `calendar_days` upserts and deletions, including numeric overtime endpoints;
- `employee_overtime_days` upserts and deletions, including removal restoring weekly defaults;
- the exact replacement block candidate and ordinary audit metadata.

Unsupported mixed order/catalog/employee-master changes are rejected before any write. Existing non-row entity guards also reject mixed saves. Calendar-only saves retain their existing route and permissions and are **outside this atomicity guarantee**. This patch does not add whole-calendar validation of unchanged blocks/general assignments, repair candidates again, or change historical/execution rules. Local calendar preflight and general-work overtime fixes remain separate.

The RPC is SECURITY INVOKER and checks both existing `calendar.manage` and `schedule.manage`. Calendar DML keeps existing RLS; the existing protected `save_blocks` function owns version checking, schedule validation, locking and version advancement. The invoker must not attempt `SELECT schedule_state FOR UPDATE`: current RLS exposes no rows to that lock even for authenticated boss accounts. Any later failure in `save_blocks` rolls the entire calendar transaction back. No table rights or policies are added.

Calendar deletions happen before block validation so the final effective calendar is used. Malformed/unknown keys, duplicate keys and simultaneous upsert/delete keys are rejected. Calendar audit rows retain the existing pre-save_blocks correlation behavior, like the order wrapper; all audit changes still roll back together.

## Unconfirmed results

A page-session pending gate is set before dispatch. Only a valid UUID receipt from the original Store/client/user/auth epoch accepts the new baseline and advances the version once. The transport pins the original token. Known SQL rejection clears the gate. Missing receipts, transport loss, malformed responses and unknown gateway failures preserve the gate, candidate and baseline. Re-reading a snapshot does not prove an in-flight request ended and does not clear the gate. No legacy per-table fallback occurs when the RPC is missing or fails.

Full-shaped SQLSTATE40001/40P01 HTTP500 responses are recognized as known rollback, following the separate block-save confirmation draft's PostgREST test precedent. Bare/malformed500 and502/503 remain unknown. The pending getter supplies the same full-page recovery guidance to retry/manual/leave/import/logout UI; healthy in-flight saves do not display unknown-result guidance.

## Draft composition

- Atomic order save (0039): retain its independent route and reject order+calendar+blocks mixtures before DML. Do not silently select one partial transaction.
- Unknown save_blocks confirmation: OR execution, order, block and calendar gates in `hasPendingConfirmations`; check all relevant gates before any sync path. Retain each attempt's owner/ledger token so old acknowledgments cannot clear newer pending state. Share compatible UI hooks without reverting other pending messages. The calendar path uses complete known-rollback500 semantics; do not copy an older order-wrapper status classifier unchanged.
- Calendar preflight: retain its cloned candidate and rejection behavior. This transaction handles remote partial persistence after a valid candidate is accepted.
- General-work overtime: retain numeric cutoff and assignment protections. Including daily OT deltas here does not replace that validation.

## Focused checks

From `web`: `node --test tests/atomic-calendar-*.test.mjs tests/import-confirm.test.mjs tests/leave-brush-save.test.mjs tests/preview-events.test.mjs`.

The tests use isolated migrated PGlite, real Store/SDK transport and extracted actual handlers. They cover day/modal/daily OT, success, stale version and competing schedule write, late validation/FK rollback, deletions, permissions, malformed/duplicate input, unsupported mixed diffs, pinned owner tokens, lost/late receipts, no blind retry, and UI recovery guidance. No live server/browser/production observation is claimed.
