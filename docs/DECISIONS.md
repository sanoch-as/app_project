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

## ADR-011: `services/` and `repositories/` contain more files than the five explicitly named in section 3

**Context**: Section 3's folder tree bullets five `services/` files (`auth_service.py`, `critical_path.py`, `scheduler.py`, `evm.py`, `scurve.py`) and gives `repositories/` no bulleted list at all, just the comment "capa de acceso a datos (queries)". Every entity (projects, tasks, dependencies, baselines, worklogs) still needs data-access queries and, in several cases (WBS numbering, dependency-cycle validation before insert, permission checks tied to project membership), real orchestration logic beyond a single-table CRUD call.

**Decision**: `repositories/` gets one module per entity (`project_repository.py`, `task_repository.py`, `dependency_repository.py`, `baseline_repository.py`, `worklog_repository.py`, `progress_repository.py`), matching the existing `organization_repository.py`/`user_repository.py`/`refresh_token_repository.py` pattern already used for auth. `services/` gets additional entity-oriented modules only where there is real multi-step domain logic beyond CRUD (e.g. `project_service.py`, `task_service.py`, `dependency_service.py` for cycle detection + triggering CPM recompute); simple attribute updates (e.g. patching a user's profile) stay as thin endpoint-to-repository calls with no service module, to avoid empty pass-through layers.

**Alternatives considered**: Treating the five bulleted `services/` files as an exhaustive whitelist and cramming cycle-detection/CPM-triggering logic into the endpoint layer instead (rejected — endpoints should stay thin request/response adapters; burying algorithmic logic there hurts testability, and `tests/unit/` needs something importable without spinning up FastAPI).

**Consequences**: None functionally — this only affects internal file layout within directories the spec already designates for exactly this purpose. No top-level folder, model, or API route changes as a result.

---

## ADR-012: `GET /organizations/me` added — a minimal read endpoint not listed in section 7

**Context**: Section 3 requires `api/v1/endpoints/organizations.py` to exist, but section 7's endpoint list has no `/organizations/*` routes at all.

**Decision**: Implement a single `GET /organizations/me` returning the authenticated user's organization (name, slug, timestamps) — used by the frontend header/settings and by nothing else. No organization create/update/delete endpoints are added (organizations are created only as a side effect of `POST /auth/register`, per section 4.1 point 1).

**Alternatives considered**: Leaving `organizations.py` as an empty router (rejected — section 0 rule 2 forbids placeholder code with no real implementation); adding full organization CRUD (rejected — out of scope, v1 has exactly one organization per registration and no mechanism to rename/merge/delete one).

**Consequences**: None beyond the one added route.

---

## ADR-015: Task scheduling convention — start date + duration in, end date computed; WBS codes auto-numbered

**Context**: The `tasks` table (section 5) has `start_date`, `end_date`, and `duration_days` as three separate columns, but the spec does not say which are user input versus derived, nor how `wbs_code` gets assigned. This is exactly the kind of ambiguity section 0 rule 1 asks to resolve with the industry-standard convention.

**Decision**:
- **Scheduling input**: a task is created/edited with `start_date` + `duration_days` (in working days); `end_date` is computed server-side (`services/working_calendar.py`) by walking forward `duration_days - 1` working days from `start_date` (a 1-day task starts and ends the same day), skipping weekends and the project's `project_holidays`. A milestone (`is_milestone = true`) always has `duration_days = 0` and `end_date = start_date`. This matches MS Project's default behavior (the spec's own first named reference point) and keeps `duration_days` — which `services/critical_path.py` needs for `EF = ES + duration_days` — as the authoritative input rather than a value back-derived from two dates that could disagree with it.
- **Working calendar**: `projects.working_days_per_week` (an integer 5/6/7, not a specific weekday mask) is interpreted as "the first N days of a Monday-start week are working days" — i.e. 5 = Mon–Fri, 6 = Mon–Sat, 7 = every day. This is the simplest convention consistent with a single integer column (section 5 defines no weekday-mask column), and covers the overwhelming majority of real working calendars.
- **`wbs_code` numbering**: assigned automatically on task creation, as `"<parent's wbs_code>.<n>"` (or just `"<n>"` at the top level), where `n` is one more than the current number of siblings under the same parent. Codes are not renumbered when a sibling is later deleted (so a gap like "2.1", "2.3" can appear) — renumbering on every delete would silently rewrite other tasks' identifiers, which is more disruptive than a gap; this matches how most real WBS tools behave (manual renumbering is a deliberate action, not an automatic side effect of deletion).

**Alternatives considered**: Accepting `end_date` directly and deriving `duration_days` from the calendar (rejected — makes `duration_days` a derived value the CPM engine can't treat as authoritative input, and doesn't match the "estilo MS Project" framing in section 1); a weekday-mask calendar (rejected — over-engineered relative to the "calendario laboral básico" the spec actually asks for in section 4.1 point 5).

**Consequences**: Changing `working_days_per_week` after tasks exist does not retroactively recompute their `end_date` — only a subsequent edit to that specific task recomputes it. This is acceptable for v1 and not expected to be a common operation.

---

## ADR-016: Dependency constraints follow section 6.1's formula literally — `FS` lag 0 permits a same-day start

**Context**: Section 6.1 gives the CPM forward-pass formula explicitly: "FS: `EF_predecessor + lag`; SS: `ES_predecessor + lag`; etc." Many scheduling tools (MS Project included, in some configurations) treat `FS` with lag 0 as requiring the successor to start the *next* working period after the predecessor finishes, i.e. an implicit "+1". The spec's own formula has no such implicit offset.

**Decision**: Implement the formula exactly as written: for `FS`, `successor.early_start >= predecessor.early_finish + lag_days` (working days), so `lag_days = 0` allows the successor to start on the very same calendar day the predecessor finishes. The same "no implicit offset" reading applies symmetrically to `SS`/`FF`/`SF` (`services/critical_path.py`'s `forward_constraint`/`_backward_constraint`, reused by `services/scheduler.py`'s cascade). `lag_days` is a plain integer count of working days added via `WorkingCalendar.shift_working_days` (skipping weekends/holidays); a negative value is a lead ("adelanto"), pulling the successor earlier and permitting overlap.

**Alternatives considered**: Adding an implicit "+1 working day" for `FS`/`SF` the way some tools do (rejected — not what section 6.1 states, and would silently diverge from a spec that gives an explicit formula rather than leaving this to convention).

**Consequences**: A `FS` dependency with `lag_days = 0` lets predecessor and successor occupy the same calendar day (e.g. a 1-day predecessor finishing Friday and a 1-day `FS` successor also landing on that Friday). A project that wants a mandatory one-day gap should model it as `lag_days = 1`. This is documented behavior, not a rounding quirk — `tests/unit/test_critical_path.py` and `test_scheduler.py` assert it directly.

---

## ADR-014: `bcrypt` pinned to `4.0.1`, not the newest release

**Context**: `passlib` 1.7.4 (the version required by section 2, and the newest one that exists — the project has been unmaintained since 2020) runs a self-test the first time it hashes/verifies a password, to detect a historical "wraparound bug" in some bcrypt builds. That self-test assumes bcrypt silently truncates secrets longer than 72 bytes. Starting with `bcrypt` 4.1, the `bcrypt` package raises `ValueError` on oversized secrets instead of truncating — which makes passlib's own self-test crash with `ValueError: password cannot be longer than 72 bytes`, on every single hash/verify call, independent of the actual password used by this app (none of which are anywhere near 72 bytes). This reproduced identically with `bcrypt` 5.0.0 (the version that installs by default on Python 3.14) and is a known upstream incompatibility, not a bug in this codebase.

**Decision**: Pin `bcrypt==4.0.1` — the last release before that behavior change, confirmed compatible with passlib's self-test, and confirmed to ship a `cp36-abi3` wheel (stable ABI) that installs on Python 3.14 without a source build.

**Alternatives considered**: Dropping `passlib` for direct `bcrypt.hashpw`/`checkpw` calls (rejected — section 2 explicitly requires `passlib[bcrypt]`, and this incompatibility is fully resolved by a version pin without abandoning that library); monkey-patching around passlib's self-test (rejected — fragile, and pinning a known-good dependency version is the more conventional fix for an upstream incompatibility).

**Consequences**: `bcrypt` cannot be bumped past 4.0.x without either dropping passlib or waiting for passlib to release a fix (it has not, as of this writing, in over four years). This is recorded as a known constraint, not a TODO — no functional password-hashing capability is missing.

---

## ADR-013: `docker compose` used only for local Postgres, never for running the app

**Context**: Section 2/12 forbid Docker in production; Vercel builds/runs the app directly.

**Decision**: `docker-compose.yml` at the repo root defines only a `postgres` service. Backend and frontend run via `uvicorn`/`vercel dev` and `npm run dev` respectively, against that container or Neon.

**Consequences**: None beyond what the spec already dictates; noted here only for completeness of the ADR log.
