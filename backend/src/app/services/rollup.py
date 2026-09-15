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
from app.repositories import task_repository
from app.services.working_calendar import WorkingCalendar


@dataclass(frozen=True)
class RollupChildInput:
    start_date: date
    end_date: date
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
    """`percent_complete` is cost-weighted (EV / total budgeted cost), same
    criterion as dashboard_service._overall_percent_complete — a tiny child
    task shouldn't skew the parent's progress as much as its biggest one."""
    start_date = min(c.start_date for c in children)
    end_date = max(c.end_date for c in children)
    budgeted_cost = sum(c.budgeted_cost for c in children)
    if budgeted_cost:
        percent_complete = (
            sum((c.percent_complete / 100) * c.budgeted_cost for c in children)
            / budgeted_cost
            * 100
        )
    else:
        percent_complete = 0.0

    return RollupResult(
        start_date=start_date,
        end_date=end_date,
        duration_days=calendar.working_days_between(start_date, end_date),
        budgeted_cost=budgeted_cost,
        percent_complete=percent_complete,
    )


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
