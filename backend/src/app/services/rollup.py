"""WBS parent roll-up: a task with direct children has its schedule/cost/
progress fields computed automatically from them (no manual/automatic toggle
— see ADR-030). Pure, DB-free algorithm, same mold as critical_path.py/
scheduler.py; services/task_service.py loads the real ORM rows and calls
`propagate_rollup_to_ancestors` to walk the change up the WBS tree."""

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.task import Task
from app.repositories import task_repository
from app.services.working_calendar import WorkingCalendar


@dataclass(frozen=True)
class RollupChildInput:
    start_date: date
    end_date: date
    duration_days: int
    budgeted_cost: float
    percent_complete: float


@dataclass(frozen=True)
class RollupResult:
    start_date: date
    end_date: date
    duration_days: int
    budgeted_cost: float
    percent_complete: float


def compute_rollup(children: list[RollupChildInput], calendar: WorkingCalendar) -> RollupResult:
    """`percent_complete` is duration-weighted — MS Project's own convention
    for a summary task's rolled-up % complete (`Σ(duration × %complete) /
    Σ(duration)`): a longer subtask should move the parent's progress more
    than a short one. Deliberately *not* cost-weighted (unlike
    `dashboard_service._overall_percent_complete`'s portfolio-level EVM
    metric) — every task always has a duration, but `budgeted_cost` is
    frequently left at its 0 default, which would otherwise freeze the
    parent at 0% forever regardless of how far along its children actually
    are. Falls back to a plain average when every child has zero duration
    (an all-milestones group), where the weighted formula is undefined
    (0/0)."""
    start_date = min(c.start_date for c in children)
    end_date = max(c.end_date for c in children)
    budgeted_cost = sum(c.budgeted_cost for c in children)
    total_duration = sum(c.duration_days for c in children)
    if total_duration:
        percent_complete = (
            sum(c.percent_complete * c.duration_days for c in children) / total_duration
        )
    else:
        percent_complete = sum(c.percent_complete for c in children) / len(children)

    return RollupResult(
        start_date=start_date,
        end_date=end_date,
        duration_days=calendar.working_days_between(start_date, end_date),
        budgeted_cost=budgeted_cost,
        percent_complete=percent_complete,
    )


def duration_weighted_percent_complete(tasks: list[Task]) -> float:
    """Σ(percent_complete × duration_days) / Σ(duration_days) — MS Project's
    duration-weighted convention (see ADR-032, ADR-033), applied to a flat
    list of tasks rather than a parent/children roll-up. Shared by
    `dashboard_service` (a project's overall % complete) and
    `progress_service` (the Forecast tab's schedule-based "Por plazo"
    section) so the formula lives in one place. Falls back to a plain
    average when every task has zero duration; `0.0` for an empty list."""
    if not tasks:
        return 0.0
    total_duration = sum(t.duration_days for t in tasks)
    if total_duration:
        return sum(float(t.percent_complete) * t.duration_days for t in tasks) / total_duration
    return sum(float(t.percent_complete) for t in tasks) / len(tasks)


def leaf_tasks(tasks: list[Task]) -> list[Task]:
    """Excludes WBS parent tasks (any task that is another task's
    `parent_task_id` in this same list) from a project-wide cost/progress
    aggregate. A parent's `budgeted_cost`/`percent_complete` are roll-ups
    already equal to the sum/cost-weighted-average of its children
    (`compute_rollup`), so summing every task without this filter double-
    (or triple-, for deeper hierarchies) counts every level of the tree —
    used by dashboard_service/progress_service wherever they total cost or
    earned value across a project's tasks."""
    parent_ids = {t.parent_task_id for t in tasks if t.parent_task_id is not None}
    return [t for t in tasks if t.id not in parent_ids]


async def propagate_rollup_to_ancestors(
    db: AsyncSession,
    project: Project,
    calendar: WorkingCalendar,
    start_parent_id: uuid.UUID,
) -> None:
    """Walks up from `start_parent_id` through `parent_task_id`, recomputing
    each ancestor from its current direct children. Stops as soon as an
    ancestor has no children left (it reverted to being a leaf — its last
    known fields are left untouched) or the root of the tree is reached."""
    current_id: uuid.UUID | None = start_parent_id
    while current_id is not None:
        parent = await task_repository.get_by_id_in_project(db, project.id, current_id)
        if parent is None:
            return
        children = await task_repository.list_children(db, parent.id)
        if not children:
            return

        result = compute_rollup(
            [
                RollupChildInput(
                    start_date=child.start_date,
                    end_date=child.end_date,
                    duration_days=child.duration_days,
                    budgeted_cost=float(child.budgeted_cost),
                    percent_complete=float(child.percent_complete),
                )
                for child in children
            ],
            calendar,
        )
        parent.start_date = result.start_date
        parent.end_date = result.end_date
        parent.duration_days = result.duration_days
        parent.budgeted_cost = result.budgeted_cost
        parent.percent_complete = result.percent_complete

        current_id = parent.parent_task_id

    await db.flush()
