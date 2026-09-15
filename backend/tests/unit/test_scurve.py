import uuid
from datetime import date

from app.services.evm import BaselineTaskEVMInput, TaskEVMInput
from app.services.scurve import build_weekly_scurve

TASK_A = uuid.uuid4()


def test_empty_baseline_produces_empty_curve():
    tasks = [TaskEVMInput(TASK_A, budgeted_cost=1000, percent_complete=50)]
    curve = build_weekly_scurve(tasks, [], [], today=date(2026, 9, 14))
    assert curve == []


def test_curve_spans_from_baseline_start_to_end_weekly():
    baseline_tasks = [BaselineTaskEVMInput(TASK_A, date(2026, 9, 1), date(2026, 9, 22), 1000)]
    tasks = [TaskEVMInput(TASK_A, budgeted_cost=1000, percent_complete=0)]
    curve = build_weekly_scurve(tasks, baseline_tasks, [], today=date(2026, 9, 1))

    assert curve[0].week_ending == date(2026, 9, 1)
    assert curve[-1].week_ending == date(2026, 9, 22)
    # Weekly steps in between.
    assert curve[1].week_ending == date(2026, 9, 8)
    assert curve[2].week_ending == date(2026, 9, 15)


def test_pv_increases_monotonically_along_the_curve():
    baseline_tasks = [BaselineTaskEVMInput(TASK_A, date(2026, 9, 1), date(2026, 9, 22), 2100)]
    tasks = [TaskEVMInput(TASK_A, budgeted_cost=2100, percent_complete=0)]
    curve = build_weekly_scurve(tasks, baseline_tasks, [], today=date(2026, 9, 22))

    pv_values = [point.metrics.pv for point in curve]
    assert pv_values == sorted(pv_values)
    assert pv_values[0] < pv_values[-1]
    assert pv_values[-1] == 2100


def test_actuals_are_clamped_at_today_for_future_checkpoints():
    baseline_tasks = [BaselineTaskEVMInput(TASK_A, date(2026, 9, 1), date(2026, 9, 29), 1000)]
    tasks = [TaskEVMInput(TASK_A, budgeted_cost=1000, percent_complete=40)]
    worklog_costs = [(date(2026, 9, 5), 300.0)]

    # "Today" is early in the project; later checkpoints are all in the future.
    curve = build_weekly_scurve(tasks, baseline_tasks, worklog_costs, today=date(2026, 9, 8))

    late_checkpoints = [p for p in curve if p.week_ending > date(2026, 9, 8)]
    assert late_checkpoints  # sanity: there are future checkpoints to check
    for point in late_checkpoints:
        assert point.metrics.ac == 300.0  # held flat, not fabricated forward
        assert point.metrics.ev == 400.0  # EV is always "current" (ADR-013)
