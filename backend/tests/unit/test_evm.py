import uuid
from datetime import date

from app.services.evm import (
    BaselineTaskEVMInput,
    TaskEVMInput,
    TaskPercentSnapshot,
    compute_ac,
    compute_ev,
    compute_evm,
    compute_pv,
    percent_complete_at_or_before,
    planned_percent_complete_by_task,
    planned_percent_complete_project,
)

TASK_A = uuid.uuid4()


def test_compute_ev_sums_percent_complete_times_budgeted_cost():
    tasks = [
        TaskEVMInput(id=TASK_A, budgeted_cost=1000, percent_complete=50),
        TaskEVMInput(id=uuid.uuid4(), budgeted_cost=2000, percent_complete=25),
    ]
    assert compute_ev(tasks) == 500 + 500


def test_compute_pv_zero_before_planned_start():
    baseline_tasks = [
        BaselineTaskEVMInput(TASK_A, date(2026, 9, 14), date(2026, 9, 18), 1000),
    ]
    assert compute_pv(baseline_tasks, date(2026, 9, 10)) == 0


def test_compute_pv_full_cost_at_or_after_planned_end():
    baseline_tasks = [
        BaselineTaskEVMInput(TASK_A, date(2026, 9, 14), date(2026, 9, 18), 1000),
    ]
    assert compute_pv(baseline_tasks, date(2026, 9, 18)) == 1000
    assert compute_pv(baseline_tasks, date(2026, 9, 30)) == 1000


def test_compute_pv_prorates_linearly_between_start_and_end():
    # A 5-calendar-day span (9/14-9/18): status date 9/16 is the 3rd day -> 3/5.
    baseline_tasks = [
        BaselineTaskEVMInput(TASK_A, date(2026, 9, 14), date(2026, 9, 18), 1000),
    ]
    assert compute_pv(baseline_tasks, date(2026, 9, 16)) == 600


def test_compute_ac_sums_only_worklogs_up_to_status_date():
    worklog_costs = [
        (date(2026, 9, 14), 100.0),
        (date(2026, 9, 20), 200.0),
    ]
    assert compute_ac(worklog_costs, date(2026, 9, 15)) == 100.0
    assert compute_ac(worklog_costs, date(2026, 9, 20)) == 300.0


def test_spi_and_cpi_are_none_when_denominator_is_zero():
    tasks = [TaskEVMInput(TASK_A, budgeted_cost=1000, percent_complete=0)]
    baseline_tasks: list[BaselineTaskEVMInput] = []
    worklog_costs: list[tuple[date, float]] = []
    metrics = compute_evm(tasks, baseline_tasks, worklog_costs, date(2026, 9, 14))
    assert metrics.pv == 0
    assert metrics.ac == 0
    assert metrics.spi is None
    assert metrics.cpi is None


def test_full_evm_calculation():
    tasks = [TaskEVMInput(TASK_A, budgeted_cost=1000, percent_complete=50)]
    baseline_tasks = [BaselineTaskEVMInput(TASK_A, date(2026, 9, 14), date(2026, 9, 23), 1000)]
    worklog_costs = [(date(2026, 9, 15), 400.0)]

    metrics = compute_evm(tasks, baseline_tasks, worklog_costs, date(2026, 9, 18))

    assert metrics.ev == 500
    assert metrics.ac == 400
    # 10-day span, day 5 of 10 = 50% -> PV = 500
    assert metrics.pv == 500
    assert metrics.spi == 1.0
    assert metrics.cpi == 1.25


def test_planned_percent_complete_by_task_zero_before_start():
    baseline_tasks = [BaselineTaskEVMInput(TASK_A, date(2026, 9, 14), date(2026, 9, 18), 1000)]
    result = planned_percent_complete_by_task(baseline_tasks, date(2026, 9, 10))
    assert result == {TASK_A: 0.0}


def test_planned_percent_complete_by_task_full_at_or_after_end():
    baseline_tasks = [BaselineTaskEVMInput(TASK_A, date(2026, 9, 14), date(2026, 9, 18), 1000)]
    assert planned_percent_complete_by_task(baseline_tasks, date(2026, 9, 18)) == {TASK_A: 100.0}
    assert planned_percent_complete_by_task(baseline_tasks, date(2026, 9, 30)) == {TASK_A: 100.0}


def test_planned_percent_complete_by_task_prorates_linearly():
    # Same 5-calendar-day span as the PV prorating test: day 3 of 5 -> 60%.
    baseline_tasks = [BaselineTaskEVMInput(TASK_A, date(2026, 9, 14), date(2026, 9, 18), 1000)]
    result = planned_percent_complete_by_task(baseline_tasks, date(2026, 9, 16))
    assert result == {TASK_A: 60.0}


def test_planned_percent_complete_by_task_is_defined_even_with_zero_planned_cost():
    baseline_tasks = [BaselineTaskEVMInput(TASK_A, date(2026, 9, 14), date(2026, 9, 18), 0)]
    result = planned_percent_complete_by_task(baseline_tasks, date(2026, 9, 16))
    assert result == {TASK_A: 60.0}


def test_planned_percent_complete_project_none_without_baseline():
    assert planned_percent_complete_project([], date(2026, 9, 16)) is None


def test_planned_percent_complete_project_is_cost_weighted():
    task_b = uuid.uuid4()
    baseline_tasks = [
        # Fully elapsed by the status date -> 100% of its cost counts.
        BaselineTaskEVMInput(TASK_A, date(2026, 9, 1), date(2026, 9, 5), 1000),
        # Not started yet by the status date -> 0% of its cost counts.
        BaselineTaskEVMInput(task_b, date(2026, 9, 20), date(2026, 9, 25), 3000),
    ]
    result = planned_percent_complete_project(baseline_tasks, date(2026, 9, 16))
    assert result == 1000 / 4000 * 100


def test_percent_complete_at_or_before_none_without_any_snapshot():
    assert percent_complete_at_or_before([], date(2026, 9, 16)) is None


def test_percent_complete_at_or_before_none_when_checkpoint_predates_first_snapshot():
    snapshots = [TaskPercentSnapshot(TASK_A, date(2026, 9, 14), 20.0)]
    assert percent_complete_at_or_before(snapshots, date(2026, 9, 10)) is None


def test_percent_complete_at_or_before_picks_most_recent_at_or_before_checkpoint():
    snapshots = [
        TaskPercentSnapshot(TASK_A, date(2026, 9, 10), 10.0),
        TaskPercentSnapshot(TASK_A, date(2026, 9, 14), 30.0),
        TaskPercentSnapshot(TASK_A, date(2026, 9, 20), 70.0),
    ]
    # Exactly on a snapshot date.
    assert percent_complete_at_or_before(snapshots, date(2026, 9, 14)) == 30.0
    # Between two snapshots -> takes the earlier (most recent known-as-of).
    assert percent_complete_at_or_before(snapshots, date(2026, 9, 17)) == 30.0
    # After the last snapshot -> takes the last known value.
    assert percent_complete_at_or_before(snapshots, date(2026, 12, 31)) == 70.0
