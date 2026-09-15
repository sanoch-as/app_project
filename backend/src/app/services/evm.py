"""Earned Value Management — spec section 6.3. Pure, DB-free computation:
callers (services/progress_service.py) load a project's tasks, active
baseline, and worklog costs, then call `compute_evm`. See ADR-013 for the
design decisions this follows (why EV doesn't vary by status date, how PV
is prorated, etc.)."""

import uuid
from dataclasses import dataclass
from datetime import date


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


def _prorated_planned_value(
    planned_start: date, planned_end: date, planned_cost: float, status_date: date
) -> float:
    if status_date < planned_start:
        return 0.0
    if status_date >= planned_end:
        return planned_cost
    total_days = (planned_end - planned_start).days + 1
    elapsed_days = (status_date - planned_start).days + 1
    return planned_cost * (elapsed_days / total_days)


def compute_pv(baseline_tasks: list[BaselineTaskEVMInput], status_date: date) -> float:
    return sum(
        _prorated_planned_value(
            bt.planned_start_date, bt.planned_end_date, bt.planned_cost, status_date
        )
        for bt in baseline_tasks
    )


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
