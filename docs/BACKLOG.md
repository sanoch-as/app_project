# Backlog — Explicitly out of scope for v1

Per `prompt-claude-code-plataforma-pm.md` section 4.2. Nothing below is implemented in this repository; it is recorded here so scope is unambiguous.

## D. Full Resource Management
- Material/equipment resources as first-class entities, resource-type costing.
- Per-resource availability calendars.
- Workload / capacity histogram view.
- **v1 stand-in**: `users.cost_per_hour` (nullable) lets EVM derive actual cost (AC) without a resources module. When D is built, cost-per-hour should migrate from `users` to a new `resources` table (see the data-model note in section 5 of the spec) — do not over-design this now.

## E. Full Time Tracking (Tempo-style)
- Approval workflow: `draft` → `submitted` → `approved`/`rejected`.
- Billable/non-billable and CapEx/OpEx flags on worklogs.
- Start/stop timer UX.
- Team capacity views.
- Calendar integration for timesheet pre-fill.
- **v1 stand-in**: `worklogs` (section 5) has no `status`/`billable`/`approved_by` columns — every logged hour counts immediately toward AC (see ADR-005 in DECISIONS.md). Extending `worklogs` with those columns is the natural migration path when E is built.

## H. Collaboration
- @mentions on task comments (plain comments themselves shipped — see ADR-031).
- Comments on projects (only task-level comments shipped — see ADR-031).
- In-app notifications.
- Chat.

## I. Notion-style Documentation
- Wiki pages.
- Relational databases with rollups.
- Document templates.

