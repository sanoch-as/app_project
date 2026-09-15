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
- Comments and @mentions on tasks/projects.
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

## Known v1 scaling limits (not full features, but documented constraints)
- **`refresh_tokens` cleanup**: expired/revoked rows are filtered out at query time (`expires_at`/`revoked`), never purged. Fine at MVP scale; add a periodic cleanup (e.g. an extra daily Vercel Cron endpoint) if the table grows large.
- **`POST /progress/recalculate-all` scaling**: processes every `active` project in one request, one query per project (no N+1). If the number of active projects grows large enough to risk exceeding the Vercel plan's `maxDuration` (10s on Hobby), this endpoint should be paginated across multiple cron-triggered invocations, or the project should move to a Vercel plan with a higher `maxDuration`. See ADR-003.
- **Tenant isolation is application-level** (a FastAPI dependency), not Postgres Row-Level Security. See ADR-007 for the reasoning and the suggested v2 hardening.
- **Login rate limiting is per-account** (`users.failed_login_attempts`/`locked_until`), not per-IP. See ADR-004.
