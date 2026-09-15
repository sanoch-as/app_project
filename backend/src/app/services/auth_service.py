from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.enums import UserRole
from app.core.exceptions import AccountLockedError, ConflictError, UnauthorizedError
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    refresh_token_expiry,
    verify_password,
)
from app.models.organization import Organization
from app.models.user import User
from app.repositories import organization_repository, refresh_token_repository, user_repository
from app.schemas.auth import TokenPair


async def _issue_token_pair(db: AsyncSession, user: User) -> TokenPair:
    access_token = create_access_token(
        user_id=user.id, organization_id=user.organization_id, role=user.role
    )
    raw_refresh_token = generate_refresh_token()
    await refresh_token_repository.create(
        db,
        user_id=user.id,
        token_hash=hash_refresh_token(raw_refresh_token),
        expires_at=refresh_token_expiry(),
    )
    return TokenPair(access_token=access_token, refresh_token=raw_refresh_token)


async def register(
    db: AsyncSession, *, organization_name: str, full_name: str, email: str, password: str
) -> tuple[Organization, User, TokenPair]:
    """Creates an organization plus its first (admin) user. Section 4.1 point 1."""
    if await user_repository.get_by_email(db, email) is not None:
        raise ConflictError("A user with this email already exists", code="email_taken")

    slug = await organization_repository.generate_unique_slug(db, organization_name)
    organization = await organization_repository.create(db, name=organization_name, slug=slug)

    user = await user_repository.create(
        db,
        organization_id=organization.id,
        email=email,
        hashed_password=hash_password(password),
        full_name=full_name,
        role=UserRole.ADMIN,
    )
    tokens = await _issue_token_pair(db, user)
    await db.commit()
    await db.refresh(organization)
    await db.refresh(user)
    return organization, user, tokens


async def login(db: AsyncSession, *, email: str, password: str) -> tuple[User, TokenPair]:
    user = await user_repository.get_by_email(db, email)
    if user is None or not user.is_active:
        raise UnauthorizedError("Invalid email or password")

    if user_repository.is_locked(user):
        raise AccountLockedError(
            "Account temporarily locked due to too many failed login attempts. Try again later."
        )

    if not verify_password(password, user.hashed_password):
        await user_repository.register_failed_login(
            db,
            user,
            max_attempts=settings.login_max_failed_attempts,
            lockout_minutes=settings.login_lockout_minutes,
        )
        await db.commit()
        raise UnauthorizedError("Invalid email or password")

    await user_repository.reset_failed_login(db, user)
    tokens = await _issue_token_pair(db, user)
    await db.commit()
    await db.refresh(user)
    return user, tokens


async def refresh(db: AsyncSession, *, raw_refresh_token: str) -> TokenPair:
    token_hash = hash_refresh_token(raw_refresh_token)
    stored_token = await refresh_token_repository.get_valid_by_hash(db, token_hash)
    if stored_token is None:
        raise UnauthorizedError("Invalid or expired refresh token")

    user = await db.get(User, stored_token.user_id)
    if user is None or not user.is_active:
        raise UnauthorizedError("User not found or inactive")

    # Rotate: revoke the old refresh token, issue a new pair.
    await refresh_token_repository.revoke(db, stored_token)
    tokens = await _issue_token_pair(db, user)
    await db.commit()
    return tokens


async def logout(db: AsyncSession, *, raw_refresh_token: str) -> None:
    token_hash = hash_refresh_token(raw_refresh_token)
    await refresh_token_repository.revoke_by_hash(db, token_hash)
    await db.commit()