## J. Advanced Administration
- Granular per-project roles (e.g. `project_manager`, `viewer`) beyond the two global roles (`admin`/`member`) implemented in v1.
- Multi-tenant invitations by email (v1's `POST /users/invite` exists as an endpoint shape but only admin-creates-user is implemented — no email delivery, see docs/api-conventions.md).
- Detailed `audit_logs` table.
- SSO / 2FA.

## K. Integrations
- MS Project (`.mpp`) import/export.
- ERP integrations.
- Slack/Teams notifications.
- Outbound webhooks.

## L. Platform
- Native mobile app.
- Offline mode.
- Multi-language / i18n.

## M. Advanced Analytics
- Monte Carlo schedule simulation.
- Risk register / risk management.
- AI-assisted suggestions.
- "What-if" scenario planning.

## Known v1 modeling limits (not full features, but documented simplifications)
- **`percent_complete` history — partially resolved (ADR-028)**: a `task_progress_snapshots` table (task_id, snapshot_date, percent_complete) now exists, written daily by the same cron/recalculate flow as `progress_snapshots`, and backs the Forecast tab's "% Real" history chart. It only starts accumulating from the day it shipped forward — there is no retroactive history — so it can't backfill the past. `services/scurve.py`'s dollar-denominated S-curve (Overview tab) still uses each task's *current* `percent_complete` for every historical week (ADR-013 unchanged) — updating it to read from the new snapshot table instead is a natural follow-up, not done here since it wasn't asked for.

## Known v1 modeling limits — WBS hierarchy (ADR-030)
- **`wbs_code` is ordered lexicographically, not numerically**, in `task_repository.list_by_project`/`list_all_by_project`'s `ORDER BY wbs_code` (a plain string column) — with 10+ siblings under the same parent, `"10"` sorts before `"2"`. The new roll-up/move code sidesteps this by sorting on `int(wbs_code.rsplit(".", 1)[-1])` instead of the raw string wherever sibling order actually matters, but the query-level `ORDER BY` itself is unchanged. A real fix would need either a computed sort column or `ORDER BY` on the split numeric segments.
- **A parent task's own dependencies stop driving anything once it has children**: CPM (`services/critical_path.py`) excludes any task with children from its schedule graph (ADR-030) — its dates now come from roll-up, not from `services/scheduler.py`'s successor-cascade. If a task already had predecessor/successor dependency rows before gaining children, those rows are left in place but become inert; nothing currently warns the user or blocks adding a dependency to a task that already has (or later gains) children.
- **The Tasks tree's drag-and-drop reparenting is desktop-mouse-only** (`@dnd-kit/core` with only a `PointerSensor` configured — same limitation as the Kanban board, ADR-019): no touch-screen support, and no keyboard-based reordering fallback.

## Known v1 modeling limits — Jira CSV import (ADR-034)
- **Assignees are never imported** — the CSV only has a free-text responsible-person name, no email, so there's no safe way to match it to a real user account in this app. Every imported task is unassigned; the user assigns manually afterward.
- **No @mention/comment import**, no attachment import — only the WBS hierarchy, name, status, priority, dates and (see ADR-035) an auto-generated sequential dependency chain are mapped. Out of scope, not asked for.
- **Re-importing can renumber `wbs_code`** for previously-imported tasks if the project has since gained hand-added root-level tasks, or hand-added children under an imported parent — the root offset and each sibling group's numbering are recomputed fresh from current state on every sync, not preserved from the prior import.
- **A duplicate CSV column header silently loses data**: `csv.DictReader` keeps only the last occurrence of a repeated header name (e.g. this sample export happens to have two "Campo personalizado (Budget)" columns) — not an issue for anything this importer currently reads, but worth knowing if a future Jira export adds a genuinely duplicated column the parser relies on.
- **Deletions never sync**: a task whose Jira issue disappears from a later export is left in this app as-is, never removed — sync here means "create or update," not "mirror exactly," to avoid an importer silently deleting real logged work.

## Known v1 modeling limits — Jira CSV import auto-dependencies (ADR-035)
- **The CSV's real "blocks"/"is blocked by" links are never read** — Jira's "Elementos vinculados" field is empty in every real export seen so far, so what's generated is a stand-in sequential chain (by date, within each sibling group), not a faithful import of the user's actual Jira link graph. If a future export does carry usable link data, this importer still ignores it.
- **A sibling group that mixes leaf and parent tasks gets no automatic chain at all** (not present in the current sample file) — deciding an ordering across tasks of different schedulable "levels" isn't obviously well-defined, so it's left unchained rather than guessed at.
- **No cycle check on the bulk-generated edges** — unlike the one-at-a-time `POST /tasks/{id}/dependencies` endpoint (which DFS-checks every new edge against the whole project graph), the importer skips this for bulk-performance reasons (see ADR-035). Safe in practice because each generated chain is a simple sorted walk that can't be cyclic on its own, and `critical_path._topological_order` already degrades gracefully (never raises) if a cycle somehow occurs — but a pathological combination with a pre-existing manual dependency elsewhere in the project could in theory produce a less-accurate float/critical-path calculation without any error being surfaced.
- **A manual dependency that happens to occupy the exact same `(predecessor, successor)` pair the importer would generate is never "claimed" as auto-generated** — it survives every future resync untouched (good), but is also never refreshed if it becomes stale relative to the CSV's current order (the importer only ever adds a new edge for that pair if none exists yet).

## Known v1 modeling limits — Jira CSV import project-summary root (ADR-036)
- **A project Jira-imported before ADR-036 shipped only gets the new "0" summary root (and its now one-level-deeper `wbs_code`s) the next time it's resynced** — not retroactively, and not on its own; re-uploading the same CSV once is required to pick this up.
- **The wrapper's own `status`/`priority` are static placeholders** (`not_started`/`medium`) — unlike its rolled-up dates/cost/%, these two fields aren't derived from anything and are reset to those same defaults on every resync if a user manually changes them via the UI, the same "the import defines this field" semantics every other Jira-imported task already has.
- **Deleting the whole project is the only way to remove the summary root** (and everything it wraps) — `task_service.delete_task` rejects deleting it directly (`409`) since its subtree cascades on delete (ADR-030). There's no "unwrap"/"detach children" alternative; if the user wants to keep the imported tasks but drop the wrapper, they'd have to manually drag every phase out from under it first (each drag is a normal, unguarded `move_task` call).

## Known v1 scaling limits (not full features, but documented constraints)
- **`refresh_tokens` cleanup**: expired/revoked rows are filtered out at query time (`expires_at`/`revoked`), never purged. Fine at MVP scale; add a periodic cleanup (e.g. an extra daily Vercel Cron endpoint) if the table grows large.
- **`POST /progress/recalculate-all` scaling**: processes every `active` project in one request, one query per project (no N+1). If the number of active projects grows large enough to risk exceeding the Vercel plan's `maxDuration` (10s on Hobby), this endpoint should be paginated across multiple cron-triggered invocations, or the project should move to a Vercel plan with a higher `maxDuration`. See ADR-003.
- **Tenant isolation is application-level** (a FastAPI dependency), not Postgres Row-Level Security. See ADR-007 for the reasoning and the suggested v2 hardening.
- **Login rate limiting is per-account** (`users.failed_login_attempts`/`locked_until`), not per-IP. See ADR-004.

## Frontend (Phase 7) — known limits and deferred items
- **Token storage is `localStorage`** (via a Zustand `persist` store — see ADR-018), not httpOnly cookies. Standard XSS-exposure trade-off for an MVP with no third-party scripts. A production hardening pass should move to httpOnly cookies + CSRF tokens, which requires backend changes (new cookie-issuing auth endpoints) out of scope for a frontend-only phase.
- **Gantt drag-and-drop sends a calendar-day duration, not a working-day one** (see ADR-021): dragging a bar across a weekend/holiday can persist an `end_date` slightly later than the visually dragged span, because `frappe-gantt`'s drag callback has no awareness of the project's working calendar. The Gantt refetches server truth immediately after, so the display self-corrects; a future improvement could mirror the backend's `working_calendar.py` logic in the frontend (or expose a lightweight "preview end date" endpoint) to make the drag itself calendar-aware.
- **Milestones render as a synthetic 1-day bar** in the Gantt (ADR-021) rather than a true diamond marker — `frappe-gantt` 0.6.1 (the version that installed cleanly) has no built-in milestone shape. Upgrading to a newer `frappe-gantt` major version (if one adds this) is a low-risk follow-up.
- **No contract test pinning the access token's `sub` claim to a user id** (ADR-023): the frontend decodes the JWT client-side to work around the absence of a `GET /users/me` endpoint. If the backend's token payload shape ever changes, this breaks silently. A shared fixture/contract test across `backend/tests` and a future `frontend/src/lib/jwt.test.ts` would catch that drift; no frontend test runner is wired up yet (see below).
- **No frontend automated test suite**: `npm run lint`/`typecheck`/`build` are wired into CI (`.github/workflows/ci.yml`), but no unit/component test runner (e.g. Vitest + Testing Library) or E2E runner (e.g. Playwright) was added for phase 7. Verification for this phase was live API smoke-testing (curl against the running backend) plus static checks (typecheck/lint/build, and requesting every source file through Vite's dev server to confirm it transforms without error) — not automated regression tests or in-browser click-through testing (no browser automation tool was available in the environment this phase was built in). Adding Vitest for hooks/components and a small Playwright golden-path spec (register → project → tasks/dependency → Gantt → worklog → baseline → dashboard) is a natural next step before this ships to real users.
- **No code-splitting**: `vite build` currently emits a single ~830KB JS chunk (frappe-gantt, recharts, tanstack table/query and the whole route tree are all in one bundle). Fine for an MVP's first load; route-based `React.lazy` code-splitting would be the natural next step if initial load time becomes a concern.
- **Calendar view has no drag-to-reschedule** and no week/day zoom (ADR-020) — rescheduling from the calendar tab isn't supported; use the Gantt or task form instead.
- **Kanban drag-and-drop is desktop-mouse-only** (ADR-019, native HTML5 DnD) — no touch-screen support.
- **Backend error messages are not translated** (ADR-029): the frontend UI (labels, buttons, navigation, static/frontend-authored messages) is fully bilingual (ES/EN), but error text returned by the API itself (`ForbiddenError`/`ConflictError`/Pydantic validation messages) is always in English, regardless of the user's selected language — internationalizing that would mean touching every backend exception site, not asked for when the i18n feature was built. A future pass could add an `Accept-Language`-aware error catalog on the backend, or move error-message formatting to the frontend using error `code`s (which are already stable, language-independent strings) instead of the raw `detail` text.
