# Factory Scheduler — current handoff

Last updated: 2026-10-26 (Asia/Taipei)

This is the first file a replacement agent should read. It records the current repository, production environment, verified state, and the next safe actions. Do not put passwords, Supabase service-role keys, anon keys, or AI provider keys in this file.

## Actual SIM interaction checkpoint (2026-10-26; PR #50, not merged or deployed)

- Selecting a leave-calendar person now retains keyboard focus after the page redraw. Actual SIM desktop Enter and mobile Space previously left focus on BODY, then Tab reached the return-to-production link. The one-line fix keeps focus on the selected person. Four new tests first failed, then all 120 scoped tests, build, independent review, and desktop/mobile SIM checks passed. See [UI_SIM_PERSON_FOCUS_2026-10-26.md](UI_SIM_PERSON_FOCUS_2026-10-26.md). Machine selection has a similar source pattern but remains unverified because the read-only fixture blocks that action.
- Short desktop and landscape viewports could not scroll the fixed navigation to More. Desktop-only scrolling and a smaller collapsed-brand gap now keep navigation and the expand button reachable. Actual SIM pointer checks at 1440×420 and 844×390, mobile breakpoint checks, the original P1 checks, 116 scoped tests, build, and fresh independent review passed. See [UI_SIM_SIDEBAR_SCROLL_2026-10-26.md](UI_SIM_SIDEBAR_SCROLL_2026-10-26.md). Physical-device scrolling remains unverified.
- Keyboard drawer dismissal now restores visible navigation focus after Escape, the close button, or toggling the entry closed. Actual SIM desktop/mobile reproduction lost focus on BODY before the fix. The 18 new tests first produced 16 failures; all 116 scoped tests and the build then passed. Eight SIM focus checks and the original three P1 checks passed. See [UI_SIM_DRAWER_FOCUS_2026-10-26.md](UI_SIM_DRAWER_FOCUS_2026-10-26.md). Continue with an untested flow such as staff-group filtering, without repeating healthy paths unnecessarily.
- Follow-up SIM navigation: related-segment and catalog-order links left the original modal/page hiding the destination. The shared date-navigation action now closes the modal through its existing lifecycle and returns to the board. Five new tests first produced four failures; all 98 scoped tests and the build then passed. Eight actual-SIM desktop/mobile navigation checks passed, with limitations recorded in [UI_SIM_NAVIGATION_2026-10-26.md](UI_SIM_NAVIGATION_2026-10-26.md). The original snapshot fixture remains unchanged; a separate local navigation harness retains all write/network blocks.
- Proactive mobile inspection found that zoom and wheel-toggle collapsed the day board's More tools and lost keyboard focus. The two-line render fix preserves native disclosure state across redraws, with no new stored preference or data operation.
- Four new behavior tests first reproduced three failures; the scoped regression suite then passed all 93 tests, and the web build passed. Actual SIM checks passed at 390×844, 360×800, 740×900 and 1440×900; manual/automatic entry dialogs and assistant non-overlap were also rechecked. Independent review found no actionable issue. See [UI_SIM_UX_2026-10-26.md](UI_SIM_UX_2026-10-26.md) for commands, evidence and limits.
- Continue proactive actual-SIM exploration as well as checking the current PR head. The existing 10-minute automation ends at 2026-10-27 11:53:47 Asia/Taipei. Preserve unrelated changes and `web/.audit/`; do not access production 1023, execute migrations, merge, deploy, or enable auto-merge. Historical CI results below do not establish the new head's status.

## Expanded assistant checkpoint (2026-10-25; PR #50, not merged or deployed)

