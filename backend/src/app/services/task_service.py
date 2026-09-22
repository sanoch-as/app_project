import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import TaskPriority
from app.core.exceptions import ConflictError, ValidationAppError
from app.core.security import CurrentUser
from app.models.project import Project
from app.models.task import Task
from app.repositories import task_repository, user_repository
from app.schemas.task import MAX_WORKING_DAYS, TaskAssigneeInput
from app.services import project_service, rollup, schedule_service
from app.services.jira_csv_parser import PROJECT_ROOT_ISSUE_KEY
from app.services.working_calendar import WorkingCalendar

get_calendar = schedule_service.get_calendar

# Fields a parent task's roll-up (services/rollup.py) computes from its
# children — read-only on a task that has any children (see ADR-030).
ROLLUP_MANAGED_FIELDS = {
    "start_date",
    "end_date",
    "duration_days",
    "budgeted_cost",
    "percent_complete",
}


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
    if parent_task_id is not None:
        await rollup.propagate_rollup_to_ancestors(db, project, calendar, parent_task_id)
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

    children = await task_repository.list_children(db, task.id)
    if children and ROLLUP_MANAGED_FIELDS & fields.keys():
        raise ValidationAppError(
            "start_date, end_date, duration_days, budgeted_cost and percent_complete are "
            "computed automatically from subtasks and cannot be edited directly on a "
            "parent task",
            code="parent_task_readonly_fields",
        )

    calendar: WorkingCalendar | None = None

    # `end_date` is never persisted as given: it's only a convenience to derive
    # `duration_days`, which is then re-expanded via the working calendar below
    # so it always lands on a valid working day (mirrors the create_task path).
    end_date_override: date | None = fields.pop("end_date", None)  # type: ignore[assignment]
    if end_date_override is not None and "duration_days" not in fields:
        is_milestone = fields.get("is_milestone", task.is_milestone)
        if not is_milestone:
            start: date = fields.get("start_date", task.start_date)  # type: ignore[assignment]
            if end_date_override < start:
                raise ValidationAppError(
                    "end_date cannot be before start_date", code="invalid_end_date"
                )
            if (end_date_override - start).days > MAX_WORKING_DAYS:
                raise ValidationAppError(
                    "end_date is too far from start_date", code="invalid_end_date"
                )
            calendar = await get_calendar(db, project)
            fields["duration_days"] = calendar.working_days_between(start, end_date_override)

    recompute_end_date = (
        "start_date" in fields or "duration_days" in fields or "is_milestone" in fields
    )
    if fields.get("is_milestone"):
        fields["duration_days"] = 0

    updated = await task_repository.update(db, task, **fields)

    if recompute_end_date:
        if calendar is None:
            calendar = await get_calendar(db, project)
        effective_duration = 0 if updated.is_milestone else max(updated.duration_days, 1)
        updated.duration_days = effective_duration
        updated.end_date = calendar.add_working_days(updated.start_date, effective_duration)
        if not children:
            # A leaf's leaf_duration_days always mirrors its own
            # duration_days (see rollup.py) — a parent's is never touched
            # here, since ROLLUP_MANAGED_FIELDS already rejected this update
            # above if `children` were non-empty and duration changed.
            updated.leaf_duration_days = effective_duration

    if assignees is not None:
        await task_repository.set_assignees(
            db, task.id, [(a.user_id, a.allocation_percent) for a in assignees]
        )

    if recompute_end_date:
        if calendar is None:
            calendar = await get_calendar(db, project)
        await schedule_service.recalculate_schedule(db, project, calendar, changed_task_id=task.id)

    if updated.parent_task_id is not None:
        if calendar is None:
            calendar = await get_calendar(db, project)
        await rollup.propagate_rollup_to_ancestors(db, project, calendar, updated.parent_task_id)

    await db.commit()
    reloaded = await task_repository.get_by_id(db, current_user.organization_id, task.id)
    assert reloaded is not None
    return reloaded


