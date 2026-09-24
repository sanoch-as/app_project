import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.page import Page
from app.models.space import Space


async def get_by_id_in_org(
    db: AsyncSession, organization_id: uuid.UUID, page_id: uuid.UUID
) -> Page | None:
    result = await db.execute(
        select(Page)
        .join(Space, Space.id == Page.space_id)
        .where(Page.id == page_id, Space.organization_id == organization_id)
    )
    return result.scalar_one_or_none()


async def list_all_by_space(db: AsyncSession, space_id: uuid.UUID) -> list[Page]:
    """Unpaginated — the client builds the tree from the flat list, and
    `page_service.move_page` needs every page to walk the cycle check."""
    result = await db.execute(
        select(Page).where(Page.space_id == space_id).order_by(Page.sort_order.asc())
    )
    return list(result.scalars().all())


async def create(
    db: AsyncSession,
    *,
    space_id: uuid.UUID,
    parent_page_id: uuid.UUID | None,
    title: str,
    content: dict[str, Any],
    sort_order: int,
) -> Page:
    page = Page(
        space_id=space_id,
        parent_page_id=parent_page_id,
        title=title,
        content=content,
        sort_order=sort_order,
    )
    db.add(page)
    await db.flush()
    return page


async def update(db: AsyncSession, page: Page, **fields: object) -> Page:
    for key, value in fields.items():
        if value is not None:
            setattr(page, key, value)
    await db.flush()
    return page


async def delete(db: AsyncSession, page: Page) -> None:
    await db.delete(page)
    await db.flush()
