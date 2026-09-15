import uuid
from datetime import date

from sqlalchemy import delete as sa_delete
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import ProjectStatus
from app.models.project import Project, ProjectHoliday, ProjectMember


async def list_active_projects(db: AsyncSession) -> list[Project]:
    """System-wide (no organization filter) — used only by the
    CRON_SECRET-protected /progress/recalculate-all endpoint, section 6.3."""
    result = await db.execute(select(Project).where(Project.status == ProjectStatus.ACTIVE))
    return list(result.scalars().all())


async def list_all_visible(
    db: AsyncSession, organization_id: uuid.UUID, user_id: uuid.UUID | None
) -> list[Project]:
    """Unpaginated — the portfolio dashboard (section 4.1 point 4, "vista
    consolidada de todos los proyectos") shows every visible project at
    once, not a page of them. `user_id=None` means unrestricted (admin);
    otherwise restricted to projects that user is a member of."""
    query = select(Project).where(Project.organization_id == organization_id)
    if user_id is not None:
        query = query.join(ProjectMember, ProjectMember.project_id == Project.id).where(
            ProjectMember.user_id == user_id
        )
    result = await db.execute(query.order_by(Project.created_at.desc()))
    return list(result.scalars().all())


async def get_by_id(
    db: AsyncSession, organization_id: uuid.UUID, project_id: uuid.UUID
) -> Project | None:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.organization_id == organization_id)
    )
    return result.scalar_one_or_none()


async def list_by_organization(
    db: AsyncSession, organization_id: uuid.UUID, *, limit: int, offset: int
) -> tuple[list[Project], int]:
    base_query = select(Project).where(Project.organization_id == organization_id)
    total = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar_one()
    result = await db.execute(
        base_query.order_by(Project.created_at.desc()).limit(limit).offset(offset)
    )
    return list(result.scalars().all()), total


async def list_for_member(
    db: AsyncSession, organization_id: uuid.UUID, user_id: uuid.UUID, *, limit: int, offset: int
) -> tuple[list[Project], int]:
    """Projects visible to a `member`: those they are assigned to (section 8 permission matrix)."""
    base_query = (
        select(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(Project.organization_id == organization_id, ProjectMember.user_id == user_id)
    )
    total = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar_one()
    result = await db.execute(
        base_query.order_by(Project.created_at.desc()).limit(limit).offset(offset)
    )
    return list(result.scalars().all()), total


async def create(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    name: str,
    description: str | None,
    start_date: date | None,
    end_date: date | None,
    created_by: uuid.UUID,
    working_days_per_week: int,
    standard_hours_per_day: float,
) -> Project:
    project = Project(
        organization_id=organization_id,
        name=name,
        description=description,
        start_date=start_date,
        end_date=end_date,
        created_by=created_by,
        working_days_per_week=working_days_per_week,
        standard_hours_per_day=standard_hours_per_day,
    )
    db.add(project)
    await db.flush()
    return project


async def update(db: AsyncSession, project: Project, **fields: object) -> Project:
    for key, value in fields.items():
        if value is not None:
            setattr(project, key, value)
    await db.flush()
    return project


async def delete(db: AsyncSession, project: Project) -> None:
    await db.delete(project)
    await db.flush()


async def get_holidays(db: AsyncSession, project_id: uuid.UUID) -> list[date]:
    result = await db.execute(
        select(ProjectHoliday.holiday_date).where(ProjectHoliday.project_id == project_id)
    )
    return list(result.scalars().all())


async def get_holidays_by_project_ids(
    db: AsyncSession, project_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[date]]:
    """Batched form of `get_holidays`, one query for a whole page of projects
    instead of one query per project (avoids N+1 in list endpoints)."""
    if not project_ids:
        return {}
    result = await db.execute(
        select(ProjectHoliday.project_id, ProjectHoliday.holiday_date).where(
            ProjectHoliday.project_id.in_(project_ids)
        )
    )
    holidays_by_project: dict[uuid.UUID, list[date]] = {pid: [] for pid in project_ids}
    for project_id, holiday_date in result.all():
        holidays_by_project[project_id].append(holiday_date)
    return holidays_by_project


async def set_holidays(db: AsyncSession, project_id: uuid.UUID, holidays: list[date]) -> None:
    """Full-replace semantics — see docs/DECISIONS.md ADR-012. There is no
    dedicated holidays endpoint (section 7 doesn't list one); it's managed as
    part of `PATCH /projects/{id}`."""
    await db.execute(sa_delete(ProjectHoliday).where(ProjectHoliday.project_id == project_id))
    for holiday_date in holidays:
        db.add(ProjectHoliday(project_id=project_id, holiday_date=holiday_date))
    await db.flush()


async def is_member(db: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
        )
    )
    return result.scalar_one_or_none() is not None


async def list_members(db: AsyncSession, project_id: uuid.UUID) -> list[ProjectMember]:
    result = await db.execute(
        select(ProjectMember)
        .where(ProjectMember.project_id == project_id)
        .options(selectinload(ProjectMember.user))
    )
    return list(result.scalars().all())


async def add_member(db: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID) -> ProjectMember:
    member = ProjectMember(project_id=project_id, user_id=user_id)
    db.add(member)
    await db.flush()
    return member


async def remove_member(db: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        return False
    await db.delete(member)
    await db.flush()
    return True


async def get_member(
    db: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID
) -> ProjectMember | None:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
        )
    )
    return result.scalar_one_or_none()
