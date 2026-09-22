import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.project import Project
from app.models.task import Task
from app.repositories import (
    baseline_repository,
    progress_snapshot_repository,
    project_repository,
    task_progress_snapshot_repository,
    task_repository,
    worklog_repository,
)
from app.services import rollup, schedule_service
from app.services.evm import (
    BaselineTaskEVMInput,
    EVMMetrics,
    PercentCompletePoint,
    TaskEVMInput,
    TaskPercentSnapshot,
    compute_ev,
    compute_evm,
    percent_complete_at_or_before,
    planned_percent_complete_by_task,
    planned_percent_complete_project,
    planned_percent_complete_project_by_duration,
)
from app.services.scurve import SCurvePoint, build_weekly_scurve

logger = get_logger(__name__)


def _today() -> date:
    return datetime.now(UTC).date()


@dataclass(frozen=True)
class TaskProjectedProgress:
    task: Task
    planned_start_date: date | None
    planned_end_date: date | None
    planned_percent_complete: float
    actual_percent_complete: float


@dataclass(frozen=True)
class ProjectedProgress:
    status_date: date
    baseline_id: uuid.UUID | None
    baseline_name: str | None
    project_planned_percent_complete: float | None
    project_actual_percent_complete: float
    project_planned_percent_complete_by_duration: float | None
    project_actual_percent_complete_by_duration: float
    tasks: list[TaskProjectedProgress]


