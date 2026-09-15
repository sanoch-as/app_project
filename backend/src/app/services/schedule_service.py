"""Orchestrates services/critical_path.py + services/scheduler.py against a
project's real ORM tasks/dependencies: load once (one query each — section
6.1 point 5), optionally cascade a just-changed task's new date into its
successors (section 6.2), recompute CPM fields for every task, and stage the
writes (caller commits). Runs synchronously in the same request that
created/edited a task or dependency — see ADR-003."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.task import Task
from app.repositories import dependency_repository, project_repository, task_repository
from app.services.critical_path import DependencyEdge, TaskScheduleInput, compute_critical_path
from app.services.scheduler import TaskScheduleState, reschedule_successors
from app.services.working_calendar import WorkingCalendar


async def get_calendar(db: AsyncSession, project: Project) -> WorkingCalendar:
    holidays = await project_repository.get_holidays(db, project.id)
    return WorkingCalendar(
        working_days_per_week=project.working_days_per_week, holidays=frozenset(holidays)
    )


async def recalculate_schedule(
    db: AsyncSession,
    project: Project,
    calendar: WorkingCalendar,
    *,
    changed_task_id: uuid.UUID | None = None,
) -> None:
    tasks = await task_repository.list_all_by_project(db, project.id)
    if not tasks:
        return
    dependency_rows = await dependency_repository.list_by_project(db, project.id)
    tasks_by_id: dict[uuid.UUID, Task] = {t.id: t for t in tasks}
    edges = [
        DependencyEdge(d.predecessor_id, d.successor_id, d.dependency_type, d.lag_days)
        for d in dependency_rows
    ]

    if changed_task_id is not None and changed_task_id in tasks_by_id:
        states = {
            t.id: TaskScheduleState(
                id=t.id, start_date=t.start_date, end_date=t.end_date, duration_days=t.duration_days
            )
            for t in tasks
        }
        changed_ids = reschedule_successors(changed_task_id, states, edges, calendar)
        for task_id in changed_ids:
            tasks_by_id[task_id].start_date = states[task_id].start_date
            tasks_by_id[task_id].end_date = states[task_id].end_date

    # Parent tasks are pure WBS roll-ups (services/rollup.py) — their dates
    # are derived from their children, not scheduled, so they're excluded
    # from the CPM graph and rendered as a visual summary row instead
    # (see ADR-030). compute_critical_path already ignores any dependency
    # edge that references an excluded node.
    parent_ids = {t.parent_task_id for t in tasks if t.parent_task_id is not None}
    schedule_inputs = [
        TaskScheduleInput(id=t.id, start_date=t.start_date, duration_days=t.duration_days)
        for t in tasks
        if t.id not in parent_ids
    ]
    for result in compute_critical_path(schedule_inputs, edges, calendar):
        task = tasks_by_id[result.task_id]
        task.early_start = result.early_start
        task.early_finish = result.early_finish
        task.late_start = result.late_start
        task.late_finish = result.late_finish
        task.total_float = result.total_float
        task.is_critical = result.is_critical

    for parent_id in parent_ids:
        parent = tasks_by_id.get(parent_id)
        if parent is None:
            continue
        parent.early_start = None
        parent.early_finish = None
        parent.late_start = None
        parent.late_finish = None
        parent.total_float = None
        parent.is_critical = False

    await db.flush()
