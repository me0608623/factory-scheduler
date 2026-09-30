# Factory Scheduler — current handoff

Last updated: 2026-09-30 (Asia/Taipei)

This is the first file a replacement agent should read. It records the current repository, production environment, verified state, and the next safe actions. Do not put passwords, Supabase service-role keys, anon keys, or AI provider keys in this file.

## Project locations

- Local repository: `C:\Users\me060\Downloads\factory-scheduler`
- GitHub: `git@github.com:me0608623/factory-scheduler.git`
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

Then read:

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

## In-progress production sync acceptance test

User request: modify real production schedule/Supabase data and verify simultaneous cloud sync under different accounts.

Completed:

1. Confirmed Supabase initially had one auth user.
2. Created the second regression auth user above with auto-confirm enabled.
3. Updated its `public.profiles` row to role `lead` and display name `同步驗收帳號`.
4. Logged into production in an isolated Chrome session as the second account.
5. Kept the original in-app-browser session logged in as `me0608623@gmail.com`.
6. Both sessions are positioned at factory 1, date `2026-12-15`.
7. Both showed the original state `開加班到 20:00`, meaning overtime was off before the test.

Not yet completed:

1. Account A toggles overtime on for `2026-12-15` and waits for `已同步`.
2. Without reloading, verify account B changes to the overtime-on state through Supabase Realtime.
3. Account B toggles overtime off and waits for `已同步`.
4. Without reloading, verify account A returns to the overtime-off state.
5. Reload both sessions and verify the same final state.
6. Query `public.calendar_days` and `public.schedule_state` in Supabase to record the persisted value/version.
7. Leave `2026-12-15` in its original overtime-off state. Do not alter imported employees, machines, orders, or 1023 history.
8. Record results in `docs/QA_RELEASE_GATE_2026-09-30.md` and update this handoff.

If the UI refuses the overtime change because `setupPending` blocks it, do not bypass product validation. Use a temporary schedule memo as the real-time test record, verify two-way sync, then delete only that clearly labelled QA memo and report the deletion.

## Safety and deployment rules

- Do not expose secrets in Markdown, Git, terminal output, screenshots, or chat.
- Do not modify or delete imported 1023 people, machines, orders, or legacy archives for testing.
- Do not enable OR-Tools while `setupPending` is true.
- Production database changes must be minimal, reversible, and verified from both UI and Supabase.
- Before any future schema migration, obtain a restorable database backup; the production Supabase project is on the Free plan and does not provide managed database backups.
- Never merge or deploy solely because tests passed locally; run the release-gate checks and verify Render health after deployment.

## Current Git head when this file was written

- `e2d8999 fix: identify Coding Plan failures accurately`
- Working tree was clean before adding this handoff file.
