import hashlib
import secrets
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.enums import UserRole
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_bearer_scheme = HTTPBearer(auto_error=False)

TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"


def hash_password(password: str) -> str:
    return str(pwd_context.hash(password))


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bool(pwd_context.verify(plain_password, hashed_password))


def create_access_token(*, user_id: uuid.UUID, organization_id: uuid.UUID, role: UserRole) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "org_id": str(organization_id),
        "role": role.value,
        "type": TOKEN_TYPE_ACCESS,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload: dict[str, Any] = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
    except jwt.PyJWTError as exc:
        raise UnauthorizedError("Invalid or expired access token") from exc
    if payload.get("type") != TOKEN_TYPE_ACCESS:
        raise UnauthorizedError("Invalid token type")
    return payload


def generate_refresh_token() -> str:
    """A high-entropy opaque token. Only its hash is ever persisted (see ADR-006)."""
    return secrets.token_urlsafe(48)


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def refresh_token_expiry() -> datetime:
    return datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    organization_id: uuid.UUID
    role: UserRole


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    if credentials is None:
        raise UnauthorizedError("Missing bearer token")
    payload = decode_access_token(credentials.credentials)
    user_id = uuid.UUID(payload["sub"])

    result = await db.execute(select(User).where(User.id == user_id, User.is_active.is_(True)))
    user = result.scalar_one_or_none()
    if user is None:
        raise UnauthorizedError("User not found or inactive")

    return CurrentUser(id=user.id, organization_id=user.organization_id, role=user.role)


def get_current_org(current_user: CurrentUser = Depends(get_current_user)) -> uuid.UUID:
    """Every org-scoped query must filter by this value (see ADR-007)."""
    return current_user.organization_id


def require_role(*allowed_roles: UserRole) -> Callable[[CurrentUser], CurrentUser]:
    def dependency(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise ForbiddenError("You do not have permission to perform this action")
        return current_user

    return dependency


def verify_cron_secret(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> None:
    """Protects /progress/recalculate-all (section 6.3): only Vercel Cron,
    which sends `Authorization: Bearer <CRON_SECRET>`, may call it — there is
    no user JWT involved, this is not a per-user-scoped endpoint."""
    valid = credentials is not None and secrets.compare_digest(
        credentials.credentials, settings.cron_secret
    )
    if not valid:
        raise UnauthorizedError("Invalid or missing cron secret")
