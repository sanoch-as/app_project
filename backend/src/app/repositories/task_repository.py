import uuid
from datetime import date

from sqlalchemy import delete as sa_delete
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import TaskPriority, TaskStatus
from app.models.project import Project
from app.models.task import Task, TaskAssignee


async def get_by_id(
    db: AsyncSession, organization_id: uuid.UUID, task_id: uuid.UUID
) -> Task | None:
    result = await db.execute(
        select(Task)
        .join(Project, Project.id == Task.project_id)
        .where(Task.id == task_id, Project.organization_id == organization_id)
        .options(selectinload(Task.assignees).selectinload(TaskAssignee.user))
    )
    return result.scalar_one_or_none()


async def get_by_id_in_project(
    db: AsyncSession, project_id: uuid.UUID, task_id: uuid.UUID
) -> Task | None:
    result = await db.execute(select(Task).where(Task.id == task_id, Task.project_id == project_id))
    return result.scalar_one_or_none()


async def list_by_project(
    db: AsyncSession,
    project_id: uuid.UUID,
    *,
    status: TaskStatus | None = None,
    limit: int,
    offset: int,
) -> tuple[list[Task], int]:
    base_query = select(Task).where(Task.project_id == project_id)
    if status is not None:
        base_query = base_query.where(Task.status == status)
    total = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar_one()
    result = await db.execute(
        base_query.options(selectinload(Task.assignees).selectinload(TaskAssignee.user))
        .order_by(Task.wbs_code)
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all()), total


async def list_all_by_project(db: AsyncSession, project_id: uuid.UUID) -> list[Task]:
    """Unpaginated — used by the Gantt view and the CPM/scheduler engine, which need every task."""
    result = await db.execute(
        select(Task).where(Task.project_id == project_id).order_by(Task.wbs_code)
    )
    return list(result.scalars().all())


async def count_siblings(
    db: AsyncSession, project_id: uuid.UUID, parent_task_id: uuid.UUID | None
) -> int:
    query = select(func.count()).select_from(Task).where(Task.project_id == project_id)
    query = (
        query.where(Task.parent_task_id.is_(None))
        if parent_task_id is None
        else query.where(Task.parent_task_id == parent_task_id)
    )
    return (await db.execute(query)).scalar_one()


async def create(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    parent_task_id: uuid.UUID | None,
    name: str,
    description: str | None,
    wbs_code: str,
    start_date: date,
    end_date: date,
    duration_days: int,
    is_milestone: bool,
    estimated_hours: float | None,
    budgeted_cost: float,
    priority: TaskPriority,
) -> Task:
    task = Task(
        project_id=project_id,
        parent_task_id=parent_task_id,
        name=name,
        description=description,
        wbs_code=wbs_code,
        start_date=start_date,
        end_date=end_date,
        duration_days=duration_days,
        is_milestone=is_milestone,
        estimated_hours=estimated_hours,
        budgeted_cost=budgeted_cost,
        priority=priority,
    )
    db.add(task)
    await db.flush()
    return task


async def update(db: AsyncSession, task: Task, **fields: object) -> Task:
    for key, value in fields.items():
        if value is not None:
            setattr(task, key, value)
    await db.flush()
    return task


async def delete(db: AsyncSession, task: Task) -> None:
    await db.delete(task)
    await db.flush()


async def set_assignees(
    db: AsyncSession, task_id: uuid.UUID, assignments: list[tuple[uuid.UUID, float]]
) -> None:
    """Full-replace semantics: assignees are managed inline via task create/update
    payloads (section 4.1 point 9 has no dedicated assignee endpoints in section 7)."""
    await db.execute(sa_delete(TaskAssignee).where(TaskAssignee.task_id == task_id))
    for user_id, allocation_percent in assignments:
        db.add(
            TaskAssignee(task_id=task_id, user_id=user_id, allocation_percent=allocation_percent)
        )
    await db.flush()
