"""Earned Value Management — spec section 6.3. Pure, DB-free computation:
callers (services/progress_service.py) load a project's tasks, active
baseline, and worklog costs, then call `compute_evm`. See ADR-013 for the
design decisions this follows (why EV doesn't vary by status date, how PV
is prorated, etc.)."""

import uuid
from dataclasses import dataclass
from datetime import date

from app.services.working_calendar import WorkingCalendar


@dataclass(frozen=True)
class TaskEVMInput:
    id: uuid.UUID
    budgeted_cost: float
    percent_complete: float  # 0-100


@dataclass(frozen=True)
class BaselineTaskEVMInput:
    task_id: uuid.UUID
    planned_start_date: date
    planned_end_date: date
    planned_cost: float


@dataclass(frozen=True)
class EVMMetrics:
    pv: float
    ev: float
    ac: float
    spi: float | None
    cpi: float | None


def _prorated_fraction(planned_start: date, planned_end: date, status_date: date) -> float:
    """Fraction (0.0-1.0) of a baselined task's planned window elapsed by status_date —
    linear between planned_start_date and planned_end_date, clamped at both ends."""
    if status_date < planned_start:
        return 0.0
    if status_date >= planned_end:
        return 1.0
    total_days = (planned_end - planned_start).days + 1
    elapsed_days = (status_date - planned_start).days + 1
    return elapsed_days / total_days


def _prorated_planned_value(
    planned_start: date, planned_end: date, planned_cost: float, status_date: date
) -> float:
    return planned_cost * _prorated_fraction(planned_start, planned_end, status_date)


def _prorated_fraction_by_working_days(
    planned_start: date, planned_end: date, status_date: date, calendar: WorkingCalendar
) -> float:
    """Same idea as `_prorated_fraction`, but measured in working days
    instead of calendar days — used only by the duration-weighted "Por
    plazo" planned %, so it measures duration the same way
    `duration_weighted_percent_complete` ("Real") already does (ADR-038).
    Falls back to 1.0 for a zero-working-day span reached past its own
    start (e.g. a baseline window that lands entirely on weekends/holidays)
    rather than dividing by zero."""
    if status_date < planned_start:
        return 0.0
    if status_date >= planned_end:
        return 1.0
    total_working_days = calendar.working_days_between(planned_start, planned_end)
    if not total_working_days:
        return 1.0
    elapsed_working_days = calendar.working_days_between(planned_start, status_date)
    return elapsed_working_days / total_working_days


def compute_pv(baseline_tasks: list[BaselineTaskEVMInput], status_date: date) -> float:
    return sum(
        _prorated_planned_value(
            bt.planned_start_date, bt.planned_end_date, bt.planned_cost, status_date
        )
        for bt in baseline_tasks
    )


def planned_percent_complete_by_task(
    baseline_tasks: list[BaselineTaskEVMInput], status_date: date
) -> dict[uuid.UUID, float]:
    """MS Project's "baseline % complete at a status date", per task: how far along
    each task's planned schedule *should* be by status_date, 0-100. Pure date
    prorating (no cost weighting), so it's defined even when planned_cost is 0 —
    see planned_percent_complete_project for the cost-weighted project aggregate."""
    return {
        bt.task_id: _prorated_fraction(bt.planned_start_date, bt.planned_end_date, status_date)
        * 100
        for bt in baseline_tasks
    }


def planned_percent_complete_project(
    baseline_tasks: list[BaselineTaskEVMInput], status_date: date
) -> float | None:
    """Cost-weighted project-level planned % complete at status_date — consistent with
    compute_pv's weighting. None when there's no baseline (or its total planned cost is
    0), same "not applicable" convention as spi/cpi in compute_evm."""
    total_planned_cost = sum(bt.planned_cost for bt in baseline_tasks)
    if not total_planned_cost:
        return None
    return compute_pv(baseline_tasks, status_date) / total_planned_cost * 100


def planned_percent_complete_project_by_duration(
    baseline_tasks: list[BaselineTaskEVMInput], status_date: date, calendar: WorkingCalendar
) -> float | None:
    """Schedule-based counterpart to `planned_percent_complete_project` — MS
    Project's duration-weighted convention (see ADR-032/ADR-033) applied to
    the project-level planned %: weights each task's own working-day-prorated
    fraction (`_prorated_fraction_by_working_days`) by its planned working-day
    span (`calendar.working_days_between(planned_start, planned_end)`)
    instead of its planned cost — deliberately working days, not the raw
    calendar-day span `planned_percent_complete_project`/
    `planned_percent_complete_by_task` still use, so "Planeado" and "Real"
    measure duration the same way in the Forecast tab's "Por plazo" section
    (ADR-038; before that fix they disagreed even for a project with no
    weekend/holiday work at all). `None` only when there's no baseline at
    all (`baseline_tasks` empty); falls back to a plain average across tasks
    if every one of them has a zero-working-day planned span (mirrors
    `rollup.compute_rollup`'s own all-zero-weight fallback)."""
    if not baseline_tasks:
        return None
    fractions_and_weights = [
        (
            _prorated_fraction_by_working_days(
                bt.planned_start_date, bt.planned_end_date, status_date, calendar
            ),
            calendar.working_days_between(bt.planned_start_date, bt.planned_end_date),
        )
        for bt in baseline_tasks
    ]
    total_days = sum(weight for _, weight in fractions_and_weights)
    if total_days:
        weighted = sum(fraction * weight for fraction, weight in fractions_and_weights)
        return weighted / total_days * 100
    return sum(fraction for fraction, _ in fractions_and_weights) / len(fractions_and_weights) * 100


@dataclass(frozen=True)
class TaskPercentSnapshot:
    task_id: uuid.UUID
    snapshot_date: date
    percent_complete: float


@dataclass(frozen=True)
class PercentCompletePoint:
    checkpoint: date
    planned_percent_complete: float | None
    actual_percent_complete: float | None
    planned_percent_complete_by_duration: float | None
    actual_percent_complete_by_duration: float | None


def percent_complete_at_or_before(
    snapshots_for_task: list[TaskPercentSnapshot], checkpoint: date
) -> float | None:
    """Point-in-time lookup: the most recently known percent_complete for one task at
    or before checkpoint — None if no snapshot exists yet that far back. `snapshots_for_task`
    must already be filtered to a single task (ordering doesn't matter, all candidates
    are scanned)."""
    candidates = [s for s in snapshots_for_task if s.snapshot_date <= checkpoint]
    if not candidates:
        return None
    return max(candidates, key=lambda s: s.snapshot_date).percent_complete


def compute_ev(tasks: list[TaskEVMInput]) -> float:
    """Always the *current* value — see ADR-013 (no percent_complete history table)."""
    return sum((task.percent_complete / 100) * task.budgeted_cost for task in tasks)


def compute_ac(worklog_costs: list[tuple[date, float]], status_date: date) -> float:
    return sum(cost for work_date, cost in worklog_costs if work_date <= status_date)


def compute_evm(
    tasks: list[TaskEVMInput],
    baseline_tasks: list[BaselineTaskEVMInput],
    worklog_costs: list[tuple[date, float]],
    status_date: date,
) -> EVMMetrics:
    pv = compute_pv(baseline_tasks, status_date)
    ev = compute_ev(tasks)
    ac = compute_ac(worklog_costs, status_date)
    spi = (ev / pv) if pv else None
    cpi = (ev / ac) if ac else None
    return EVMMetrics(pv=pv, ev=ev, ac=ac, spi=spi, cpi=cpi)
