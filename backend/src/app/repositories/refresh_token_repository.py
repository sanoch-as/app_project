import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.refresh_token import RefreshToken


async def create(
    db: AsyncSession, *, user_id: uuid.UUID, token_hash: str, expires_at: datetime
) -> RefreshToken:
    refresh_token = RefreshToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
    db.add(refresh_token)
    await db.flush()
    return refresh_token


async def get_valid_by_hash(db: AsyncSession, token_hash: str) -> RefreshToken | None:
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked.is_(False),
            RefreshToken.expires_at > datetime.now(UTC),
        )
    )
    return result.scalar_one_or_none()


async def revoke(db: AsyncSession, refresh_token: RefreshToken) -> None:
    refresh_token.revoked = True
    await db.flush()


async def revoke_by_hash(db: AsyncSession, token_hash: str) -> None:
    token = await get_valid_by_hash(db, token_hash)
    if token is not None:
        await revoke(db, token)
