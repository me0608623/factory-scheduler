# Atomic order and schedule saves

`0039_atomic_order_schedule_save.sql` adds `save_orders_and_blocks` without
changing the existing RPC signatures, table RLS, roles, or feature permissions.
The new function runs as the caller, requires both `orders.manage` and
`schedule.manage`, writes only explicit order columns, and calls the existing
versioned `save_blocks` inside the same transaction. Rejection of either part
rolls back orders, blocks, audit records, change sets, and the version update.
Completed work contributes actual completed quantity, while historical nominal
block quantities remain unchanged. The cap check covers every upserted order,
including orders whose own blocks were unchanged.

The frontend uses this path when order rows and blocks both change. Other
catalog changes (including calendar/overtime), or order deletions, in that same
candidate are rejected before any request. This deliberately excludes fallback
plans that combine an order change with overtime changes. Separate those edits
rather than silently falling back to partial writes. Simple saves continue using
their existing paths. Quantity-only reduction protection is a separate concern;
this transaction path does not replace the order-reduction guard.

## Rollout and uncertain results

The SQL migration must be installed through the normal authorized deployment
process before the new frontend can save compound order/block changes. An old
server returning a known missing-RPC response fails closed. Existing clients
remain compatible with the unchanged old endpoints, but retain their previous
multi-request behavior. No production migration is part of this repository change.

Only a confirmed UUID receipt advances the frontend baseline and version. A
known rejection clears the pending flag; a missing/malformed receipt, transport
failure, or ambiguous server error leaves the outcome unconfirmed. Further
`sync` calls in that page session cannot dispatch another write. Ordinary
snapshot loads do not clear this gate because a read cannot prove an earlier
request has finished. Fully refresh the page and inspect the newly loaded cloud
state before continuing. Unsaved local edits can be lost when refreshing.
This is a page-session safeguard, not a durable idempotency or replay protocol.
Account/client/session changes do not inherit another writer's pending authority.

## Known boundaries

- The schedule-state lock is acquired by `save_blocks`, after transactional order
  DML. A stale version or deadlock rejection rolls back the entire request. The
  focused PGlite tests do not simulate independent concurrent connections.
- Audit rows are atomic but retain legacy correlation: order DML precedes the
  change-set assignment inside `save_blocks`. Order audit rows are not claimed
  to share the block change-set ID.
- Other multi-table save paths remain outside this narrow fix.

Focused tests: `node --test web/tests/atomic-order-save.test.mjs web/tests/atomic-order-transport.test.mjs`.
