# Catalog identity completion release

This release preserves existing employee UUIDs and workstation IDs. Source employee
codes are separate from internal application codes. Unresolved aliases remain
suggestions on existing records, not automatic identity merges. Source notes and
cell references remain visible in the employee dialog.

Workstation source groups and left/right positions are provenance metadata only.
They do not establish shared capacity or independent parallel machines.

## Production procedure

1. Recheck the approved source hash and production version/counts.
2. Take a full custom-format `pg_dump`, validate its table of contents and fully
   decompress it using `pg_restore` before any write. Keep the backup private.
3. In one administrator transaction apply migration 0019 and the session-local
   maintenance function, then invoke it using the reviewed private input JSON.
4. Stop on a changed baseline, source hash, identity/code conflict, duplicate
   position, incomplete group or already-completed import. Never blindly rerun.
5. Verify 30 pending employee records (13 / 17), four held alias suggestions,
   45 existing positions across 38 source groups, no skills inferred, no schedule
   blocks or open work orders, and `setup_pending=true`.
6. Deploy the tested frontend only after the database transaction is verified.
   Check both factories and identity/position details in the authenticated UI.

The maintenance function is temporary and not exposed as an authenticated RPC.
Real source workbooks, roster previews, credentials and database dumps must not be
committed to this repository. The release does not remove pending-data guards or
enable automatic scheduling against incomplete source work.

## Local verification

- Database migration/security/regression suite: 155 passed.
- Frontend unit and mock-database suite: 38 passed.
- Solver suite: 85 passed (one existing dependency deprecation warning).
- Frontend production build: passed (existing bundle-size warning).

These are local results, not evidence of a production write or deployment.
