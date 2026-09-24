import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.page import Page
from app.models.project import Project, ProjectMember
from app.models.space import Space
from app.models.task import Task


async def search_projects(
    db: AsyncSession,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    is_admin: bool,
    q: str,
    limit: int,
) -> list[Project]:
    query = select(Project).where(
        Project.organization_id == organization_id, Project.name.ilike(f"%{q}%")
    )
    if not is_admin:
        member_project_ids = select(ProjectMember.project_id).where(
            ProjectMember.user_id == user_id
        )
        query = query.where(Project.id.in_(member_project_ids))
    result = await db.execute(query.order_by(Project.name.asc()).limit(limit))
    return list(result.scalars().all())


async def search_tasks(
    db: AsyncSession,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    is_admin: bool,
    q: str,
    limit: int,
) -> list[Task]:
    query = (
        select(Task)
        .join(Project, Project.id == Task.project_id)
        .where(Project.organization_id == organization_id, Task.name.ilike(f"%{q}%"))
    )
    if not is_admin:
        member_project_ids = select(ProjectMember.project_id).where(
            ProjectMember.user_id == user_id
        )
        query = query.where(Project.id.in_(member_project_ids))
    result = await db.execute(query.order_by(Task.name.asc()).limit(limit))
    return list(result.scalars().all())


async def search_pages(
    db: AsyncSession,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    is_admin: bool,
    q: str,
    space_id: uuid.UUID | None,
    exclude_page_id: uuid.UUID | None,
    limit: int,
) -> list[Page]:
    query = (
        select(Page)
        .join(Space, Space.id == Page.space_id)
        .where(Space.organization_id == organization_id, Page.title.ilike(f"%{q}%"))
    )
    if space_id is not None:
        query = query.where(Page.space_id == space_id)
    if exclude_page_id is not None:
        query = query.where(Page.id != exclude_page_id)
    if not is_admin:
        member_project_ids = select(ProjectMember.project_id).where(
            ProjectMember.user_id == user_id
        )
        query = query.where(
            or_(Space.project_id.is_(None), Space.project_id.in_(member_project_ids))
        )
    result = await db.execute(query.order_by(Page.title.asc()).limit(limit))
    return list(result.scalars().all())
