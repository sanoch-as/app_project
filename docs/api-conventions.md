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

## Endpoints implemented so far (Phase 1 — auth, organizations, users)

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

This section grows with each phase; see `docs/DECISIONS.md` for the reasoning behind anything that isn't a literal transcription of spec section 7.
