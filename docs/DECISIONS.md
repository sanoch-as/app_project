# Architecture Decision Records

Short-form ADRs for every decision made autonomously (per `prompt-claude-code-plataforma-pm.md`, section 0, rule 1). Format: Context, Decision, Alternatives considered, Consequences.

---

## ADR-001: Poetry declared but pip/requirements.txt used as the executable source of truth

**Context**: The spec (section 2) mandates Poetry for dependency management in development, with `requirements.txt` exported for Vercel's build. The sandbox this project was built in does not have Poetry installed, only `python3`/`pip`.

**Decision**: `backend/pyproject.toml` is kept as the canonical dependency declaration (versions, tool config for ruff/black/mypy/pytest). `backend/requirements.txt` (production deps) and `backend/requirements-dev.txt` (dev/test deps, includes `-r requirements.txt`) are hand-maintained in lockstep with `pyproject.toml` and are what CI, local venv setup, and Vercel's build actually install from. A developer with Poetry available can run `poetry install` and it will match.

**Alternatives considered**: Installing Poetry in every environment that touches this repo (rejected — adds friction with no functional benefit over requirements.txt, which Vercel needs anyway); dropping Poetry entirely from pyproject.toml (rejected — spec explicitly requires it as the documented dev workflow).

**Consequences**: Whoever adds a dependency must update both `pyproject.toml` and the relevant `requirements*.txt` by hand. This is called out in `README.md`.

---

## ADR-002: Async SQLAlchemy 2.0 with `asyncpg`, not sync `psycopg`

