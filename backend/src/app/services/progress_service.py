import uuid
from datetime import UTC, date, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.project import Project
from app.repositories import (
    baseline_repository,
    progress_snapshot_repository,
    project_repository,
    task_repository,
    worklog_repository,
)
from app.services.evm import BaselineTaskEVMInput, EVMMetrics, TaskEVMInput, compute_evm
from app.services.scurve import SCurvePoint, build_weekly_scurve

logger = get_logger(__name__)


def _today() -> date:
    return datetime.now(UTC).date()


async def _load_evm_inputs(
    db: AsyncSession, project_id: uuid.UUID
) -> tuple[list[TaskEVMInput], list[BaselineTaskEVMInput], list[tuple[date, float]]]:
    # SQLAlchemy returns NUMERIC columns as Decimal; services/evm.py is pure
    # Python and works in plain floats, so convert at this ORM boundary.
    tasks = await task_repository.list_all_by_project(db, project_id)
    task_inputs = [
        TaskEVMInput(
            id=t.id,
            budgeted_cost=float(t.budgeted_cost),
            percent_complete=float(t.percent_complete),
        )
        for t in tasks
    ]

    active_baseline = await baseline_repository.get_active_baseline(db, project_id)
    baseline_inputs = (
        [
            BaselineTaskEVMInput(
                task_id=bt.task_id,
                planned_start_date=bt.planned_start_date,
                planned_end_date=bt.planned_end_date,
                planned_cost=float(bt.planned_cost),
            )
            for bt in active_baseline.baseline_tasks
        ]
        if active_baseline is not None
        else []
    )

    worklog_costs, missing_rate_count = await worklog_repository.list_costs_by_project(
        db, project_id
    )
    if missing_rate_count:
        logger.warning(
            "worklogs_missing_cost_per_hour",
            project_id=str(project_id),
            affected_worklogs=missing_rate_count,
        )

    return task_inputs, baseline_inputs, worklog_costs


async def get_current_progress(
    db: AsyncSession, project: Project
) -> tuple[EVMMetrics, list[SCurvePoint]]:
    tasks, baseline_tasks, worklog_costs = await _load_evm_inputs(db, project.id)
    today = _today()
    current = compute_evm(tasks, baseline_tasks, worklog_costs, today)
    curve = build_weekly_scurve(tasks, baseline_tasks, worklog_costs, today)
    return current, curve


async def recalculate_and_store(db: AsyncSession, project: Project) -> EVMMetrics:
    tasks, baseline_tasks, worklog_costs = await _load_evm_inputs(db, project.id)
    today = _today()
    metrics = compute_evm(tasks, baseline_tasks, worklog_costs, today)
    await progress_snapshot_repository.upsert(db, project.id, today, metrics)
    await db.commit()
    return metrics


async def recalculate_all_active(db: AsyncSession) -> int:
    """Invoked by the daily Vercel Cron (CRON_SECRET-protected) — section 6.3.
    One project at a time; see docs/BACKLOG.md for the noted scaling limit if
    the number of active projects grows large enough to risk the Vercel
    plan's maxDuration."""
    projects = await project_repository.list_active_projects(db)
    for project in projects:
        await recalculate_and_store(db, project)
    return len(projects)
