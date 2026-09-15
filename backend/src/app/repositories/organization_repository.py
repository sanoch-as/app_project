import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "org"


async def get_by_id(db: AsyncSession, organization_id: uuid.UUID) -> Organization | None:
    result = await db.execute(select(Organization).where(Organization.id == organization_id))
    return result.scalar_one_or_none()


async def get_by_slug(db: AsyncSession, slug: str) -> Organization | None:
    result = await db.execute(select(Organization).where(Organization.slug == slug))
    return result.scalar_one_or_none()


async def generate_unique_slug(db: AsyncSession, name: str) -> str:
    base_slug = slugify(name)
    slug = base_slug
    suffix = 1
    while await get_by_slug(db, slug) is not None:
        suffix += 1
        slug = f"{base_slug}-{suffix}"
    return slug


async def create(db: AsyncSession, *, name: str, slug: str) -> Organization:
    organization = Organization(name=name, slug=slug)
    db.add(organization)
    await db.flush()
    return organization
