import uuid
from datetime import date

from app.services.evm import (
    BaselineTaskEVMInput,
    TaskEVMInput,
    compute_ac,
    compute_ev,
    compute_evm,
    compute_pv,
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
