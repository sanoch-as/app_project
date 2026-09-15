"""S-curve aggregation — spec section 6.3/4.1 point 19. Builds one point per
week across the active baseline's span. Pure, DB-free: services/progress_service.py
loads the data and calls `build_weekly_scurve`."""

from dataclasses import dataclass
from datetime import date, timedelta

from app.services.evm import BaselineTaskEVMInput, EVMMetrics, TaskEVMInput, compute_evm


@dataclass(frozen=True)
class SCurvePoint:
    week_ending: date
    metrics: EVMMetrics


def build_weekly_scurve(
    tasks: list[TaskEVMInput],
    baseline_tasks: list[BaselineTaskEVMInput],
    worklog_costs: list[tuple[date, float]],
    today: date,
) -> list[SCurvePoint]:
    """One point per week from the baseline's earliest planned start to its
    latest planned end (inclusive). Empty if there's no baseline — there is
    nothing to plot a schedule-derived curve against (ADR-013)."""
    if not baseline_tasks:
        return []

    curve_start = min(bt.planned_start_date for bt in baseline_tasks)
    curve_end = max(bt.planned_end_date for bt in baseline_tasks)

    points: list[SCurvePoint] = []
    checkpoint = curve_start
    while checkpoint <= curve_end:
        # PV is fully known in advance (schedule-derived); AC/EV never run
        # ahead of today — a future checkpoint holds today's actuals flat.
        ac_status_date = min(checkpoint, today)
        pv = compute_evm(tasks, baseline_tasks, worklog_costs, checkpoint).pv
        actuals = compute_evm(tasks, baseline_tasks, worklog_costs, ac_status_date)
        metrics = EVMMetrics(
            pv=pv,
            ev=actuals.ev,
            ac=actuals.ac,
            spi=(actuals.ev / pv) if pv else None,
            cpi=actuals.cpi,
        )
        points.append(SCurvePoint(week_ending=checkpoint, metrics=metrics))
        checkpoint += timedelta(weeks=1)

    if points[-1].week_ending != curve_end:
        ac_status_date = min(curve_end, today)
        pv = compute_evm(tasks, baseline_tasks, worklog_costs, curve_end).pv
        actuals = compute_evm(tasks, baseline_tasks, worklog_costs, ac_status_date)
        metrics = EVMMetrics(
            pv=pv,
            ev=actuals.ev,
            ac=actuals.ac,
            spi=(actuals.ev / pv) if pv else None,
            cpi=actuals.cpi,
        )
        points.append(SCurvePoint(week_ending=curve_end, metrics=metrics))

    return points
