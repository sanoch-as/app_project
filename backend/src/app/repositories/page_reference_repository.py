import uuid

from sqlalchemy import delete as sa_delete
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ReferencedEntityType
from app.models.page import Page
from app.models.page_reference import PageReference
from app.models.project import ProjectMember
from app.models.space import Space


async def list_by_page(db: AsyncSession, page_id: uuid.UUID) -> list[PageReference]:
    result = await db.execute(select(PageReference).where(PageReference.page_id == page_id))
    return list(result.scalars().all())


async def replace_for_page(
    db: AsyncSession,
    page_id: uuid.UUID,
    references: set[tuple[ReferencedEntityType, uuid.UUID]],
) -> None:
    """Full-replace semantics — same pattern as `project_repository.set_holidays`
    (ADR-012): delete every existing row for this page, then insert the new
    set. Simpler and safer than diffing, and this table is always small."""
    await db.execute(sa_delete(PageReference).where(PageReference.page_id == page_id))
    for referenced_type, referenced_id in references:
        db.add(
            PageReference(
                page_id=page_id, referenced_type=referenced_type, referenced_id=referenced_id
            )
        )
    await db.flush()


async def list_referencing(
    db: AsyncSession,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    is_admin: bool,
    referenced_type: ReferencedEntityType,
    referenced_id: uuid.UUID,
    limit: int,
    offset: int,
) -> tuple[list[tuple[Page, Space]], int]:
    base_query = (
        select(Page, Space)
        .join(Space, Space.id == Page.space_id)
        .join(PageReference, PageReference.page_id == Page.id)
        .where(
            Space.organization_id == organization_id,
            PageReference.referenced_type == referenced_type,
            PageReference.referenced_id == referenced_id,
        )
    )
    if not is_admin:
        member_project_ids = select(ProjectMember.project_id).where(
            ProjectMember.user_id == user_id
        )
        base_query = base_query.where(
            or_(Space.project_id.is_(None), Space.project_id.in_(member_project_ids))
        )
    total = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar_one()
    result = await db.execute(base_query.order_by(Page.title.asc()).limit(limit).offset(offset))
    return [(page, space) for page, space in result.all()], total
