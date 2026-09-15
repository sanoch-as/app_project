# Architecture

## Overview

Two independently deployed Vercel projects sharing one repo (monorepo):

- **`backend/`** — a FastAPI app exposed as a single Vercel Function (`api/index.py`). All routing under `/api/v1/*` is handled internally by FastAPI's `APIRouter`; Vercel just forwards every request to the one function.
- **`frontend/`** — a Vite-built React SPA, served as a static site by Vercel, talking to the backend over HTTPS via `VITE_API_BASE_URL`.

Database is PostgreSQL 16, managed by Neon (provisioned through the Vercel Marketplace in production; a local `docker compose` Postgres container in development). There is no Redis, no Celery, no persistent worker process anywhere in this system — see "Why no worker process" below.

```
┌─────────────────┐        HTTPS         ┌──────────────────────┐        asyncpg         ┌────────────┐
│  frontend/       │ ───────────────────► │ backend/api/index.py │ ─────────────────────► │  Neon      │
│  (Vercel static) │ ◄─────────────────── │ (Vercel Function,    │ ◄───────────────────── │  Postgres  │
└─────────────────┘                       │  FastAPI ASGI app)   │                         └────────────┘
                                            └──────────┬───────────┘
                                                        │ daily, via Vercel Cron
                                                        ▼
                                            POST /api/v1/progress/recalculate-all
```

## Why no worker process

Vercel Functions are stateless and short-lived (10s `maxDuration` on the Hobby plan). Section 2 of the spec forbids introducing Redis/Celery as a result. Every place a traditional design would reach for a background worker is instead handled one of two ways:

1. **Synchronous, in the same request.** CPM (critical path) recomputation and cascade rescheduling (`services/critical_path.py`, `services/scheduler.py`) run inline whenever a task or dependency is created/edited, before the response is returned. This keeps the Gantt view always consistent with the latest write, at the cost of adding schedule-recompute latency to those specific write endpoints (bounded by project size — see `docs/BACKLOG.md` for the scaling note).
2. **Vercel Cron, once a day.** EVM/S-curve snapshotting (`services/evm.py`, `services/scurve.py`) is too expensive to run on every write (it aggregates the whole project's history), so it runs once daily via a Vercel Cron Job hitting `POST /api/v1/progress/recalculate-all`, plus an on-demand per-project endpoint for a manual "recalculate now" button in the UI.

## Database connection strategy (Neon + PgBouncer + asyncpg)

Neon's pooled connection string routes through PgBouncer in **transaction pooling** mode. Two things follow from that:

- **`NullPool` on the SQLAlchemy engine** (`app/core/database.py`). Every Vercel Function invocation is a fresh process; there's no benefit to an in-process connection pool, and PgBouncer is the actual pool. `NullPool` means SQLAlchemy opens exactly the connections a request needs and closes them immediately after.
- **`statement_cache_size=0`** passed to `asyncpg` via `connect_args`. PgBouncer's transaction pooling mode can hand the *same* server-side connection to different app-level "connections" between transactions, which breaks asyncpg's default behavior of caching prepared statements per connection. Disabling the statement cache avoids `prepared statement "..." does not exist` errors under load.

In local development (`docker-compose.yml`, a single long-lived Postgres container, no PgBouncer in front of it), the exact same engine configuration is used — it is simply unnecessary caution locally, not harmful.

## Import layout: why `api/index.py` manipulates `sys.path` instead of importing `src.app.main`

All application code uses absolute imports rooted at `app.*` (e.g. `from app.core.config import settings`), matching a conventional `src/`-layout project. `backend/api/index.py` (the Vercel entrypoint) inserts `backend/src/` onto `sys.path` and then does `from app.main import app`, rather than `from src.app.main import app`. If it imported through `src.app.*` while the rest of the codebase imports through `app.*`, Python would load two separate copies of every module (`app.core.database` and `src.app.core.database` are different module objects), which for SQLAlchemy means the declarative mapper registry gets configured twice — symptoms range from `sqlalchemy.exc.InvalidRequestError` about a table already being defined to relationships silently pointing at the "wrong" class object. Alembic's `env.py` does the same `sys.path` trick for the same reason.

## Multi-tenancy

Every organization-scoped table carries `organization_id` (directly, or via its parent — `tasks` inherits scope from `projects`). Scoping is enforced by a FastAPI dependency, `get_current_org()` (`app/core/security.py`), extracted from the validated JWT; repository functions take `organization_id` as an explicit parameter and every org-scoped query filters by it. See ADR-007 in `docs/DECISIONS.md` for why this is application-level rather than Postgres Row-Level Security in v1.

## Auth

JWT access tokens (30 min, HS256, `PyJWT`) plus opaque refresh tokens whose SHA-256 hash is the only thing persisted (`refresh_tokens.token_hash`), since there is no Redis to hold session state. Refresh rotates the token (old one is revoked, a new pair issued) rather than reusing the same refresh token indefinitely. See ADR-006.

## Testing strategy

- **`tests/unit/`** — pure logic, no database: JWT/password hashing, and (from Phase 3 onward) the CPM/EVM algorithms fed synthetic in-memory data.
- **`tests/integration/`** — full FastAPI request/response cycle via `httpx.AsyncClient` against the real app (dependency-injected with a test database session), exercising a real Postgres (`pmp_test`, created the same way as the dev database — see `docker-compose.yml`). No SQLite is used anywhere: the schema relies on Postgres-specific behavior (native enums, `gen_random_uuid()`) that a SQLite substitute wouldn't faithfully exercise.