**Context**: Section 5's deployment note explicitly references `asyncpg`'s `statement_cache_size=0` as the way to disable prepared statements under PgBouncer transaction pooling (required by Neon's pooled connection string). FastAPI's async request handling is also the idiomatic pairing for SQLAlchemy 2.0.

**Decision**: Use `sqlalchemy[asyncio]` with the `asyncpg` driver end-to-end (engine, sessions, repositories, Alembic migrations via `run_sync`). `DATABASE_URL` uses the `postgresql+asyncpg://` scheme.

**Alternatives considered**: Sync SQLAlchemy with `psycopg` (rejected — the spec's own pooling guidance is asyncpg-specific, and sync engines under a serverless request-per-invocation model gain nothing here).

**Consequences**: Alembic's `env.py` must use the async-engine-with-`run_sync` pattern instead of the classic sync template. All repository/service functions are `async def`.

---

## ADR-003: CPM and cascade rescheduling run synchronously in-request; EVM/S-curve snapshots run via Vercel Cron

**Context**: Section 2 forbids Redis/Celery; Vercel Functions are stateless and short-lived (10s `maxDuration` on Hobby).

**Decision**: `services/critical_path.py` and `services/scheduler.py` execute synchronously inside the same HTTP request that creates/edits a task or dependency, loading all of a project's tasks/dependencies in one query each direction. `services/evm.py` / `services/scurve.py` power both an on-demand per-project recalculation endpoint and a daily `POST /api/v1/progress/recalculate-all` endpoint invoked by a Vercel Cron Job, protected by a `CRON_SECRET` bearer token.

**Alternatives considered**: A queue-based worker (rejected — explicitly out of scope per section 2); recalculating CPM lazily on read instead of on write (rejected — spec section 6.1 explicitly requires recompute on task/dependency mutation, and the Gantt view needs `is_critical`/floats ready to read).

**Consequences**: Task/dependency mutation endpoints have a data-dependent latency floor proportional to project size; documented as a scaling limit in `docs/BACKLOG.md` (pagination/async recompute for very large projects).

---

## ADR-004: No Redis-backed rate limiting — DB-backed lockout on `users`

**Context**: Section 8 requires login rate limiting but forbids introducing Redis as a new dependency solely for this.

**Decision**: Add `failed_login_attempts` (int) and `locked_until` (timestamptz, nullable) to `users`. On failed login, increment the counter; after 5 consecutive failures, set `locked_until = now() + 15 minutes` and reject further attempts until it elapses. Successful login resets the counter.

**Alternatives considered**: In-memory dict per Vercel Function instance (rejected — serverless instances are ephemeral/multiplied, so this would not actually enforce a global limit); a dedicated `login_attempts` table keyed by IP (rejected for v1 — more precise but adds a table and a cleanup concern for a feature that isn't the product's core value; documented as a v2 improvement in BACKLOG.md).

**Consequences**: Rate limiting is per-account, not per-IP; a distributed attacker rotating accounts is not slowed down. Acceptable for v1 per the spec's own framing of this as a minimal stopgap.

---

## ADR-005: Worklogs have no approval workflow; all logged hours count immediately toward AC

**Context**: Section 5 explicitly specifies `worklogs` without `status`/`billable`, and section 4.1/4.2 defers the full Tempo-style approval flow to backlog (module E).

**Decision**: Any worklog a user creates is immediately included in the EVM actual-cost (AC) calculation. `users.cost_per_hour` is nullable; a null rate contributes `0` to AC and logs a warning rather than blocking the calculation (per section 6.3).

**Alternatives considered**: Requiring `cost_per_hour` at user creation (rejected — spec explicitly allows null and defines the fallback behavior).

**Consequences**: AC can understate real cost when `cost_per_hour` is unset. Flagged for the user in the dashboard (a "some users have no hourly rate configured" warning) rather than silently absorbed.

---

## ADR-006: JWT via PyJWT; refresh tokens hashed and persisted in Postgres

**Context**: Section 2 allows `python-jose[cryptography]` or `PyJWT`. Section 8: no Redis, so refresh tokens must persist in Postgres.

**Decision**: Use `PyJWT` for encoding/decoding access tokens (HS256, `JWT_SECRET_KEY`). Refresh tokens are opaque random strings; only their SHA-256 hash is stored in `refresh_tokens.token_hash`, alongside `expires_at`/`revoked`. Refresh/logout look up by hash, never store or log the raw token.

**Alternatives considered**: `python-jose` (rejected — PyJWT has fewer transitive dependencies and is the more actively maintained option as of 2025); storing refresh JWTs themselves in the DB instead of opaque tokens (rejected — opaque random tokens avoid any risk of a stateless JWT refresh token being replayed after "revocation" before its embedded expiry, since revocation is checked directly against the DB row).

**Consequences**: Refresh token validation always costs one DB round trip (acceptable — no Redis available anyway).

---

## ADR-007: Multi-tenant scoping via a FastAPI dependency, not Postgres RLS

**Context**: Section 8 requires every query to filter by the authenticated user's `organization_id`.

**Decision**: A `get_current_org()` FastAPI dependency (in `core/security.py`, wired through `middleware/tenant_context.py`) extracts `organization_id` from the validated JWT and is required by every router that touches org-scoped tables. Repositories accept `organization_id` explicitly and always filter by it.

**Alternatives considered**: Postgres Row-Level Security policies (rejected for v1 — correct long-term choice, but adds session-variable plumbing through the pooled/PgBouncer connection that complicates the Neon pooled-connection setup; revisit in BACKLOG.md as v2 hardening).

**Consequences**: Tenant isolation is enforced in application code, not the database. A missed filter in a new endpoint is a real risk — mitigated by routing all reads through repository functions that require `organization_id` as a parameter (no "unscoped" query helper exists).

---

## ADR-008: Frontend Gantt library — `frappe-gantt`

**Context**: Section 2 allows `frappe-gantt` or `svar-gantt`, or another OSS alternative if documented here.

**Decision**: Use `frappe-gantt` (MIT license). It supports drag-and-drop date changes, dependency arrows, and day/week/month zoom out of the box, which covers section 4.1 point 11's requirements without a paid tier.

**Alternatives considered**: `svar-gantt` (its OSS edition has fewer built-in interaction affordances for dependency editing at evaluation time); building a bespoke Gantt on top of `react-dnd` (rejected — reinventing a well-solved problem, not justified for v1).

**Consequences**: `frappe-gantt` is a vanilla-JS library, not a native React component; it's wrapped in a thin React component (`components/gantt/GanttChart.tsx`) that manages its lifecycle via `useEffect`/refs.

---

## ADR-009: Dependency versions pinned to what installs on Python 3.14, not the versions named in the spec

**Context**: The build environment only has Python 3.14 available (no 3.12/3.13 interpreter installed). The spec's suggested minimum versions (e.g. FastAPI >=0.115, SQLAlchemy 2.0.35) predate prebuilt wheels for 3.14 for some packages (`pydantic-core`, `asyncpg`, `greenlet` all ship as compiled extensions); pinning to those exact minimums fails to install because pip falls back to source builds that require a Rust toolchain matching PyO3's supported Python ceiling, which does not yet include 3.14 for those old releases.

**Decision**: Install and pin the latest available versions of every dependency that provide 3.14 wheels at build time (e.g. `fastapi==0.141.1`, `sqlalchemy==2.0.53`, `pydantic==2.13.5`, `asyncpg==0.31.0` — see `backend/requirements.txt` for the full pinned list). `pyproject.toml`'s caret ranges were bumped to match. The project still targets "Python 3.12+" per the spec (`requires-python = "^3.12"`); newer patch/minor releases of the same major dependency lines are a compatible superset of what was asked for, not a substitution of a different library.

**Alternatives considered**: Installing an older Python via pyenv/compiling from source (rejected — adds a heavy, environment-specific step for zero functional benefit versus just using newer, still-compatible releases of the exact same libraries); pinning old versions and leaving `pip install` broken (rejected — violates section 0 rule 2, "código funcional real").

**Consequences**: If a specific pinned patch version listed in the spec's text is required for an unrelated reason (e.g. a corporate mirror only carrying older builds), `requirements.txt` will need adjusting for that environment; behaviorally nothing in this codebase depends on a version-specific API added between the spec's suggested minimums and the pinned versions used here.

---

## ADR-010: `services/` and `repositories/` contain more files than the five explicitly named in section 3

**Context**: Section 3's folder tree bullets five `services/` files (`auth_service.py`, `critical_path.py`, `scheduler.py`, `evm.py`, `scurve.py`) and gives `repositories/` no bulleted list at all, just the comment "capa de acceso a datos (queries)". Every entity (projects, tasks, dependencies, baselines, worklogs) still needs data-access queries and, in several cases (WBS numbering, dependency-cycle validation before insert, permission checks tied to project membership), real orchestration logic beyond a single-table CRUD call.

**Decision**: `repositories/` gets one module per entity (`project_repository.py`, `task_repository.py`, `dependency_repository.py`, `baseline_repository.py`, `worklog_repository.py`, `progress_repository.py`), matching the existing `organization_repository.py`/`user_repository.py`/`refresh_token_repository.py` pattern already used for auth. `services/` gets additional entity-oriented modules only where there is real multi-step domain logic beyond CRUD (e.g. `project_service.py`, `task_service.py`, `dependency_service.py` for cycle detection + triggering CPM recompute); simple attribute updates (e.g. patching a user's profile) stay as thin endpoint-to-repository calls with no service module, to avoid empty pass-through layers.

**Alternatives considered**: Treating the five bulleted `services/` files as an exhaustive whitelist and cramming cycle-detection/CPM-triggering logic into the endpoint layer instead (rejected — endpoints should stay thin request/response adapters; burying algorithmic logic there hurts testability, and `tests/unit/` needs something importable without spinning up FastAPI).

**Consequences**: None functionally — this only affects internal file layout within directories the spec already designates for exactly this purpose. No top-level folder, model, or API route changes as a result.

---

## ADR-011: `GET /organizations/me` added — a minimal read endpoint not listed in section 7

**Context**: Section 3 requires `api/v1/endpoints/organizations.py` to exist, but section 7's endpoint list has no `/organizations/*` routes at all.

**Decision**: Implement a single `GET /organizations/me` returning the authenticated user's organization (name, slug, timestamps) — used by the frontend header/settings and by nothing else. No organization create/update/delete endpoints are added (organizations are created only as a side effect of `POST /auth/register`, per section 4.1 point 1).

**Alternatives considered**: Leaving `organizations.py` as an empty router (rejected — section 0 rule 2 forbids placeholder code with no real implementation); adding full organization CRUD (rejected — out of scope, v1 has exactly one organization per registration and no mechanism to rename/merge/delete one).

**Consequences**: None beyond the one added route.

---

## ADR-012: Task scheduling convention — start date + duration in, end date computed; WBS codes auto-numbered

**Context**: The `tasks` table (section 5) has `start_date`, `end_date`, and `duration_days` as three separate columns, but the spec does not say which are user input versus derived, nor how `wbs_code` gets assigned. This is exactly the kind of ambiguity section 0 rule 1 asks to resolve with the industry-standard convention.

**Decision**:
- **Scheduling input**: a task is created/edited with `start_date` + `duration_days` (in working days); `end_date` is computed server-side (`services/working_calendar.py`) by walking forward `duration_days - 1` working days from `start_date` (a 1-day task starts and ends the same day), skipping weekends and the project's `project_holidays`. A milestone (`is_milestone = true`) always has `duration_days = 0` and `end_date = start_date`. This matches MS Project's default behavior (the spec's own first named reference point) and keeps `duration_days` — which `services/critical_path.py` needs for `EF = ES + duration_days` — as the authoritative input rather than a value back-derived from two dates that could disagree with it.
- **Working calendar**: `projects.working_days_per_week` (an integer 5/6/7, not a specific weekday mask) is interpreted as "the first N days of a Monday-start week are working days" — i.e. 5 = Mon–Fri, 6 = Mon–Sat, 7 = every day. This is the simplest convention consistent with a single integer column (section 5 defines no weekday-mask column), and covers the overwhelming majority of real working calendars.
- **`wbs_code` numbering**: assigned automatically on task creation, as `"<parent's wbs_code>.<n>"` (or just `"<n>"` at the top level), where `n` is one more than the current number of siblings under the same parent. Codes are not renumbered when a sibling is later deleted (so a gap like "2.1", "2.3" can appear) — renumbering on every delete would silently rewrite other tasks' identifiers, which is more disruptive than a gap; this matches how most real WBS tools behave (manual renumbering is a deliberate action, not an automatic side effect of deletion).

**Alternatives considered**: Accepting `end_date` directly and deriving `duration_days` from the calendar (rejected — makes `duration_days` a derived value the CPM engine can't treat as authoritative input, and doesn't match the "estilo MS Project" framing in section 1); a weekday-mask calendar (rejected — over-engineered relative to the "calendario laboral básico" the spec actually asks for in section 4.1 point 5).

**Consequences**: Changing `working_days_per_week` after tasks exist does not retroactively recompute their `end_date` — only a subsequent edit to that specific task recomputes it. This is acceptable for v1 and not expected to be a common operation.

---

## ADR-013: EVM/S-curve computation design — live-computed reads, `progress_snapshots` as the cron's historical log only

**Context**: Section 7 gives exactly one read endpoint for progress (`GET /projects/{id}/progress`) alongside two write-only recompute endpoints (`POST .../progress/recalculate`, `POST /progress/recalculate-all`). Section 4.1 point 20 says `progress_snapshots` stores a "snapshot histórico... recalculado por un Vercel Cron Job diario + endpoint on-demand," but never says the read endpoint has to source its response from that table. Meanwhile the Definition of Done requires the S-curve to "update when hours are logged or % complete changes" — i.e. it must never look stale.

**Decision**:
- `GET /projects/{id}/progress` always computes fresh, live numbers (`services/evm.py` + `services/scurve.py`) from the current `tasks`/`baseline_tasks`/`worklogs` — it never reads `progress_snapshots`. This is what makes it react instantly to a new worklog or a `percent_complete` edit, satisfying the DoD line above.
- `progress_snapshots` is written only by the two recompute endpoints (the daily cron and the manual "recalculate now" button), each call upserting exactly one row for `(project_id, today)`. It exists as a historical trend log outside what the spec's section 7 endpoint set otherwise exposes — nothing currently reads it back, but it is populated exactly as section 5 describes, ready for a future trend-over-time report.
- **PV** at a status date `t`: for each task, prorate its baseline (`baseline_tasks` of the *active* baseline — ADR-014) `planned_cost` linearly between `planned_start_date` and `planned_end_date` (0% before the window, 100% at/after `planned_end_date`), then sum across tasks. If a project has no baseline yet, PV is `0` for every task (there is nothing to compare against — this is a real state, not an error, and is surfaced by `SPI` coming back `null`).
- **EV** at any status date: `sum((percent_complete / 100) * budgeted_cost)` over all tasks, using each task's *current* `percent_complete` — per section 6.3's own words, "el valor actual si t = hoy," and no percent-complete history table exists to do better for `t != hoy` (see the "v1 stand-in" note this implies in `docs/BACKLOG.md`). Concretely: EV is the same number regardless of which date it's evaluated at, including every point along the S-curve. PV and AC still vary by week (they're schedule- and worklog-date-driven respectively), so `SPI`/`CPI` still produce a meaningful, moving curve — only the raw EV line itself is flat.
- **AC** at a status date `t`: `sum(hours * cost_per_hour)` over every worklog on the project's tasks with `work_date <= t`; a user with a null `cost_per_hour` contributes `0` and triggers a `structlog` warning (never blocks the calculation) — exactly as section 6.3 specifies.
- **S-curve checkpoints**: one point per week, from the active baseline's earliest `planned_start_date` to its latest `planned_end_date` inclusive (if there's no baseline, the curve is empty — there's nothing to plot). `PV` at each checkpoint uses that checkpoint's real date (it's purely schedule-derived, so future checkpoints are fully known in advance); `AC` (and therefore `CPI`) at a checkpoint clamps its status date to `min(checkpoint, today)`, so checkpoints beyond today show today's actual cost held flat rather than fabricating future actuals.

**Alternatives considered**: Reading `GET /progress` from `progress_snapshots` (rejected — the daily-cron-populated table would be stale/empty for a brand-new project or one just registered with the platform, directly conflicting with the DoD's "updates immediately" requirement); inventing a proxy for historical EV from worklog hours (e.g. scaling current EV by the fraction of total hours logged by each checkpoint) to make the historical EV line non-flat (rejected — not something section 6.3 asks for, and it would silently blend two conceptually different measures — hours spent vs. value earned — under an invented formula with no basis in the spec).

**Consequences**: The EV line on the S-curve chart is flat across history in the current UI (only `SPI`/`CPI`, driven by `PV`/`AC`, meaningfully trend week to week) until a real percent-complete history table exists. This is called out again in `docs/BACKLOG.md` as a natural extension of module D/E's evolution.

---

## ADR-014: The "active baseline" for EVM is simply the most recently created one

**Context**: Section 6.3 computes PV "desde `baseline_tasks` de la baseline activa", but section 5's `baselines` table has no `is_active`/`is_current` flag, and section 4.1 point 14 explicitly allows multiple historical baselines per project.

**Decision**: The active baseline for a project is whichever baseline has the most recent `created_at` for that project. No separate "activate" action or flag is needed — saving a new baseline (`POST /projects/{id}/baselines`) automatically supersedes the previous one as "active" for EVM purposes, while every prior baseline remains queryable via `GET /baselines/{id}` for historical comparison.

**Alternatives considered**: Adding an `is_active` boolean column with an explicit activate/deactivate action (rejected — the spec's data model for `baselines` is given as fixed columns with "se puede extender pero no reducir"; adding a whole activation workflow for something "most recent" already captures unambiguously is unwarranted complexity for v1).

**Consequences**: There's no way to mark an older baseline as "active" again without creating a new baseline row copying its values. Not needed for v1 — flagged only if a future requirement demands reverting to a prior baseline as the EVM reference.

---

## ADR-015: Dependency constraints follow section 6.1's formula literally — `FS` lag 0 permits a same-day start

**Context**: Section 6.1 gives the CPM forward-pass formula explicitly: "FS: `EF_predecessor + lag`; SS: `ES_predecessor + lag`; etc." Many scheduling tools (MS Project included, in some configurations) treat `FS` with lag 0 as requiring the successor to start the *next* working period after the predecessor finishes, i.e. an implicit "+1". The spec's own formula has no such implicit offset.

**Decision**: Implement the formula exactly as written: for `FS`, `successor.early_start >= predecessor.early_finish + lag_days` (working days), so `lag_days = 0` allows the successor to start on the very same calendar day the predecessor finishes. The same "no implicit offset" reading applies symmetrically to `SS`/`FF`/`SF` (`services/critical_path.py`'s `forward_constraint`/`_backward_constraint`, reused by `services/scheduler.py`'s cascade). `lag_days` is a plain integer count of working days added via `WorkingCalendar.shift_working_days` (skipping weekends/holidays); a negative value is a lead ("adelanto"), pulling the successor earlier and permitting overlap.

**Alternatives considered**: Adding an implicit "+1 working day" for `FS`/`SF` the way some tools do (rejected — not what section 6.1 states, and would silently diverge from a spec that gives an explicit formula rather than leaving this to convention).

**Consequences**: A `FS` dependency with `lag_days = 0` lets predecessor and successor occupy the same calendar day (e.g. a 1-day predecessor finishing Friday and a 1-day `FS` successor also landing on that Friday). A project that wants a mandatory one-day gap should model it as `lag_days = 1`. This is documented behavior, not a rounding quirk — `tests/unit/test_critical_path.py` and `test_scheduler.py` assert it directly.

---

## ADR-016: `bcrypt` pinned to `4.0.1`, not the newest release

**Context**: `passlib` 1.7.4 (the version required by section 2, and the newest one that exists — the project has been unmaintained since 2020) runs a self-test the first time it hashes/verifies a password, to detect a historical "wraparound bug" in some bcrypt builds. That self-test assumes bcrypt silently truncates secrets longer than 72 bytes. Starting with `bcrypt` 4.1, the `bcrypt` package raises `ValueError` on oversized secrets instead of truncating — which makes passlib's own self-test crash with `ValueError: password cannot be longer than 72 bytes`, on every single hash/verify call, independent of the actual password used by this app (none of which are anywhere near 72 bytes). This reproduced identically with `bcrypt` 5.0.0 (the version that installs by default on Python 3.14) and is a known upstream incompatibility, not a bug in this codebase.

**Decision**: Pin `bcrypt==4.0.1` — the last release before that behavior change, confirmed compatible with passlib's self-test, and confirmed to ship a `cp36-abi3` wheel (stable ABI) that installs on Python 3.14 without a source build.

**Alternatives considered**: Dropping `passlib` for direct `bcrypt.hashpw`/`checkpw` calls (rejected — section 2 explicitly requires `passlib[bcrypt]`, and this incompatibility is fully resolved by a version pin without abandoning that library); monkey-patching around passlib's self-test (rejected — fragile, and pinning a known-good dependency version is the more conventional fix for an upstream incompatibility).

**Consequences**: `bcrypt` cannot be bumped past 4.0.x without either dropping passlib or waiting for passlib to release a fix (it has not, as of this writing, in over four years). This is recorded as a known constraint, not a TODO — no functional password-hashing capability is missing.

---

## ADR-017: `docker compose` used only for local Postgres, never for running the app

**Context**: Section 2/12 forbid Docker in production; Vercel builds/runs the app directly.

**Decision**: `docker-compose.yml` at the repo root defines only a `postgres` service. Backend and frontend run via `uvicorn`/`vercel dev` and `npm run dev` respectively, against that container or Neon.

**Consequences**: None beyond what the spec already dictates; noted here only for completeness of the ADR log.

---

## ADR-018: Frontend token storage — localStorage via a Zustand `persist` store; single-retry refresh interceptor

**Context**: Phase 7 needs a place to hold the access/refresh token pair and the current user/organization across page reloads. The backend has no cookie-issuing endpoint (tokens come back as JSON in the response body, not `Set-Cookie`), and CORS is configured for a bearer header (`Authorization`), not `credentials: include` cookies.

**Decision**: `frontend/src/store/authStore.ts` is a Zustand store with the `persist` middleware, writing `{accessToken, refreshToken, user, organization, isAuthenticated}` to `localStorage` under the key `pmp-auth`. `frontend/src/api/client.ts` wires an Axios request interceptor that attaches `Authorization: Bearer <accessToken>`, and a response interceptor that on a `401` (excluding requests to `/auth/*` itself) calls `POST /auth/refresh` exactly once (concurrent 401s are coalesced into a single in-flight refresh promise), retries the original request with the new access token, and — if the refresh itself fails — clears the store. `ProtectedRoute` (in `components/common/ProtectedRoute.tsx`) reads `isAuthenticated` reactively and redirects to `/login`, so a cleared store immediately routes the user out without any imperative `window.location` call.

**Alternatives considered**: httpOnly cookies set by the backend (rejected — would require adding cookie-issuing endpoints and CSRF handling to a backend that is already complete/committed for phases 0–6, out of scope for a frontend-only phase); holding tokens only in memory / a React context with no persistence (rejected — every page refresh would force a re-login, poor MVP UX for a tool meant to be left open during a workday); `sessionStorage` instead of `localStorage` (rejected — would log the user out every time they close the tab, which is stricter than the access-token/refresh-token expiry model already implies).

**Consequences**: Tokens are readable by any JavaScript running on the page (the standard XSS-exposure trade-off of `localStorage` token storage) — acceptable for an MVP with no third-party scripts loaded. A real production hardening pass would move to httpOnly cookies plus CSRF tokens; noted in `docs/BACKLOG.md`.

---

## ADR-019: Kanban board uses native HTML5 drag-and-drop, no DnD library

**Context**: The brief explicitly says not to add a drag-and-drop library beyond the mandated stack (section 2 lists no DnD library at all).

**Decision**: `components/kanban/KanbanBoard.tsx` implements column-to-column dragging with the browser's native `draggable`/`onDragStart`/`onDragOver`/`onDrop` events, storing the dragged task's id in `event.dataTransfer` and calling `PATCH /tasks/{id}` with the new `status` on drop.

**Alternatives considered**: `react-dnd` or `@dnd-kit/core` (rejected — not in the mandated stack and unnecessary for a single-axis "move card between 4 columns" interaction that native HTML5 DnD handles fully).

**Consequences**: No touch-screen drag support (native HTML5 DnD is desktop-mouse-only in most browsers) — acceptable for an MVP aimed at desktop project-manager usage; noted in `docs/BACKLOG.md` if touch support is ever required.

---

## ADR-020: Calendar view is a hand-rolled month grid, no calendar library

**Context**: The brief explicitly asks for the month calendar view to be "implemented with plain grid layout, no calendar library."

**Decision**: `pages/projects/ProjectCalendarTab.tsx` computes its own Monday-start 6-week grid for the displayed month with plain `Date` arithmetic and renders it as a CSS grid, placing each task on every day between its `start_date` and `end_date` inclusive. Milestones and critical-path tasks get distinct chip colors; clicking a task chip opens the same `TaskFormModal` used everywhere else.

**Alternatives considered**: `react-big-calendar`, `FullCalendar` (rejected — explicitly out of scope per the brief, and a plain grid is sufficient for the "place tasks by date" requirement with no need for drag-resize or recurring events).

**Consequences**: No week/day calendar views, no drag-to-reschedule from the calendar (rescheduling is done via the Gantt or the task form) — acceptable for v1's "basic month calendar view" requirement (spec section 4.1 point 15).

---

## ADR-021: Gantt milestone rendering and drag-granularity limits of `frappe-gantt` 0.6.1

**Context**: ADR-008 already chose `frappe-gantt`. Reading its source (`node_modules/frappe-gantt/src/index.js`/`bar.js`, version 0.6.1, pinned in `package.json`) directly — rather than assuming a newer API — shows two real limitations: (1) a zero-width bar (a milestone task, whose `start_date === end_date` per ADR-012) renders as invisible, since the library computes bar width purely from `(end - start) * column_width` with no dedicated diamond/milestone marker in this version; (2) `on_date_change` fires with plain calendar `Date` objects for the dragged bar's new start/end, with no awareness of the project's working-day calendar (weekends/holidays) that the backend's CPM engine uses to compute `end_date` from `duration_days`.

**Decision**: `components/gantt/GanttChart.tsx` (1) gives milestone tasks a synthetic 1-day-wide visual bar (rendering `start_date` as both start and visual end) purely for display, tagged with a `gantt-milestone` CSS class (`gantt-overrides.css`) that recolors it gold rather than the default blue/red — the real `end_date`/`duration_days` sent to the backend are untouched; (2) on a drag-and-drop date change, computes the inclusive calendar-day span between the dragged bar's new start and end and sends that as `duration_days` alongside the new `start_date` via `PATCH /tasks/{id}` (for a milestone, only `start_date` is sent, `duration_days` stays `0` per ADR-012). Because the drag interaction has no visibility into the project's working calendar, this is a calendar-day count, not a working-day count — if the dragged span crosses a weekend/holiday, the backend's recomputed `end_date` (which walks working days per ADR-012) can land slightly later than the bar the user visually dragged to. The Gantt refetches server truth (`GET /projects/{id}/gantt`) immediately after the mutation settles, so the chart snaps to the authoritative computation on the next render rather than silently drifting.

**Alternatives considered**: Upgrading to a newer `frappe-gantt` major version with built-in milestone/readonly support (rejected — the brief pins the library choice via ADR-008 without specifying a version, and 0.6.1 was the version that installed cleanly; revisiting the version is a reasonable BACKLOG item, not a phase-7 blocker); reimplementing the project's working-calendar logic in the frontend to convert a dragged calendar span into an exact working-day count before sending it (rejected — that logic already exists once, correctly, in the backend's `services/working_calendar.py`; duplicating it client-side risks the two falling out of sync, and the backend is the authoritative recompute per the brief's own "don't recompute CPM client-side" instruction).

**Consequences**: Documented as a known approximation, not a bug — flagged in `docs/BACKLOG.md`. Dragging a task across a weekend/holiday may require a follow-up nudge if the resulting `end_date` isn't exactly what was visually intended; the task form's explicit `duration_days` field is the precise way to set it.

---

## ADR-022: `sass` added as a frontend devDependency to build `frappe-gantt`'s bundled stylesheet

**Context**: `frappe-gantt`'s package `main` entry (`src/index.js`) imports its own `gantt.scss` alongside the `Gantt` class export, so importing the bare `frappe-gantt` specifier (as ADR-008's wrapper component does) pulls that Sass file into Vite's build graph. Vite has no built-in Sass compiler; without one, both `vite build` and `vite dev` fail on that import with "Preprocessor dependency not found."

**Decision**: Add `sass` (Dart Sass) to `frontend/package.json` `devDependencies`. This is a build-time CSS preprocessor, not an application library (no runtime code from it ships in the bundle, and no application code imports `sass` directly) — it exists solely so Vite can compile a third-party dependency's own stylesheet, so it isn't treated as one of the "major libraries" the brief asks to avoid adding without justification, but is documented here per that same instruction's spirit ("if you truly need something not listed... just note it briefly").

**Alternatives considered**: Importing only `frappe-gantt/dist/frappe-gantt.css` (the pre-compiled stylesheet) while importing the JS from a path that avoids the `.scss` import (rejected — `frappe-gantt`'s only real ES module export of the `Gantt` class lives behind the `src/index.js` entry that itself imports the `.scss`; the `dist/frappe-gantt.js` bundle is an IIFE assigning to a global `var Gantt` with no `export default`, which does not interop as an ES module import); vendoring a hand-copied, pre-compiled copy of the CSS into the repo instead of installing `sass` (rejected — silently drifts from the installed `frappe-gantt` version's actual styles).

**Consequences**: One additional devDependency, isolated to the frontend build toolchain. `frappe-gantt`'s own `.scss` emits harmless Sass deprecation warnings (`darken()`/global built-ins, from the upstream library's own code, not ours) during `npm run build`/`npm run dev` — cosmetic only, build output is unaffected.

---

## ADR-023: No `GET /users/me` endpoint — the frontend decodes the access token's `sub` claim instead

**Context**: After `POST /auth/login` (which returns only a `TokenPair`, no user object — unlike `POST /auth/register`, which returns `{organization, user, tokens}`), the SPA needs the caller's own `UserRead` to populate the auth store (name, role, for role-gated UI) and has no dedicated "get my profile" endpoint to call — the live OpenAPI schema confirms the only user-read routes are `GET /users` (list) and `GET /users/{id}`.

**Decision**: `frontend/src/lib/jwt.ts` adds a minimal, unverified base64/JSON decoder for the access token's payload (it never checks the signature — the backend is the only party that needs to trust the token; the frontend only reads the `sub` claim for its own UX). `hooks/useAuth.ts`'s `useLogin` decodes the fresh access token immediately after `POST /auth/login`, reads `sub` (confirmed to be the user's UUID by reading `backend/src/app/core/security.py`'s `create_access_token`), and calls `GET /users/{sub}` to fetch the full profile before populating the auth store.

**Alternatives considered**: Adding a `GET /users/me` endpoint to the backend (rejected — the brief for this phase is frontend-only and explicitly says not to touch `backend/`); storing only the email/password the user typed and re-deriving nothing (rejected — the app needs the user's `role` immediately after login to decide what UI to show, and re-fetching `GET /users` and filtering by email client-side would leak every other org member's data into that request for no reason when the token already names the exact id).

**Consequences**: If the backend ever changes what the access token's `sub` claim contains, this decoder breaks silently until someone reads the mismatch in an error — worth a shared contract test across frontend/backend in a future hardening pass (see `docs/BACKLOG.md`).

---

## ADR-024: Task assignee pickers list project members only, not the whole organization

**Context**: `TaskCreate`/`TaskUpdate`'s `assignees` field takes `{user_id, allocation_percent}[]`, and the backend validates only that each `user_id` is a user in the caller's organization (docs/api-conventions.md) — it does not require the assignee to already be a project member.

**Decision**: `pages/tasks/TaskFormModal.tsx` populates its assignee checklist from `GET /projects/{id}/members` (the same list shown in the Members tab), not from `GET /users` (the whole org). This matches how project-based tools conventionally work (you assign work to people already on the project) and keeps the picker short and relevant instead of listing every organization user regardless of project relevance.

**Alternatives considered**: Listing all organization users in the assignee picker (rejected — technically accepted by the backend, but a poor UX default that would let a task be assigned to someone with no other connection to the project, and would make the picker unusably long in larger organizations); auto-adding an assignee as a project member when they're assigned to a task (rejected — silently mutates project membership as a side effect of a task edit, which is surprising and not requested by the spec).

**Consequences**: To assign someone to a task, they must first be added as a project member (Members tab, admin-only) — a deliberate two-step flow that keeps "who can see/work this project" and "who is this specific task assigned to" as separate, explicit actions.

---

## ADR-025: `pages/settings/` added for organization user management

**Context**: Section 3's folder tree lists `pages/{auth,projects,tasks,reports,dashboard}` without a `settings` subfolder, but section 9 phase 7 and item 11 of this phase's brief ("User management (admin, could live under a settings page)") explicitly anticipate a home for org-wide user administration (list/invite/edit role, `cost_per_hour`, `full_name`) that doesn't belong inside any single project's routes.

**Decision**: Add `frontend/src/pages/settings/UsersSettingsPage.tsx`, routed at `/settings/users` and linked from the sidebar only for `admin` users (`components/common/AppLayout.tsx`), covering `GET /users`, `POST /users/invite`, and `PATCH /users/{id}`.

**Alternatives considered**: Cramming user management into `pages/dashboard/` or `pages/projects/` to avoid adding a new top-level pages subfolder (rejected — org user administration is neither a project-scoped nor a dashboard concern; forcing it into either existing folder would be a worse fit than the one extra, clearly-named subfolder the brief itself suggested).

**Consequences**: None beyond one additional `pages/` subfolder alongside the five the spec names; no route, model, or API changes result from it.

---

## ADR-026: `backend/pyproject.toml` migrated to PEP 621 (`[project]`) — the legacy Poetry-only format broke Vercel's build

**Context**: Discovered live during the actual Vercel deployment (not in local dev, where the build never goes through Vercel's Python toolchain). Vercel's Python builder now installs dependencies with `uv`, and prioritizes `pyproject.toml` over `requirements.txt` when both are present. `uv lock` requires a standard PEP 621 `[project]` table (`name`, `dependencies`, etc.); the original `pyproject.toml` only had `[tool.poetry.dependencies]` (the pre-2.0 Poetry-only format), which has no `[project]` table at all. The build failed immediately with `error: No `project` table found in: /vercel/path0/backend/pyproject.toml`, before ever reaching `requirements.txt`.

**Decision**: Rewrite `backend/pyproject.toml` to declare runtime dependencies under `[project.dependencies]` (PEP 621, exact-pinned versions matching `requirements.txt`), keeping `[tool.poetry]` only for what's specific to Poetry (`packages = [...]`) and `[tool.poetry.group.dev.dependencies]` for dev-only tools — both of which Poetry 2.x (the current release line) reads alongside a PEP 621 `[project]` table without conflict, and which `uv`/Vercel simply ignore.

A second, related failure surfaced on the next deploy attempt after this fix: `[project]` initially included `readme = "README.md"`, but that path is resolved relative to `backend/` (the package root), and the actual `README.md` lives at the repo root, one level up — `uv sync`'s build-wheel step (which uses `poetry-core` as the PEP 517 backend) failed with `FileNotFoundError: Readme path .../backend/README.md does not exist`. Fixed by simply dropping the optional `readme` field rather than duplicating the root README into `backend/`.

Both fixes were verified by installing `uv` locally and reproducing Vercel's *exact* failing commands against a scratch virtualenv: `uv lock --python ...` (the first failure) and `uv sync --active --no-dev --link-mode hardlink --frozen --no-editable` (the second, which actually builds the wheel — the first round of verification only ran `uv pip install`, which doesn't build a wheel for the local project and so didn't catch the readme issue). Both now complete cleanly, installing all 36 runtime packages plus the local package itself at the same pinned versions already validated in `requirements.txt`.

**Alternatives considered**: Deleting `backend/pyproject.toml` from the repo so Vercel falls back to `requirements.txt` (rejected — loses the single file that also carries `ruff`/`black`/`mypy`/`pytest` tool config for local dev and CI, and contradicts ADR-001's reasoning for keeping it as the canonical declaration); keeping dependencies only in `[tool.poetry.dependencies]` and adding an empty/stub `[project]` table (rejected — `uv lock` needs the real dependency list in `[project.dependencies]` to resolve correctly, a stub table would just move the failure to "no dependencies installed"); copying `README.md` into `backend/` to satisfy the `readme` field (rejected — `readme` is optional PEP 621 metadata with no functional effect on the deploy, not worth a duplicated file that could drift from the real one).

**Consequences**: `requirements.txt`/`requirements-dev.txt` must now be kept in sync with *two* sections of `pyproject.toml` (`[project.dependencies]` and `[tool.poetry.group.dev.dependencies]`) instead of one — noted as an amendment to ADR-001. `uv.lock` (generated locally during verification) is committed alongside, matching the standard practice of committing lockfiles for reproducible builds; Vercel/uv will use it directly rather than re-resolving on every build. Lesson noted for future verification of build-tool changes: reproduce the *exact* command that failed, not just an approximation of it — `uv pip install` and `uv sync` exercise different code paths for a local, buildable package.

---

## ADR-027: "Projected progress" endpoint exposes baseline % complete at an arbitrary status date, per task and for the project

**Context**: Requested as a new feature: pick any date (typically future) and see what % complete each task — and the project overall — *should* be at that date according to the saved baseline, MS Project's "Status Date + baseline" combination. `services/evm.py`'s PV computation (ADR-013) already prorates each baselined task's `planned_cost` linearly between `planned_start_date`/`planned_end_date` for an arbitrary `status_date` parameter — it was never hardcoded to "today," only the orchestration layer (`progress_service.get_current_progress`) fixes it there. `services/scurve.py` already reuses that same mechanism for *future* weekly checkpoints. What was missing was exposing that same time-elapsed fraction as a **percentage per task** (not just an aggregate dollar figure) and a route that accepts `status_date` as a request parameter.

This is explicitly **not** the "what-if scenario planning" listed as out of scope in `docs/BACKLOG.md` — nothing about the baseline or schedule is simulated or mutated; this only evaluates the existing linear-prorating formula at a point in time other than today.

**Decision**:
- `services/evm.py`: extracted the date-only fraction (`_prorated_fraction`, 0.0–1.0, same before-start/after-end clamping as before) out of `_prorated_planned_value`, which now just multiplies that fraction by `planned_cost` — behavior-identical, so `compute_pv`/`compute_evm` are unaffected. Two new pure functions reuse the fraction: `planned_percent_complete_by_task` (per task, `{task_id: 0-100}`, cost-independent so it's still defined when `planned_cost == 0`) and `planned_percent_complete_project` (cost-weighted aggregate, `None` when there's no baseline or its total planned cost is `0` — same "not applicable" convention `spi`/`cpi` already use).
- `services/progress_service.get_projected_progress(db, project, status_date)`: new orchestration function, same "always live, never persisted" pattern as `get_current_progress` (ADR-013) — no new snapshot table, no caching. The project's *actual* (non-projected) % complete reuses the same cost-weighted formula as `dashboard_service._overall_percent_complete` (`EV / total budgeted cost`), computed locally in `progress_service.py` rather than importing a private symbol from another service module.
- New route `GET /projects/{project_id}/progress/projected?status_date=YYYY-MM-DD` (required query param) on the existing `progress` router — a new route, not a change to `GET /projects/{id}/progress`'s existing contract (which ADR-013 documents as always "today").
- Frontend: a dedicated "Forecast" tab on the project detail page (not folded into the existing Baselines tab), showing the date picker, a planned-vs-actual KPI pair, and a per-task table.

**Alternatives considered**: Adding an optional `status_date` query param to the existing `GET /projects/{id}/progress` instead of a new route (rejected — would blur that endpoint's documented "always live, always today" contract from ADR-013 and complicate its response shape, which is EVM-metrics-shaped, not task-list-shaped); computing the per-task percentages in the frontend from already-fetched baseline/task data (rejected — the cost-weighted project aggregate must match `compute_pv`'s weighting exactly, and keeping that arithmetic in one place, the backend, avoids a second implementation drifting from ADR-013's model); folding this into the Baselines tab UI (considered, but the user preferred a dedicated tab for visibility).

**Consequences**: A project with no saved baseline gets `project_planned_percent_complete: null` and every task's `planned_percent_complete: 0` (baseline is empty, mirroring PV's existing "no baseline → 0" behavior) rather than an error — the frontend must handle this as a real, common state (a "save a baseline first" prompt), not a failure. `actual_percent_complete` in the response is always *today's* live value regardless of which `status_date` was requested — there is still no `percent_complete` history table (ADR-013), so a past `status_date` cannot show what the actual % complete *was* at that date, only what it is now; this is surfaced clearly in the UI copy to avoid misreading it as historical.

---

## ADR-028: `task_progress_snapshots` — a real daily history of each task's `percent_complete`, feeding the Forecast tab's "% Real" chart

**Context**: The Forecast tab (ADR-027) needed a line chart with two curves — "% Planned" and "% Real" — over a user-chosen date range and interval (weekly/biweekly/monthly). "% Planned" was already solvable (it's schedule-derived, fully known in advance — reuses `planned_percent_complete_project`). "% Real" was not: ADR-013 established that EV — and therefore any "actual % complete" — is always computed from each task's *current* `percent_complete`, with no history table, so every historical point would collapse to the same flat value. `docs/BACKLOG.md` had already flagged this exact gap and even suggested the shape of the fix: a `task_progress_history(task_id, as_of_date, percent_complete)` table.

**Decision**: Added `task_progress_snapshots` (`task_id`, `project_id` — denormalized, same convenience as `progress_snapshots` — `snapshot_date`, `percent_complete`, unique on `(task_id, snapshot_date)`), written by the *same* trigger that already writes `progress_snapshots`: `progress_service.recalculate_and_store`, called both by the daily Vercel Cron (`POST /progress/recalculate-all`) and the manual "Recalculate now" button. One row per task per day; re-running the same day overwrites it, identical semantics to the existing project-level snapshot.

`progress_service.get_percent_complete_history(db, project, start_date, end_date, interval_days)` builds the series: steps checkpoints from `start_date` to `end_date` every `interval_days` (plus the exact `end_date` if it doesn't land on the grid — same pattern as `services/scurve.py:build_weekly_scurve`, generalized to a caller-chosen step instead of a fixed week). Per checkpoint, "planned" is `planned_percent_complete_project` unchanged; "actual" is `None` for any checkpoint after today (nothing to show yet — confirmed with the user this should visually cut the line, not flatten it), and otherwise reconstructed by looking up, per task, the most recent snapshot at-or-before the checkpoint (`services/evm.py:percent_complete_at_or_before`, pure and unit-tested without a DB) and cost-weighting the results exactly like `compute_ev`/`_overall_percent_complete` already do elsewhere. A task with no snapshot that far back is excluded from that checkpoint's aggregate (not defaulted to 0 or to today's value) — if *no* task has one yet, the whole point is `None`.

New route `GET /projects/{project_id}/progress/history?start_date=...&end_date=...&interval_days=1..90`, separate from `GET .../progress/projected` (ADR-027) — the two answer different questions (a single point-in-time projection vs. a series over a range) and share no response shape.

**Alternatives considered**: Recording a snapshot on every `percent_complete` edit instead of (or in addition to) the daily cron (rejected for v1, per the user's own call — more precise, since several same-day edits would each be captured, but that precision is invisible in a weekly/biweekly/monthly chart, so it's cost without a visible benefit yet); defaulting a task with no snapshot to its current `percent_complete` instead of excluding it from that checkpoint (rejected — would silently blend "actually known at that time" with "what it is now," undermining the whole point of building real history); updating `services/scurve.py`'s dollar-denominated S-curve (Overview tab) to also read from this new table (out of scope here — not asked for; noted as a natural follow-up in `docs/BACKLOG.md` now that the data exists).

**Consequences**: History only accumulates from the day this shipped forward — there is no way to backfill what a task's `percent_complete` was before this table existed, so early on (and for any checkpoint older than a project's oldest snapshot) the "% Real" curve will show gaps, not a fabricated retroactive trend; the Forecast tab's UI copy says this explicitly. The cron (`maxDuration: 10` in `backend/vercel.json`) now does one extra upsert per task per active project every day, on top of the existing per-project snapshot — same scaling ceiling already noted in `docs/BACKLOG.md` for `recalculate_all_active`, now a little tighter; not acted on in this change, the MVP's expected volume doesn't warrant it yet. Deploying this requires running the new Alembic migration against Neon manually (`alembic upgrade head`) — a `git push` alone does not apply it.
