# Factory Scheduler — current handoff

Last updated: 2026-09-30 (Asia/Taipei)

This is the first file a replacement agent should read. It records the current repository, production environment, verified state, and the next safe actions. Do not put passwords, Supabase service-role keys, anon keys, or AI provider keys in this file.

## Project locations

- Local repository: `C:\Users\me060\Downloads\factory-scheduler`
- GitHub: `https://github.com/me0608623/factory-scheduler` (remote `origin` switched from SSH to HTTPS on 2026-09-30: this machine has no SSH key; HTTPS credentials come from the GitHub CLI login for `me0608623`)
- Active branch: `main`
- Production web: `https://factory-scheduler-web.onrender.com/`
- Production Supabase project ref: `kjnnguekhshkhgycmryl`
- Render services: `factory-scheduler-web` and `factory-scheduler-solver`

Always begin with:

```powershell
Set-Location 'C:\Users\me060\Downloads\factory-scheduler'
git status --short --branch
git log -5 --oneline
```

The duplicate local/remote commit divergence described later in this file was resolved on 2026-09-30 without a force push. Production migration 0029, GitHub `main`, and both Render services were released and verified. Read `docs/RELEASE_2026-09-30.md` for the authoritative release checkpoint before relying on the historical takeover notes below.

Then read:

- `docs/FIELD_EXECUTION_2026-09-30.md`
- `docs/QA_RELEASE_GATE_2026-09-30.md`
- `docs/QA_COMPONENT_INVENTORY_2026-09-30.md`
- `docs/TEST_STATUS.md`
- the domain-specific files in `docs/` for roster, staff groups, cross-factory transfers, work contents, and planning workflow.

## Current production state

- Production is configured for Supabase cloud data and the Render OR-Tools service.
- The imported 1023 employee/equipment catalog is present, but the app deliberately remains in `setupPending`: skills, actual work times, and process definitions still need human confirmation. Automatic scheduling and fault rescheduling therefore remain disabled.
- The main production account `me0608623@gmail.com` has app role `lead` (組長).
- A second regression account was created on 2026-09-30: `me0608623+sync-test@gmail.com`, display name `同步驗收帳號`, app role `lead`. Its password exists only in the active browser automation session and must not be copied into source, logs, or this document. Reset it through Supabase if another session must reuse the account.
- The Z.ai Coding Plan assistant integration is deployed through the solver. Provider secrets are held only in Render environment variables.

## Completed production sync acceptance test

User request: modify real production schedule/Supabase data and verify simultaneous cloud sync under different accounts.

Completed on 2026-09-30:

1. Confirmed Supabase initially had one auth user.
2. Created the second regression auth user above with auto-confirm enabled.
3. Updated its `public.profiles` row to role `lead` and display name `同步驗收帳號`.
4. Logged into production in an isolated Chrome session as the second account.
5. Kept the original in-app-browser session logged in as `me0608623@gmail.com`.
6. Both sessions are positioned at factory 1, date `2026-12-15`.
7. Both showed the original state `開加班到 20:00`, meaning overtime was off before the test.
8. Account A enabled overtime for `2026-12-15`; account B received the change without reload.
9. Account B disabled overtime; account A received the change without reload.
10. Both isolated sessions were reloaded, navigated back to `2026-12-15`, and showed the restored overtime-off state with `已同步`.
11. Supabase audit query found two change-set rows with different `created_by` identities, proving each account wrote once.
12. Final database state: no `calendar_days` row for `2026-12-15`, `overtime` null, `schedule_state.version` 3. The test left no calendar override behind.
13. Results are recorded in `docs/QA_RELEASE_GATE_2026-09-30.md`.

## 2026-09-30 takeover verification

Recorded by the replacement agent immediately after takeover. All checks were read-only; nothing was reset, merged, or pushed.

- Working tree clean at `0435b05` before this update; `git fetch` over SSH failed (`Permission denied (publickey)`), so the remote URL was switched to HTTPS and `git fetch origin` then succeeded.
- Live `origin/main` is `ce8aec1`. Local `main` and `origin/main` diverged after merge base `b24fbc6`: remote carries `ed4a061` + `ce8aec1` (author 任庭宇), local carries the same changes as `2f9dad0` + `e2d8999` (author me0608623) plus three local-only docs commits (`880e005`, `0de2695`, `0435b05`).
- Ignoring line endings (CRLF/LF), the only content difference between remote tip `ce8aec1` and local `e2d8999` is one trailing blank line in `solver/app/chat.py` and one in `web/src/app.js`. The code is functionally identical; the divergence is duplicate commits from two environments, not lost work.
- Consequence: `git push` from this workspace would be rejected (non-fast-forward). When the user approves publishing, rebase or merge the local docs commits onto `origin/main`, re-check the diff, and only then push — a push to `main` may trigger a Render production deployment.
- Remote branches now visible: `codex/catalog-completion-20260928`, `codex/excel-friendly-ui-20260930`, `codex/legacy-1023-conversion-20260927`, `codex/overnight-reliability-20260926`, `codex/staff-groups-20260929`, `codex/work-content-resources-20260929`.
- Read-only production health on 2026-09-30: web `GET /` returned 200; solver `/health` returned `ok`, OR-Tools `9.15.6755`, `database: true`, capabilities `work_assignments_v1`, `staff_roster_draft_v1`, `schedule_chat_readonly_v1`, `schedule_chat_range_v1`, `schedule_chat_ai_v1`.

## Safety and deployment rules

- Do not expose secrets in Markdown, Git, terminal output, screenshots, or chat.
- Do not modify or delete imported 1023 people, machines, orders, or legacy archives for testing.
- Do not enable OR-Tools while `setupPending` is true.
- Production database changes must be minimal, reversible, and verified from both UI and Supabase.
- Before any future schema migration, obtain a restorable database backup; the production Supabase project is on the Free plan and does not provide managed database backups.
- Never merge or deploy solely because tests passed locally; run the release-gate checks and verify Render health after deployment.

## Released field-execution changes

The field-execution loop documented in `docs/FIELD_EXECUTION_2026-09-30.md` was released on 2026-09-30. It makes completed shortfalls re-enter the remaining quantity, forwards actual execution to OR-Tools, adds an employee current/next work ticket with three large reporting buttons, makes failed writes say `沒存到`, and adds a print-today entry. Migration `0029_execution_shortfall_replan.sql` is active in production. The feature remains deliberately gated by `setupPending` until the imported catalog and work rules are confirmed.

## Current Git head when this file was first written

- `e2d8999 fix: identify Coding Plan failures accurately`
- Working tree was clean before adding this handoff file.

The 2026-09-30 takeover update is committed locally only (never pushed without explicit user approval); check `git log -1` for its hash.
