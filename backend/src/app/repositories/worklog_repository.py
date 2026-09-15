import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project, ProjectMember
from app.models.task import Task
from app.models.user import User
from app.models.worklog import Worklog


async def get_by_id_in_org(
    db: AsyncSession, organization_id: uuid.UUID, worklog_id: uuid.UUID
) -> Worklog | None:
    result = await db.execute(
        select(Worklog)
        .join(Task, Task.id == Worklog.task_id)
        .join(Project, Project.id == Task.project_id)
        .where(Worklog.id == worklog_id, Project.organization_id == organization_id)
    )
    return result.scalar_one_or_none()


async def list_by_task(
    db: AsyncSession, task_id: uuid.UUID, *, limit: int, offset: int
) -> tuple[list[Worklog], int]:
    base_query = select(Worklog).where(Worklog.task_id == task_id)
    total = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar_one()
    result = await db.execute(
        base_query.order_by(Worklog.work_date.desc()).limit(limit).offset(offset)
    )
    return list(result.scalars().all()), total


async def create(
    db: AsyncSession,
    *,
    task_id: uuid.UUID,
    user_id: uuid.UUID,
    work_date: date,
    hours: float,
    description: str | None,
) -> Worklog:
    worklog = Worklog(
        task_id=task_id, user_id=user_id, work_date=work_date, hours=hours, description=description
    )
    db.add(worklog)
    await db.flush()
    return worklog


async def update(db: AsyncSession, worklog: Worklog, **fields: object) -> Worklog:
    for key, value in fields.items():
        if value is not None:
            setattr(worklog, key, value)
    await db.flush()
    return worklog


async def delete(db: AsyncSession, worklog: Worklog) -> None:
    await db.delete(worklog)
    await db.flush()


async def list_report(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    project_id: uuid.UUID | None,
    user_id: uuid.UUID | None,
    date_from: date | None,
    date_to: date | None,
    restrict_to_member_id: uuid.UUID | None,
    limit: int,
    offset: int,
) -> tuple[list[Worklog], int]:
    """`restrict_to_member_id`: when set (a `member` caller), only worklogs on
    projects that user belongs to are visible — section 8's permission matrix
    scopes report visibility to "proyectos donde participa" for members."""
    base_query = (
        select(Worklog)
        .join(Task, Task.id == Worklog.task_id)
        .join(Project, Project.id == Task.project_id)
        .where(Project.organization_id == organization_id)
    )
    if project_id is not None:
        base_query = base_query.where(Project.id == project_id)
    if user_id is not None:
        base_query = base_query.where(Worklog.user_id == user_id)
    if date_from is not None:
        base_query = base_query.where(Worklog.work_date >= date_from)
    if date_to is not None:
        base_query = base_query.where(Worklog.work_date <= date_to)
    if restrict_to_member_id is not None:
        base_query = base_query.where(
            Project.id.in_(
                select(ProjectMember.project_id).where(
                    ProjectMember.user_id == restrict_to_member_id
                )
            )
        )

    total = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar_one()
    result = await db.execute(
        base_query.order_by(Worklog.work_date.desc()).limit(limit).offset(offset)
    )
    return list(result.scalars().all()), total


@dataclass(frozen=True)
class WorklogExportRow:
    work_date: date
    user_email: str
    task_name: str
    hours: float
    description: str | None


async def list_for_export(db: AsyncSession, project_id: uuid.UUID) -> list[WorklogExportRow]:
    """Denormalized rows for the CSV export (section 4.1 point 24) — one
    query joining in the user's email and task's name for readability."""
    result = await db.execute(
        select(Worklog.work_date, User.email, Task.name, Worklog.hours, Worklog.description)
        .join(Task, Task.id == Worklog.task_id)
        .join(User, User.id == Worklog.user_id)
        .where(Task.project_id == project_id)
        .order_by(Worklog.work_date)
    )
    return [
        WorklogExportRow(
            work_date=work_date,
            user_email=user_email,
            task_name=task_name,
            hours=float(hours),
            description=description,
        )
        for work_date, user_email, task_name, hours, description in result.all()
    ]


async def list_costs_by_project(
    db: AsyncSession, project_id: uuid.UUID
) -> tuple[list[tuple[date, float]], int]:
    """(work_date, hours * cost_per_hour) for every worklog on the project's
    tasks — one query, fed straight into services/evm.py. Also returns how
    many rows had a null `cost_per_hour` (contributed as 0 — section 6.3),
    so the caller can log a warning without blocking the calculation."""
    result = await db.execute(
        select(Worklog.work_date, Worklog.hours, User.cost_per_hour)
        .join(Task, Task.id == Worklog.task_id)
        .join(User, User.id == Worklog.user_id)
        .where(Task.project_id == project_id)
    )
    rows = result.all()
    costs: list[tuple[date, float]] = []
    missing_rate_count = 0
    for work_date, hours, cost_per_hour in rows:
        if cost_per_hour is None:
            missing_rate_count += 1
            costs.append((work_date, 0.0))
        else:
            costs.append((work_date, float(hours) * float(cost_per_hour)))
    return costs, missing_rate_count