async def delete_task(db: AsyncSession, project: Project, task: Task) -> None:
    if task.external_key == PROJECT_ROOT_ISSUE_KEY:
        # `parent_task_id` cascades on delete (ADR-030) — this row is the
        # Jira importer's synthetic project-summary root (ADR-036), so
        # deleting it would silently wipe out every task it ever imported.
        # Deleting the whole project (or editing the CSV and resyncing) is
        # the only supported way to remove that content.
        raise ConflictError(
            "This task is an auto-generated project-summary root created by the Jira "
            "CSV import and can't be deleted directly — delete the project instead",
            code="jira_project_root_not_deletable",
        )
    parent_task_id = task.parent_task_id
    await task_repository.delete(db, task)
    calendar = await get_calendar(db, project)
    if parent_task_id is not None:
        await rollup.propagate_rollup_to_ancestors(db, project, calendar, parent_task_id)
    await schedule_service.recalculate_schedule(db, project, calendar)
    await db.commit()


def _wbs_sibling_index(task: Task) -> int:
    return int(task.wbs_code.rsplit(".", 1)[-1])


def _apply_wbs_code(task: Task, new_code: str, all_tasks: list[Task]) -> None:
    if task.wbs_code == new_code:
        return
    task.wbs_code = new_code
    for child in all_tasks:
        if child.parent_task_id == task.id:
            _apply_wbs_code(child, f"{new_code}.{_wbs_sibling_index(child)}", all_tasks)


async def move_task(
    db: AsyncSession,
    project: Project,
    task: Task,
    *,
    new_parent_id: uuid.UUID | None,
    position: int,
) -> Task:
    """Reassigns `task`'s WBS parent (drag-and-drop in the Tasks table —
    section "Jerarquía WBS"), renumbering both the old and new sibling
    groups (and cascading the new WBS prefix down to every descendant of a
    renumbered task) and refreshing roll-ups on both sides."""
    all_tasks = await task_repository.list_all_by_project(db, project.id)
    by_id = {t.id: t for t in all_tasks}

    if new_parent_id is not None:
        if new_parent_id == task.id:
            raise ValidationAppError("A task cannot become its own parent", code="invalid_move")
        new_parent = by_id.get(new_parent_id)
        if new_parent is None:
            raise ValidationAppError(
                "parent_task_id does not belong to this project", code="invalid_move"
            )
        cursor: uuid.UUID | None = new_parent_id
        while cursor is not None:
            if cursor == task.id:
                raise ValidationAppError(
                    "This move would create a cycle in the task hierarchy",
                    code="task_move_cycle",
                )
            cursor = by_id[cursor].parent_task_id

    old_parent_id = task.parent_task_id

    old_siblings = sorted(
        (t for t in all_tasks if t.parent_task_id == old_parent_id and t.id != task.id),
        key=_wbs_sibling_index,
    )
    new_siblings = sorted(
        (t for t in all_tasks if t.parent_task_id == new_parent_id and t.id != task.id),
        key=_wbs_sibling_index,
    )
    position = max(0, min(position, len(new_siblings)))
    new_siblings.insert(position, task)

    task.parent_task_id = new_parent_id

    old_parent_code = by_id[old_parent_id].wbs_code if old_parent_id is not None else None
    new_parent_code = by_id[new_parent_id].wbs_code if new_parent_id is not None else None

    if old_parent_id != new_parent_id:
        for index, sibling in enumerate(old_siblings, start=1):
            code = f"{old_parent_code}.{index}" if old_parent_code else str(index)
            _apply_wbs_code(sibling, code, all_tasks)
    for index, sibling in enumerate(new_siblings, start=1):
        code = f"{new_parent_code}.{index}" if new_parent_code else str(index)
        _apply_wbs_code(sibling, code, all_tasks)

    calendar = await get_calendar(db, project)
    if old_parent_id is not None and old_parent_id != new_parent_id:
        await rollup.propagate_rollup_to_ancestors(db, project, calendar, old_parent_id)
    if new_parent_id is not None:
        await rollup.propagate_rollup_to_ancestors(db, project, calendar, new_parent_id)

    await schedule_service.recalculate_schedule(db, project, calendar)
    await db.commit()
    reloaded = await task_repository.get_by_id(db, project.organization_id, task.id)
    assert reloaded is not None
    return reloaded
