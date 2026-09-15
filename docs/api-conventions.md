# API Conventions

Base path: `/api/v1`. Full interactive docs at `/docs` (FastAPI's default Swagger UI, served at the app root regardless of the `/api/v1` router prefix — per spec section 4.1 point 25) both locally and on the deployed Vercel URL — this is the canonical source of truth for exact request/response shapes. This document covers the conventions that apply across all of it.

## Authentication

`Authorization: Bearer <access_token>`. Access tokens expire after 30 minutes (`ACCESS_TOKEN_EXPIRE_MINUTES`); call `POST /auth/refresh` with the refresh token to get a new pair (the refresh token itself rotates — the old one is revoked the moment a new one is issued, so store only the latest pair).

## Pagination

Every list endpoint accepts `limit` (default 20, max 100) and `offset` (default 0) query parameters and returns:

```json
{
  "items": [...],
  "total": 137,
  "limit": 20,
  "offset": 0
}
```

## Errors

Uniform envelope on every non-2xx response:

```json
{ "detail": "A human-readable message", "code": "machine_readable_code" }
```

Common `code` values: `not_found`, `conflict`, `validation_error`, `unauthorized`, `forbidden`, `account_locked`, `email_taken`, `internal_error`.

## Roles

Two roles, `admin` and `member` (see section 8 of the spec for the full permission matrix). Endpoints that require `admin` return `403 forbidden` for a `member` caller, not a `404` — resource existence is not hidden behind permissions in v1.

## Multi-tenancy

Every request is implicitly scoped to the organization embedded in the caller's access token; there is no way to pass a different `organization_id` and no cross-organization visibility. IDs from a different organization behave exactly like a nonexistent ID (`404 not_found`, not `403`) to avoid confirming another org's data exists.

## Endpoints implemented so far

**Phase 1 — auth, organizations, users**
```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

GET    /api/v1/organizations/me

GET    /api/v1/users
GET    /api/v1/users/{id}
PATCH  /api/v1/users/{id}
POST   /api/v1/users/invite

GET    /api/v1/health
```

`GET /organizations/me` is not in the spec's section 7 endpoint list; it exists only because section 3 requires `organizations.py` to be a real, non-empty endpoint module — see ADR-012. There is no organization create/update/delete endpoint: an organization is created only as a side effect of `POST /auth/register`.

`POST /users/invite` does not send an email in v1 (no mail provider is configured) — it creates the user directly with the password supplied in the request. See `docs/BACKLOG.md`, module J, for the real invitation-by-email flow.

**Phase 2 — projects, tasks/WBS, dependencies**
```
GET    /api/v1/projects
POST   /api/v1/projects                        (admin only)
GET    /api/v1/projects/{id}
PATCH  /api/v1/projects/{id}                   (admin only)
DELETE /api/v1/projects/{id}                   (admin only)
GET    /api/v1/projects/{id}/members
POST   /api/v1/projects/{id}/members           (admin only)
DELETE /api/v1/projects/{id}/members/{user_id} (admin only)

GET    /api/v1/projects/{id}/tasks             (?status= filter)
POST   /api/v1/projects/{id}/tasks
GET    /api/v1/tasks/{id}
PATCH  /api/v1/tasks/{id}
DELETE /api/v1/tasks/{id}
GET    /api/v1/projects/{id}/gantt

POST   /api/v1/tasks/{id}/dependencies
DELETE /api/v1/dependencies/{id}
```

**Phase 3 — CPM engine + cascade rescheduling** (no new routes; existing ones now trigger the engine)
- Creating/editing a task (when `start_date`/`duration_days`/`is_milestone` changes), creating a dependency, or deleting a task/dependency all synchronously recompute `early_start`/`early_finish`/`late_start`/`late_finish`/`total_float`/`is_critical` for every task in the project (`services/critical_path.py`), and — for a task whose own dates just changed — cascade that change forward into any successor that would otherwise violate its dependency constraint (`services/scheduler.py`), recursively. See ADR-016 for the exact `FS`/`SS`/`FF`/`SF` constraint formulas (taken literally from spec section 6.1, including that `FS` with `lag_days = 0` permits a same-day start).
- `GET /projects/{id}/gantt` returns every task (with CPM fields and assignees) and every dependency of the project in one unpaginated payload — the "list/Kanban/calendar" alternate views (section 4.1 point 15) are pure frontend presentations over this same data (and over `GET /projects/{id}/tasks`), not separate endpoints.

Notes on things that aren't a literal transcription of section 7:
- **Holidays** (`project_holidays` table) have no dedicated endpoint — they're managed as a `holidays: string[]` (ISO dates) field on `POST /projects` and `PATCH /projects/{id}` (full replace when the field is provided on PATCH). See ADR-015.
- **Task assignees** have no dedicated endpoint either — `assignees: [{user_id, allocation_percent}]` is part of the `POST /projects/{id}/tasks` and `PATCH /tasks/{id}` payloads (full replace on PATCH when the field is provided). Every assignee must already be a user in the caller's organization, or the request is rejected with `422 validation_error`.
- **Task scheduling**: a task is created/edited with `start_date` + `duration_days` (whole working days); `end_date` is always server-computed from the project's working calendar — it is never accepted as input. See ADR-015.
- **`member` project visibility**: `GET /projects` returns only projects a `member` belongs to (admins see the whole org's projects); `GET /projects/{id}` and everything nested under it (`tasks`, `dependencies`, `members`) returns `404` for a project a `member` doesn't belong to, identically to a project that doesn't exist.
- **Dependency validation**: `successor_id` must be a different task in the same project as the predecessor, and the new edge must not create a cycle (DFS check, section 5) — both violations return `422` (`dependency_cycle` for the cycle case). A duplicate `(predecessor_id, successor_id)` pair returns `409 dependency_exists`.

This section grows with each phase; see `docs/DECISIONS.md` for the reasoning behind anything that isn't a literal transcription of spec section 7.