- On 2026-10-26 at 10:21 Asia/Taipei, pstack's status-only watcher confirmed head `24071da98c7589f4b4761139f1d281d63518ee7e` has all 10 CI checks passing, no review threads, and GitHub state `MERGEABLE` / `CLEAN`. GitHub has no submitted reviews or comments; this is not reviewer approval. No source fix or test rerun was needed. See the dated follow-up in the verification record below. Keep auto-merge off.
- The expanded assistant now occupies normal document flow above the schedule. Real SIM snapshot checks passed at five desktop/mobile sizes, including short-height and long-content cases. Read [UI_ASSISTANT_2026-10-25.md](UI_ASSISTANT_2026-10-25.md) for evidence, 82-test regression command and limits.
- The assistant fix and verification record belong to [PR #50](https://github.com/me0608623/factory-scheduler/pull/50) on `codex/test-schedule-display-20261023`. Preserve the unrelated, untracked `web/.audit/` artifacts; the full SIM snapshot and local test page are not part of the commit. Keep the PR unmerged and auto-merge off.
- This UI work made no database change, migration or deployment. The earlier separately authorized two-function staging fix is recorded in the local `Factory-Scheduler-P1-testmode-20261025/RESULTS.md` evidence folder. Do not reapply it as part of UI work.

## UI work checkpoint (2026-10-23; not deployed)

- Branch `codex/test-schedule-display-20261023` contains the three P1 mobile scheduling fixes and follow-up UI audit fixes. Read [UI_UX_FIXES_2026-10-23.md](UI_UX_FIXES_2026-10-23.md) for behavior, screenshots and verification limits.
- Source commit `295b9a1` passed all 986 web tests and the production build. Browser checks used isolated synthetic data at desktop and mobile sizes. They do not establish authenticated cloud sync or native phone keyboard behavior.
- Production 1023 data was not written. No migration or deployment was run. Keep this work unmerged while deployment remains unauthorized: the active main-branch workflow deploys these web changes after Tests pass. Do not disable that workflow or arm auto-merge.
- The checkout is `C:/Users/me060/Downloads/factory-scheduler-test-display-20261023`. The original checkout and existing local audit artifacts were preserved. Inspect the current branch and PR status before continuing.

## Latest release checkpoint (2026-10-15; supersedes the historical notes below)

- The human explicitly authorized verifying isolation and skipping remaining functional acceptance for this release only. PR16 merged as `e0e6f65`; PR18 merged as `3c1e88f` (docs-only afterward). Production web and solver runtime are `e0e6f65`; web bundle `index-CV39COdK.js`. Main Tests38685786845 passed: web857/tools57/solver174; smoke38685788139 passed.
- Production's normal three VITE values were preserved exactly. The three test-mode values were added, saved without a redundant deploy, and read back: only isolated `fkefarcwadvyqqjcjxvp` and staging solver; public publishable key, separate auth storage, no production fallback. The deployed `?mode=test` login and both mode-switch links were exercised, not authenticated cross-account/mobile scheduling.
- No production1023/Auth/roles/setup_pending/data writes or migration. Existing0037 was not rerun. No new resource/paid plan or seed reset. Historical unfinished functional gates remain unverified, not PASS.
- Production web deploy `dep-db862odbedkc739r04f0`; solver final deploy `dep-db864um89jmc73cc8umg` restored two pre-existing AI flags after automatic Blueprint drift. No AI request was made. Investigate configuration drift and a staging-solver health timeout next; do not redeploy blindly.
- Continue from `C:/Users/me060/Downloads/factory-scheduler-release-gate-20261013/docs/CONTINUOUS_RELEASE_GATE.md` top checkpoint and `HANDOFF_RELEASE_20MIN_2026-10-15.md`. The shared checkout below is not switched by this work. Both old Codex timers were observed PAUSED; this release supplies a new-agent prompt, not an already-created new timer. Do not repeat old memo work or wait for already-merged draft PRs.

## Latest release checkpoint (2026-10-12)

- PR #15 (interactive manual scheduling preview) merged after independent review and fixes; production runtime commit `4479cd10d3e95c9c67d73b4db55e8e883a65ba78`.
- Both existing Render services are live on this exact commit. Final PR and main CI passed: frontend 364, database 201, solver 168, cross-layer integration and deployment smoke tests.
- Read `docs/RELEASE_PR15_PREVIEW_2026-10-11.md` for inventory, confirmed defects, fixes, browser evidence, workflow/deploy IDs, and limitations. The filename reflects the start of the review; deployment completed on Taiwan date October 12.
- QA used isolated localhost:5195 local data. Production Supabase, its setupPending state, account permissions and real schedules were not modified; no migration or new paid resource.
- Production browser check was the signed-out login screen only. Local desktop/mobile-size preview/apply tests are not authenticated production cloud-sync or native iPhone Safari acceptance.
- The local branch is `main`; subsequent docs-only commits may be ahead of the runtime commit without requiring a deployment. Always inspect Git and actual Render deploy state.
- Older account/database notes below are historical checkpoints, not freshly verified by this release review.

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