async def _load_evm_inputs(
    db: AsyncSession, project_id: uuid.UUID
) -> tuple[list[Task], list[TaskEVMInput], list[BaselineTaskEVMInput], list[tuple[date, float]]]:
    # SQLAlchemy returns NUMERIC columns as Decimal; services/evm.py is pure
    # Python and works in plain floats, so convert at this ORM boundary.
    tasks = await task_repository.list_all_by_project(db, project_id)
    # WBS parent tasks are excluded from every EVM/cost total below (see
    # rollup.leaf_tasks): their cost/percent are already a roll-up of their
    # children, so summing both would double-count every level of the tree.
    leaf_ids = {t.id for t in rollup.leaf_tasks(tasks)}
    task_inputs = [
        TaskEVMInput(
            id=t.id,
            budgeted_cost=float(t.budgeted_cost),
            percent_complete=float(t.percent_complete),
        )
        for t in tasks
        if t.id in leaf_ids
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
            if bt.task_id in leaf_ids
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

    return tasks, task_inputs, baseline_inputs, worklog_costs


async def get_current_progress(
    db: AsyncSession, project: Project
) -> tuple[EVMMetrics, list[SCurvePoint]]:
    _, task_inputs, baseline_tasks, worklog_costs = await _load_evm_inputs(db, project.id)
    today = _today()
    current = compute_evm(task_inputs, baseline_tasks, worklog_costs, today)
    curve = build_weekly_scurve(task_inputs, baseline_tasks, worklog_costs, today)
    return current, curve


async def recalculate_and_store(db: AsyncSession, project: Project) -> EVMMetrics:
    tasks, task_inputs, baseline_tasks, worklog_costs = await _load_evm_inputs(db, project.id)
    today = _today()
    metrics = compute_evm(task_inputs, baseline_tasks, worklog_costs, today)
    await progress_snapshot_repository.upsert(db, project.id, today, metrics)
    # Per-task snapshot too (ADR-028) — this is what lets the "% Real" forecast curve
    # show real history instead of only ever seeing each task's current value.
    await task_progress_snapshot_repository.upsert_many(
        db, project.id, today, [(t.id, float(t.percent_complete)) for t in tasks]
    )
    await db.commit()
    return metrics


async def get_projected_progress(
    db: AsyncSession, project: Project, status_date: date
) -> ProjectedProgress:
    """Baseline-derived "should be X% done by status_date" projection — MS Project's
    Status Date + baseline. Read-only/live, same as get_current_progress (ADR-013)."""
    tasks, task_inputs, baseline_tasks, _ = await _load_evm_inputs(db, project.id)
    active_baseline = await baseline_repository.get_active_baseline(db, project.id)
    calendar = await schedule_service.get_calendar(db, project)

    planned_by_task = planned_percent_complete_by_task(baseline_tasks, status_date)
    project_planned = planned_percent_complete_project(baseline_tasks, status_date)
    project_planned_by_duration = planned_percent_complete_project_by_duration(
        baseline_tasks, status_date, calendar
    )
    baseline_dates_by_task = {bt.task_id: bt for bt in baseline_tasks}

    total_budgeted = sum(ti.budgeted_cost for ti in task_inputs)
    project_actual = (compute_ev(task_inputs) / total_budgeted * 100) if total_budgeted else 0.0
    project_actual_by_duration = rollup.duration_weighted_percent_complete(rollup.leaf_tasks(tasks))

    task_rows = [
        TaskProjectedProgress(
            task=t,
            planned_start_date=(
                baseline_dates_by_task[t.id].planned_start_date
                if t.id in baseline_dates_by_task
                else None
            ),
            planned_end_date=(
                baseline_dates_by_task[t.id].planned_end_date
                if t.id in baseline_dates_by_task
                else None
            ),
            planned_percent_complete=planned_by_task.get(t.id, 0.0),
            actual_percent_complete=float(t.percent_complete),
        )
        for t in tasks
    ]

    return ProjectedProgress(
        status_date=status_date,
        baseline_id=active_baseline.id if active_baseline else None,
        baseline_name=active_baseline.name if active_baseline else None,
        project_planned_percent_complete=project_planned,
        project_actual_percent_complete=project_actual,
        project_planned_percent_complete_by_duration=project_planned_by_duration,
        project_actual_percent_complete_by_duration=project_actual_by_duration,
        tasks=task_rows,
    )


async def get_percent_complete_history(
    db: AsyncSession,
    project: Project,
    start_date: date,
    end_date: date,
    interval_days: int,
) -> list[PercentCompletePoint]:
    """Planned-vs-actual % complete over time (ADR-028), one point every interval_days
    from start_date to end_date (plus the exact end_date if it doesn't land on the
    grid) — same checkpoint-stepping pattern as services/scurve.py's weekly loop, but
    with a caller-chosen step. "Planned" is fully known in advance (schedule-derived,
    same as PV); "Actual" is None for any checkpoint after today (nothing to show yet),
    reconstructed from task_progress_snapshots for any checkpoint strictly before today
    (None there too if no snapshot exists that far back — no history before this
    feature shipped, not an error), and for checkpoint == today reads the tasks' live,
    current percent_complete directly rather than the snapshot (ADR-038) — the daily
    snapshot is written once (by the cron or a manual "Recalcular ahora"), so relying on
    it for "today" could show a stale value the moment someone edits a task's progress
    afterward, out of step with the "Real hoy" figure shown elsewhere on the same page,
    which already always reads live data."""
    tasks, task_inputs, baseline_tasks, _ = await _load_evm_inputs(db, project.id)
    today = _today()
    calendar = await schedule_service.get_calendar(db, project)
    budgeted_cost_by_task = {ti.id: ti.budgeted_cost for ti in task_inputs}
    duration_by_task = {t.id: t.duration_days for t in rollup.leaf_tasks(tasks)}
    leaf_tasks_today = rollup.leaf_tasks(tasks)

    raw_snapshots = await task_progress_snapshot_repository.list_up_to_date(
        db, project.id, end_date
    )
    snapshots_by_task: dict[uuid.UUID, list[TaskPercentSnapshot]] = {}
    for row in raw_snapshots:
        snapshots_by_task.setdefault(row.task_id, []).append(
            TaskPercentSnapshot(
                task_id=row.task_id,
                snapshot_date=row.snapshot_date,
                percent_complete=float(row.percent_complete),
            )
        )

    def actual_at(checkpoint: date) -> float | None:
        if checkpoint > today:
            return None
        if checkpoint == today:
            total_cost = sum(ti.budgeted_cost for ti in task_inputs)
            return (compute_ev(task_inputs) / total_cost * 100) if total_cost else None
        weighted_sum = 0.0
        total_cost = 0.0
        for task in tasks:
            cost = budgeted_cost_by_task.get(task.id)
            if cost is None:
                continue  # WBS parent task — excluded, see leaf_ids above
            pct = percent_complete_at_or_before(snapshots_by_task.get(task.id, []), checkpoint)
            if pct is None:
                continue
            weighted_sum += (pct / 100) * cost
            total_cost += cost
        return (weighted_sum / total_cost * 100) if total_cost else None

    def actual_at_by_duration(checkpoint: date) -> float | None:
        # Mirrors actual_at above, weighting by duration instead of cost —
        # same None-when-undefined convention (a checkpoint where every task
        # with a snapshot happens to have zero duration is rare enough not
        # to need the "current state" functions' plain-average fallback).
        if checkpoint > today:
            return None
        if checkpoint == today:
            return rollup.duration_weighted_percent_complete(leaf_tasks_today)
        weighted_sum = 0.0
        total_duration = 0
        for task in tasks:
            duration = duration_by_task.get(task.id)
            if duration is None:
                continue  # WBS parent task — excluded, see leaf_ids above
            pct = percent_complete_at_or_before(snapshots_by_task.get(task.id, []), checkpoint)
            if pct is None:
                continue
            weighted_sum += pct * duration
            total_duration += duration
        return (weighted_sum / total_duration) if total_duration else None

    def build_point(checkpoint: date) -> PercentCompletePoint:
        return PercentCompletePoint(
            checkpoint=checkpoint,
            planned_percent_complete=planned_percent_complete_project(baseline_tasks, checkpoint),
            actual_percent_complete=actual_at(checkpoint),
            planned_percent_complete_by_duration=planned_percent_complete_project_by_duration(
                baseline_tasks, checkpoint, calendar
            ),
            actual_percent_complete_by_duration=actual_at_by_duration(checkpoint),
        )

    points = [build_point(start_date)]
    checkpoint = start_date + timedelta(days=interval_days)
    while checkpoint < end_date:
        points.append(build_point(checkpoint))
        checkpoint += timedelta(days=interval_days)
    if end_date > start_date:
        points.append(build_point(end_date))

    return points


async def recalculate_all_active(db: AsyncSession) -> int:
    """Invoked by the daily Vercel Cron (CRON_SECRET-protected) — section 6.3.
    One project at a time; see docs/BACKLOG.md for the noted scaling limit if
    the number of active projects grows large enough to risk the Vercel
    plan's maxDuration."""
    projects = await project_repository.list_active_projects(db)
    for project in projects:
        await recalculate_and_store(db, project)
    return len(projects)
