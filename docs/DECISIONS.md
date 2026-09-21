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

---

## ADR-029: Frontend i18n via `react-i18next`; per-user `language`/`date_format` preferences persisted on the backend

**Context**: The user asked for a "Settings" menu on the sidebar to (1) switch the entire interface between Spanish and English (Spanish by default) and (2) switch every displayed date to dd/mm/yyyy — and explicitly chose, when asked, the highest-scope option at every decision point: full translation (not partial), the preference stored on the user's backend profile (not just the browser), the date format applied app-wide, and Spanish as the default language. At the time, the entire UI was English-only, hardcoded string-by-string across every page/component (roughly 44 `.tsx` files), and every displayed date was the raw ISO string from the API, unformatted.

**Decision**:
- **Translation library**: `react-i18next` + `i18next` only (no `i18next-http-backend`, no `i18next-browser-languagedetector` — with only 2 languages and the preference coming from the backend rather than browser autodetection, neither is needed). Justified by scale (hundreds of strings, several already using interpolation, e.g. `` `Delete "${name}" (${wbs_code})?` ``) — reinventing interpolation/pluralization/fallback here would be the kind of unjustified custom work the Kanban board's native-HTML5-DnD choice (rejecting a DnD library) explicitly avoided in the *other* direction: there, the need was trivial and a library was overkill; here, the need is large and a mature library is the right tool.
- **Dictionaries**: `frontend/src/i18n/en.ts` / `es.ts`, one plain object per language keyed by area (`common`, `enums`, `nav`, `auth`, `dashboard`, `projects`, `tasks`, `kanban`, `gantt`, `calendar`, `baselines`, `forecast`, `worklogs`, `members`, `reports`, `settings`, `usersSettings`, `worklogsReport`). `common`/`enums` hold everything reused across pages (Save/Cancel/Delete/Loading…, and every enum value's label) so no shared string was translated twice under diverging keys — confirmed necessary by finding the same `status.replace("_", " ")` pattern duplicated in `Badge.tsx`, `StatusDropdownBadge.tsx`, and `ProjectTasksTab.tsx` before the sweep. `es.ts` is typed as `typeof en` (both non-`const`, so TS widens values to `string` and only the *key shape* is checked) — a missing or extra key in either dictionary is a compile error, not a silent runtime fallback.
- **Sweep order**: leaf/shared components first (`Badge.tsx`, `StatusDropdownBadge.tsx`, `DataTable.tsx`, `ConfirmDialog.tsx`, `Modal.tsx`, etc.), then pages that consume them — never the reverse, to avoid a page inventing a translation key that a shared component already owns. Module-level arrays that held hardcoded label strings (`ProjectForecastTab.tsx`'s `INTERVAL_OPTIONS`, `ProjectCalendarTab.tsx`'s `WEEKDAY_LABELS`, `ProjectDetailPage.tsx`'s `TABS`) moved inside their component so they can call `t()`.
- **Date formatting**: `frontend/src/lib/dateFormat.ts` (`formatDate(iso, "iso" | "dmy")`, a ~10-line pure function — no date library, since only two known formats from a known ISO input were ever asked for) plus `frontend/src/hooks/useDateFormat.ts`, which reads `user?.date_format ?? "dmy"` and returns an already-curried formatter so call-sites just wrap a raw date instead of threading the preference through props.
- **Backend persistence**: new `Language`/`DateFormat` enums (`backend/src/app/core/enums.py`, registered in `database.py`'s `type_annotation_map` via the existing `_pg_enum` helper so Postgres enum labels stay lowercase, matching every other enum in this codebase), two new columns on `users` (migration `57150607d189`, on top of `3342ac5b8bc9` — the existing migration chain, never edited in place, since this app is already live on Neon), and `PATCH /users/{id}`'s non-admin self-edit whitelist (`SELF_EDITABLE_FIELDS`, previously just `{"full_name"}`) extended to include `language`/`date_format` — personal preferences, not organization-administrative data like `role`/`cost_per_hour`/`is_active`, which stay admin-only.
- **New page**: `frontend/src/pages/settings/PreferencesSettingsPage.tsx` at `/settings/preferences`, reachable from a new sidebar item visible to *every* user (unlike "Users," which stays admin-only) — saves via the already-existing `useUpdateUser()` mutation, then updates `authStore` and calls `i18n.changeLanguage(...)` so the UI reacts immediately without a reload.

**Alternatives considered**: A custom `Context`+dictionary i18n system instead of a library (rejected — the volume here, hundreds of strings including interpolation, is exactly what a mature library is for); storing the preference only in `localStorage`/Zustand `persist` instead of the backend (rejected — the user explicitly chose backend persistence so the preference follows them across devices/sessions); a single combined "locale" setting instead of two independent ones (rejected — the user asked for language and date format as separate, independently-changeable choices, and nothing ties them together at the data level).

**Consequences**: Sessions logged in before this shipped have a `user` object cached in `localStorage["pmp-auth"]` without `language`/`date_format` (those fields didn't exist yet) — every read site (`AppLayout`'s language-sync effect, `useDateFormat()`) falls back to `"es"`/`"dmy"` explicitly rather than assuming the fields are present; no Zustand `persist` migrator was needed since the next login/profile fetch naturally repopulates them from the backend's column defaults. Backend-originated error text (`ForbiddenError`/`ConflictError`/Pydantic validation messages, e.g. "A user with this email already exists") is **not** translated — internationalizing those would mean touching every backend exception site, which wasn't asked for and is out of scope; the static interface (labels, buttons, headers, navigation, frontend-authored messages) is 100% translated, but raw API error strings stay in English regardless of the selected language. This is a known, deliberate gap, not an oversight — noted in `docs/BACKLOG.md`. Coverage was verified by `grep`-sweeping for leftover capitalized JSX text and attribute strings after each phase, plus `i18next`'s `saveMissing`/`missingKeyHandler` (dev-only) logging any requested key that isn't in either dictionary — full runtime coverage across every possible conditional/dynamic string branch cannot be guaranteed by static analysis alone, so any stragglers found later should be treated as bugs to fix, not a sign the approach was wrong.

## ADR-030: WBS parent tasks are automatic roll-ups, excluded from the CPM graph; reparenting is a dedicated `POST /tasks/{id}/move`

**Context**: The user asked for three related changes to task hierarchy: (1) a task that gains children should have its schedule/cost/progress derived from them automatically, with no explicit manual/automatic toggle; (2) an editable "end date" that derives `duration_days` (today only the reverse direction — start + duration → end — exists); (3) editing a task's start/end dates inline in the Tasks table, and reassigning a task's parent from that same table via drag-and-drop, "like Jira Cloud." None of this existed even partially — `Task` had no notion of a parent-derived field, `TaskUpdate` had no `end_date`, and there was no reparenting endpoint at all.

**Decision**:
- **Roll-up engine**: `backend/src/app/services/rollup.py`, pure and DB-free (same mold as `critical_path.py`/`working_calendar.py`): `compute_rollup(children, calendar)` returns `start_date=min`, `end_date=max`, `duration_days=calendar.working_days_between(start, end)` (that function already existed but had zero production callers until now), `budgeted_cost=sum`, and a cost-weighted `percent_complete` (`EV / total budgeted cost`, the same criterion as `dashboard_service._overall_percent_complete`, `0` when total cost is `0` rather than dividing by zero). `propagate_rollup_to_ancestors` walks up via `parent_task_id`, recomputing each ancestor from its *current* direct children (`task_repository.list_children`, a fresh query — never the ORM `.children` relationship, which would risk `MissingGreenlet` on an unloaded collection and sits under a `cascade="all, delete-orphan"` we don't want to accidentally touch), stopping as soon as an ancestor has no children left or the tree root is reached. `task_service.create_task`/`update_task`/`delete_task` all call it: on create/delete when the task has (or had) a parent, on update whenever the task's `parent_task_id` is not `None` — regardless of *which* field changed, since cost and percent-complete edits must bubble up just as much as date edits.
- **Read-only fields on a parent**: `update_task` now loads the task's children first; if any exist and the payload touches `start_date`, `end_date`, `duration_days`, `budgeted_cost` or `percent_complete`, it raises `ValidationAppError(code="parent_task_readonly_fields")` before touching anything — those five fields are only ever set by the roll-up once a task has children. Every other field (name, description, status, priority, assignees, `is_milestone`, `estimated_hours`) stays directly editable.
- **CPM exclusion**: `schedule_service.recalculate_schedule` now computes `parent_ids` (every `task.parent_task_id` seen in the project) and excludes them from the `TaskScheduleInput` list fed to `compute_critical_path`, then explicitly nulls their `early_start`/`early_finish`/`late_start`/`late_finish`/`total_float` and sets `is_critical=False` — otherwise they'd keep stale values from before they had children. No change was needed in `critical_path.py` itself: it already ignores gracefully any dependency edge referencing a node absent from its input set, which is exactly what an excluded parent looks like. **Accepted risk, not fixed here**: a task that already has its own predecessor/successor dependencies *before* becoming a parent keeps those dependency rows, but once it's a parent its dates come from roll-up, not from the CPM cascade — so its dependencies stop driving anything. This is flagged in `docs/BACKLOG.md` rather than guarded against in code, since preventing it (e.g. blocking dependencies on parent tasks, or migrating them to the children) wasn't asked for and adds real complexity for an edge case the user hasn't hit.
- **`end_date` → `duration_days`**: `TaskUpdate.end_date` (new, `TaskCreate` untouched — not asked for at creation time). In `update_task`, `end_date` is popped out of `fields` unconditionally — it is *never* persisted as given. If `duration_days` wasn't also provided in the same payload, `duration_days` is derived via `calendar.working_days_between(start, end_date)` (rejecting `end_date < start_date` and a calendar-day span over `MAX_WORKING_DAYS`, the same resource-exhaustion guard `duration_days`/`lag_days` already use), and then the existing recompute path re-expands it via `calendar.add_working_days(...)` so the persisted `end_date` always lands on a real working day. If both `end_date` and `duration_days` are sent together, `duration_days` wins — unchanged behavior, `end_date` is just ignored in that case.
- **Reparenting — dedicated endpoint, not a `PATCH` field**: `POST /tasks/{task_id}/move` (`TaskMove{parent_task_id, position}`), following the precedent set by `POST /tasks/{id}/dependencies` (`dependency_service.py`) for actions with effects too complex for a scalar-field `PATCH`. `task_service.move_task` loads every task in the project once, rejects a task becoming its own parent or an ancestor's ancestor becoming its own descendant (a cycle check that walks up from the new parent via `parent_task_id` looking for the moved task's own id — same DFS spirit as `dependency_service._would_create_cycle`, but O(depth) over the WBS tree instead of O(subtree) over the dependency graph), then renumbers both the old and new sibling groups and recursively cascades the new prefix to every descendant of any renumbered task (`_apply_wbs_code`), reusing `int(wbs_code.rsplit(".", 1)[-1])` as the sibling sort/renumbering key rather than sorting `wbs_code` as a string — `task_repository.list_by_project`/`list_all_by_project`'s existing `ORDER BY wbs_code` is lexicographically wrong past 10 siblings (`"10" < "2"` as strings); this bug is pre-existing and not fixed at the query level here, only avoided in the new code that actually depends on numeric order.
- **Frontend**: `end_date` editable in `TaskFormModal` alongside `duration_days` (whichever the user touched last is the only one sent); inline date editing in the Tasks table (click-to-open a native date input, same one-field-immediate-commit pattern as `StatusDropdownBadge`), disabled on any task with children; a new `TaskTreeTable.tsx` renders the hierarchy with per-row indentation and drives `POST /tasks/{id}/move` via `@dnd-kit/core` (not `@dnd-kit/sortable` — its flat-list model has no third "nest as child" outcome, so the three drop zones per row are hand-rolled with `DndContext`/`useDraggable`/`useDroppable`). Library-over-hand-rolled is justified here the same way `react-i18next` was in ADR-029 (genuine complexity: 3 drop zones, self-descendant drop prevention), unlike the Kanban board (ADR-019), where 4 fixed columns made native HTML5 DnD enough.

**Alternatives considered**: An explicit manual/automatic mode per task, MS-Project style (rejected — the user asked for the simple automatic-only behavior when offered the choice); reassigning a parent via a form field or a dropdown column in the table (rejected — the user explicitly asked for drag-and-drop instead, after being offered both); extending the generic `PATCH /tasks/{id}` to accept `parent_task_id` (rejected in favor of the dedicated `/move` endpoint, matching the dependency-endpoint precedent, since a reparent has WBS-renumbering and roll-up side effects a scalar-field patch shouldn't carry).

**Consequences**: A parent task's `early_start`/`early_finish`/`late_start`/`late_finish`/`total_float` are `null` and `is_critical` is always `false` in the API response — any frontend rendering (Gantt bars, critical-path highlighting) needs to treat a task with children as a summary row, not a schedulable one. `docs/BACKLOG.md` now also records the pre-existing `wbs_code` string-ordering bug and the parent-with-its-own-dependencies edge case, both accepted rather than fixed as part of this change.

## ADR-031: Task comments and WBS breadcrumb navigation — reversing BACKLOG.md's "Collaboration" exclusion for plain comments only

**Context**: Shown a Jira task-detail panel (breadcrumb, subtasks, a comment thread) as a reference, the user asked for exactly two things, confirmed via a scoping question: (1) breadcrumb-style navigation between a task and its WBS parent/children, and (2) plain comments on tasks. Attachments, Tempo-style worklog integration, "linked activities," and BigPicture-style plugins were explicitly rejected as out of scope. `docs/BACKLOG.md` section H had listed "Comments and @mentions on tasks/projects" as out of scope for v1 — this decision knowingly reverses that line for task-level plain comments only; @mentions and project-level comments remain out of scope.

**Decision**:
- **Comments**: new `task_comments` table (`backend/src/app/models/task_comment.py`), a field-for-field mirror of `Worklog` (`backend/src/app/models/worklog.py`) as a task-scoped sub-resource with an author — `task_id`, `user_id` (the author, always the caller, never client-supplied), `body: Text`. `GET/POST /tasks/{id}/comments`, `DELETE /comments/{id}` (`backend/src/app/api/v1/endpoints/task_comments.py`) — deliberately **no `PATCH`/edit endpoint**: the user asked to "ingresar comentarios" (post comments), not edit them, and skipping it keeps every layer (repository/service/schema/endpoint) one function smaller. A user who mistypes has to delete and repost; this is accepted as a minor, low-stakes gap (plain text, no @mentions/threading to break) rather than a reason to build editing preemptively — a same-shaped `PATCH` is a low-risk follow-up if it turns out to be needed. Deleting requires being the comment's author or an org admin (`task_comment_service._assert_can_delete`, identical rule to `worklog_service._assert_can_modify`); listing/creating uses the same project-visibility gate as every other task sub-resource (`project_service.get_project_for_user`). Comment body is capped at 5000 characters (`Field(max_length=5000)`) — more than `Worklog.description`'s 2000 (an optional secondary note) since a comment is the primary content of a conversational reply, but less than `Task.description`'s 10 000 (long-form task documentation, not a chat message).
- **Breadcrumb**: no new backend surface — `Task.parent_task_id`/`wbs_code` already exist (ADR-030). `TaskFormModal.tsx` gained a `TaskBreadcrumb` component that walks the ancestor chain upward via `parent_task_id` and lists direct children, both purely client-side over the `allTasks` list every call site already passes in (no new fetch). A new `onNavigate(taskId)` callback prop, wired at all four places `TaskFormModal` is opened (Tasks/Calendar/Kanban/Gantt tabs), lets clicking an ancestor or child swap which task the modal is editing in place, closing the loop without leaving the modal.
- **Placement — extends `TaskFormModal`, not a new separate modal**: unlike `DependencyManager`/the log-hours modal (separate `Modal`s for a distinct *action* on a task), the breadcrumb and comment thread are part of *viewing* a task, matching the Jira reference's single unified panel (breadcrumb top, fields middle, comments bottom) — and `TaskFormModal` is already the app's one "you opened this task" entry point from every task view, so extending it avoids duplicating the `allTasks`/navigation wiring a second modal would need.
- **Nested-modal Escape bug avoided by construction**: `frontend/src/components/common/Modal.tsx` registers its Escape-key handler with a bare `document.addEventListener`, no `stopPropagation` and no depth tracking — nesting a `ConfirmDialog` (itself a `Modal`) inside `TaskFormModal`'s `Modal` to confirm a comment delete would mean Escape fires *both* modals' close handlers (the outer one registered first), silently discarding any unsaved task-field edits along with dismissing the delete confirmation. Comment deletion instead uses an inline, in-row confirmation (no nested `Modal`) rather than reaching for `ConfirmDialog`. The underlying bug in `Modal.tsx` itself is not fixed here — no other feature nests modals today — but is worth revisiting (e.g. `stopImmediatePropagation` plus a shared "topmost modal" registry) the next time a real nested-modal need comes up.

**Alternatives considered**: A separate "task detail" modal opened via its own Actions-column icon button (rejected — the Jira reference is one panel, not a second click-through, and `TaskFormModal` already shows the fields the breadcrumb/comments are contextual to); comment editing via `PATCH` (rejected for now, see above — not asked for); @mentions/notifications alongside comments (rejected — explicitly out of scope per the scoping question); project-level comments in addition to task-level (rejected — not asked for, `docs/BACKLOG.md` still lists it separately from the now-shipped task comments).

**Consequences**: `docs/BACKLOG.md` section H no longer lists plain task comments as excluded (only @mentions and project-level comments remain there). A comment thread has no edit history and no way to fix a typo short of delete-and-repost. `TaskFormModal.tsx` grew a new optional `onNavigate` prop that all four of its call sites now pass.
