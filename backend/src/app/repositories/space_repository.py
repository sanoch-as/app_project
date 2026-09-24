import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import ProjectMember
from app.models.space import Space


async def get_by_id(
    db: AsyncSession, organization_id: uuid.UUID, space_id: uuid.UUID
) -> Space | None:
    result = await db.execute(
        select(Space).where(Space.id == space_id, Space.organization_id == organization_id)
    )
    return result.scalar_one_or_none()


async def list_by_project(
    db: AsyncSession, project_id: uuid.UUID, *, limit: int, offset: int
) -> tuple[list[Space], int]:
    base_query = select(Space).where(Space.project_id == project_id)
    total = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar_one()
    result = await db.execute(
        base_query.order_by(Space.created_at.asc()).limit(limit).offset(offset)
    )
    return list(result.scalars().all()), total


async def list_visible(
    db: AsyncSession,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    is_admin: bool,
    limit: int,
    offset: int,
) -> tuple[list[Space], int]:
    """Every independent space, plus (for a non-admin) every project-tied
    space for a project they're a member of — admins see every project-tied
    space in the org regardless of membership (mirrors `get_project_for_user`'s
    admin bypass)."""
    base_query = select(Space).where(Space.organization_id == organization_id)
    if not is_admin:
        member_project_ids = select(ProjectMember.project_id).where(
            ProjectMember.user_id == user_id
        )
        base_query = base_query.where(
            or_(Space.project_id.is_(None), Space.project_id.in_(member_project_ids))
        )
    total = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar_one()
    result = await db.execute(
        base_query.order_by(Space.created_at.asc()).limit(limit).offset(offset)
    )
    return list(result.scalars().all()), total


async def create(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    project_id: uuid.UUID | None,
    name: str,
    description: str | None,
    icon: str | None,
    created_by: uuid.UUID | None,
) -> Space:
    space = Space(
        organization_id=organization_id,
        project_id=project_id,
        name=name,
        description=description,
        icon=icon,
        created_by=created_by,
    )
    db.add(space)
    await db.flush()
    return space


async def update(db: AsyncSession, space: Space, **fields: object) -> Space:
    for key, value in fields.items():
        if value is not None:
            setattr(space, key, value)
    await db.flush()
    return space


async def delete(db: AsyncSession, space: Space) -> None:
    await db.delete(space)
    await db.flush()
