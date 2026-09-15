import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UserRole
from app.models.user import User


async def get_by_id(
    db: AsyncSession, organization_id: uuid.UUID, user_id: uuid.UUID
) -> User | None:
    result = await db.execute(
        select(User).where(User.id == user_id, User.organization_id == organization_id)
    )
    return result.scalar_one_or_none()


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def list_by_organization(
    db: AsyncSession, organization_id: uuid.UUID, *, limit: int, offset: int
) -> tuple[list[User], int]:
    base_query = select(User).where(User.organization_id == organization_id)
    total = (await db.execute(base_query)).scalars().all()
    result = await db.execute(base_query.order_by(User.full_name).limit(limit).offset(offset))
    return list(result.scalars().all()), len(total)


async def create(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    email: str,
    hashed_password: str,
    full_name: str,
    role: UserRole,
    cost_per_hour: float | None = None,
) -> User:
    user = User(
        organization_id=organization_id,
        email=email,
        hashed_password=hashed_password,
        full_name=full_name,
        role=role,
        cost_per_hour=cost_per_hour,
    )
    db.add(user)
    await db.flush()
    return user


async def update(db: AsyncSession, user: User, **fields: object) -> User:
    for key, value in fields.items():
        if value is not None:
            setattr(user, key, value)
    await db.flush()
    return user


def is_locked(user: User) -> bool:
    return user.locked_until is not None and user.locked_until > datetime.now(UTC)


async def register_failed_login(
    db: AsyncSession, user: User, *, max_attempts: int, lockout_minutes: int
) -> None:
    user.failed_login_attempts += 1
    if user.failed_login_attempts >= max_attempts:
        user.locked_until = datetime.now(UTC) + timedelta(minutes=lockout_minutes)
    await db.flush()


async def reset_failed_login(db: AsyncSession, user: User) -> None:
    user.failed_login_attempts = 0
    user.locked_until = None
    await db.flush()
