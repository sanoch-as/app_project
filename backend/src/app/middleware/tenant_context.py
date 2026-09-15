"""Binds organization/user identifiers into structlog's contextvars for the
duration of a request, so every log line emitted while handling it is tagged
with tenant info. This is an observability aid only — actual multi-tenant
query scoping is enforced by the `get_current_org` dependency (see ADR-007
in docs/DECISIONS.md), not by this middleware, so a missing/invalid token
here never blocks a request (that is the auth dependency's job)."""

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.security import decode_access_token


class TenantContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        structlog.contextvars.clear_contextvars()

        auth_header = request.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1]
            try:
                payload = decode_access_token(token)
            except Exception:  # noqa: BLE001 - best-effort tagging only, never blocks the request
                payload = None
            if payload:
                structlog.contextvars.bind_contextvars(
                    organization_id=payload.get("org_id"),
                    user_id=payload.get("sub"),
                )

        return await call_next(request)
