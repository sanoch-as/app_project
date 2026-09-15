# Project Management Platform — v1 (MVP)

A project/portfolio management platform (Jira + MS Project + GanttPRO-ish, minus the parts explicitly out of scope for v1) — projects, WBS tasks, critical-path scheduling, baselines, earned value management, and a curated set of dashboards/reports. Built end-to-end from the spec in [`prompt-claude-code-plataforma-pm.md`](prompt-claude-code-plataforma-pm.md); every autonomous decision made along the way is recorded in [`docs/DECISIONS.md`](docs/DECISIONS.md), and everything deliberately left out of v1 is listed in [`docs/BACKLOG.md`](docs/BACKLOG.md).

**Stack**: FastAPI + SQLAlchemy 2.0 (async) + PostgreSQL backend, React + TypeScript + Vite frontend, deployed as two independent Vercel projects with Neon as the managed database. See [`docs/architecture.md`](docs/architecture.md) for the full picture, including why there's no Redis/Celery anywhere (Vercel Functions are stateless — CPM/EVM recomputation and daily snapshots are handled synchronously in-request and via Vercel Cron instead).

## Quick start (local development)

Prerequisites: Python 3.12+, Node 20+, Docker.

```bash
# 1. Start local Postgres (this is the ONLY thing Docker is used for — see docs/architecture.md)
docker compose up -d postgres

# 2. Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env   # defaults already point at the docker-compose Postgres above
alembic upgrade head    # creates the schema (and enables the pgcrypto extension it needs)
uvicorn app.main:app --reload --port 8000 --app-dir src
# API now at http://localhost:8000/api/v1, docs at http://localhost:8000/docs

# 3. (optional) seed demo data — a couple of realistic projects, tasks, dependencies,
#    a baseline, and worklogs, login as admin@example.com / demo1234
cd ..
python scripts/seed_data.py   # run with backend's venv still active

# 4. Frontend (separate terminal)
cd frontend
npm install
cp .env.example .env    # VITE_API_BASE_URL defaults to http://localhost:8000/api/v1
npm run dev
# App now at http://localhost:5173
```

Run the backend test suite (a real Postgres is required — the docker-compose one works, pointed at a separate test database):

```bash
cd backend
docker exec pmp_postgres psql -U pmp -d postgres -c "CREATE DATABASE pmp_test;"
DATABASE_URL="postgresql+asyncpg://pmp:pmp@localhost:5432/pmp_test" \
JWT_SECRET_KEY="a-random-secret-at-least-32-bytes-long" \
CRON_SECRET="a-random-cron-secret" \
pytest --cov=src/app/services --cov-report=term-missing tests/
```

Lint/format/type-check (what CI runs):

```bash
cd backend
ruff check .
black --check .
mypy src/app/services src/app/models
```

```bash
cd frontend
npm run lint
npm run typecheck
npm run build
```

## Repository layout

```
backend/    FastAPI app (see backend/src/app), Alembic migrations, tests
frontend/   React + Vite SPA
docs/       architecture, database schema, API conventions, ADRs, backlog
scripts/    seed_data.py — demo data for local exploration
.github/    CI (lint + type-check + test on every push/PR)
```

Deep dives: [`docs/architecture.md`](docs/architecture.md) (system design, why no worker process, Neon/PgBouncer connection handling), [`docs/database-schema.md`](docs/database-schema.md) (every table), [`docs/api-conventions.md`](docs/api-conventions.md) (the full endpoint list, phase by phase, with the reasoning behind anything not a literal transcription of the spec).

## Deploying to Vercel

Two **separate** Vercel projects from the same repo, per the spec's architecture constraint (section 12/13 of the driving spec) — this is not one deployment, it's two.

### 1. Database — Neon (via Vercel Marketplace)

1. In the Vercel dashboard, open (or create) the `backend` project below, go to the **Storage** tab, and add **Neon** from the Marketplace (free tier is enough for the MVP).
2. Vercel injects a Postgres connection string into the project's environment variables automatically. Use the **pooled** one (its host has a `-pooler` suffix) — the backend is built around PgBouncer's transaction-pooling mode (see `docs/architecture.md`). Map/rename it to `DATABASE_URL` if Vercel's injected variable name differs, and make sure the scheme is `postgresql+asyncpg://` (Neon typically gives you `postgresql://`; add the `+asyncpg` driver segment).
3. Apply the schema against that database from your machine (never from inside a serverless function — see ADR-002/ADR-003 in `docs/DECISIONS.md`):
   ```bash
   cd backend
   DATABASE_URL="<neon-pooled-connection-string-with-+asyncpg>" alembic upgrade head
   ```
4. Optionally seed demo data the same way: `DATABASE_URL="<...>" python ../scripts/seed_data.py`.

### 2. Backend project

- **Root Directory**: `backend`
- **Framework Preset**: Other (Vercel detects the Python runtime from `requirements.txt`)
- **Environment variables** (Project Settings → Environment Variables):
  | Variable | Value |
  |---|---|
  | `DATABASE_URL` | The Neon pooled connection string from above |
  | `JWT_SECRET_KEY` | A random 32+ byte secret (`openssl rand -hex 32`) |
  | `JWT_ALGORITHM` | `HS256` |
  | `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` |
  | `REFRESH_TOKEN_EXPIRE_DAYS` | `7` |
  | `CRON_SECRET` | Another random secret — Vercel Cron sends this automatically as a bearer token to `/api/v1/progress/recalculate-all` |
  | `FRONTEND_ORIGIN` | The frontend project's URL (e.g. `https://your-frontend.vercel.app`) — used for CORS |
  | `ENVIRONMENT` | `production` |
- Deploy. `backend/vercel.json` already configures the function's `maxDuration` and the daily cron job (`0 6 * * *`, once a day — the Hobby plan's ceiling) — no extra dashboard configuration needed for those.
- Swagger docs are live at `https://<backend-project>.vercel.app/docs`.

### 3. Frontend project

- **Root Directory**: `frontend`
- **Framework Preset**: Vite (auto-detected)
- **Environment variables**: `VITE_API_BASE_URL` = `https://<backend-project>.vercel.app/api/v1`
- `frontend/vercel.json` rewrites every path to `/index.html` so client-side routing (React Router) works on a direct page load/refresh, not just in-app navigation — no extra dashboard configuration needed.
- Deploy.

Every push to `main` deploys both projects to production via Vercel's native Git integration; every PR gets its own preview deployment of each. `.github/workflows/ci.yml` runs lint/type-check/tests on both — it does not deploy (that's Vercel's job, not this workflow's).

## What's in v1, what isn't

Section 4.1/4.2 of the driving spec draws the line precisely; the short version: projects/portfolio, WBS tasks with dependencies and critical-path scheduling, baselines, basic hours capture (no approval workflow), EVM/S-curve, and dashboards/exports are in. Full resource management, a complete Tempo-style time-tracking workflow, collaboration features, a Notion-style wiki, granular roles/SSO, external integrations, mobile/offline, and advanced analytics (Monte Carlo, risk register, AI) are explicitly deferred — see [`docs/BACKLOG.md`](docs/BACKLOG.md) for the full list and the reasoning behind each.
