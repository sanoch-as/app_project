import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import TaskPriority
from app.core.exceptions import ValidationAppError
from app.core.security import CurrentUser
from app.models.project import Project
from app.models.task import Task
from app.repositories import task_repository, user_repository
from app.schemas.task import TaskAssigneeInput
from app.services import project_service, schedule_service

get_calendar = schedule_service.get_calendar


async def _validate_assignees(
    db: AsyncSession, organization_id: uuid.UUID, assignees: list[TaskAssigneeInput]
) -> None:
    seen: set[uuid.UUID] = set()
    for assignee in assignees:
        if assignee.user_id in seen:
            raise ValidationAppError(f"Duplicate assignee user_id: {assignee.user_id}")
        seen.add(assignee.user_id)
        user = await user_repository.get_by_id(db, organization_id, assignee.user_id)
        if user is None:
            raise ValidationAppError(f"Assignee user {assignee.user_id} not found in organization")


async def create_task(
    db: AsyncSession,
    current_user: CurrentUser,
    project_id: uuid.UUID,
    *,
    parent_task_id: uuid.UUID | None,
    name: str,
    description: str | None,
    start_date: date,
    duration_days: int,
    is_milestone: bool,
    priority: TaskPriority,
    estimated_hours: float | None,
    budgeted_cost: float,
    assignees: list[TaskAssigneeInput],
) -> Task:
    project = await project_service.get_project_for_user(db, current_user, project_id)

    parent = None
    if parent_task_id is not None:
        parent = await task_repository.get_by_id_in_project(db, project_id, parent_task_id)
        if parent is None:
            raise ValidationAppError("parent_task_id does not belong to this project")

    await _validate_assignees(db, current_user.organization_id, assignees)

    calendar = await get_calendar(db, project)
    effective_duration = 0 if is_milestone else max(duration_days, 1)
    end_date = calendar.add_working_days(start_date, effective_duration)

    sibling_count = await task_repository.count_siblings(db, project_id, parent_task_id)
    wbs_code = f"{parent.wbs_code}.{sibling_count + 1}" if parent else str(sibling_count + 1)

    task = await task_repository.create(
        db,
        project_id=project_id,
        parent_task_id=parent_task_id,
        name=name,
        description=description,
        wbs_code=wbs_code,
        start_date=start_date,
        end_date=end_date,
        duration_days=effective_duration,
        is_milestone=is_milestone,
        estimated_hours=estimated_hours,
        budgeted_cost=budgeted_cost,
        priority=priority,
    )
    if assignees:
        await task_repository.set_assignees(
            db, task.id, [(a.user_id, a.allocation_percent) for a in assignees]
        )
    await schedule_service.recalculate_schedule(db, project, calendar, changed_task_id=task.id)
    await db.commit()
    reloaded = await task_repository.get_by_id(db, current_user.organization_id, task.id)
    assert reloaded is not None
    return reloaded


async def update_task(
    db: AsyncSession,
    current_user: CurrentUser,
    task: Task,
    project: Project,
    *,
    fields: dict[str, object],
    assignees: list[TaskAssigneeInput] | None,
) -> Task:
    if assignees is not None:
        await _validate_assignees(db, current_user.organization_id, assignees)

    recompute_end_date = (
        "start_date" in fields or "duration_days" in fields or "is_milestone" in fields
    )
    if fields.get("is_milestone"):
        fields["duration_days"] = 0

    updated = await task_repository.update(db, task, **fields)

    if recompute_end_date:
        calendar = await get_calendar(db, project)
        effective_duration = 0 if updated.is_milestone else max(updated.duration_days, 1)
        updated.duration_days = effective_duration
        updated.end_date = calendar.add_working_days(updated.start_date, effective_duration)

    if assignees is not None:
        await task_repository.set_assignees(
            db, task.id, [(a.user_id, a.allocation_percent) for a in assignees]
        )

    if recompute_end_date:
        await schedule_service.recalculate_schedule(db, project, calendar, changed_task_id=task.id)

    await db.commit()
    reloaded = await task_repository.get_by_id(db, current_user.organization_id, task.id)
    assert reloaded is not None
    return reloaded


async def delete_task(db: AsyncSession, project: Project, task: Task) -> None:
    await task_repository.delete(db, task)
    calendar = await get_calendar(db, project)
    await schedule_service.recalculate_schedule(db, project, calendar)
    await db.commit()
