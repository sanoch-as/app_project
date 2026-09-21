from datetime import date

from app.models.task import Task
from app.services.rollup import RollupChildInput, compute_rollup, duration_weighted_percent_complete
from app.services.working_calendar import WorkingCalendar


def make_calendar(working_days_per_week: int = 5) -> WorkingCalendar:
    return WorkingCalendar(working_days_per_week=working_days_per_week, holidays=frozenset())


def test_compute_rollup_dates_span_min_start_max_end():
    cal = make_calendar()
    children = [
        RollupChildInput(
            start_date=date(2026, 9, 14),
            end_date=date(2026, 9, 16),
            duration_days=3,
            budgeted_cost=1000,
            percent_complete=50,
        ),
        RollupChildInput(
            start_date=date(2026, 9, 15),
            end_date=date(2026, 9, 21),
            duration_days=5,
            budgeted_cost=1000,
            percent_complete=0,
        ),
    ]
    result = compute_rollup(children, cal)
    assert result.start_date == date(2026, 9, 14)
    assert result.end_date == date(2026, 9, 21)
    # Mon 14 - Mon 21 inclusive, 5-day week: 6 working days.
    assert result.duration_days == 6


def test_compute_rollup_percent_complete_is_duration_weighted_not_cost_weighted():
    # MS Project's convention: a summary task's % complete is weighted by
    # each subtask's own duration, not its cost. Costs are picked here to
    # give a *different* answer if the (old, wrong) cost-weighted formula
    # were used instead (10%), proving cost no longer factors in at all.
    cal = make_calendar()
    children = [
        RollupChildInput(
            start_date=date(2026, 9, 14),
            end_date=date(2026, 9, 14),
            duration_days=1,
            budgeted_cost=9000,
            percent_complete=0,
        ),
        RollupChildInput(
            start_date=date(2026, 9, 14),
            end_date=date(2026, 9, 14),
            duration_days=9,
            budgeted_cost=1000,
            percent_complete=100,
        ),
    ]
    result = compute_rollup(children, cal)
    # Duration-weighted: (0*1 + 100*9) / 10 = 90%.
    assert result.percent_complete == 90
    assert result.budgeted_cost == 10000


def test_compute_rollup_all_zero_duration_children_falls_back_to_plain_average():
    # An all-milestones group (duration 0 each) makes the duration-weighted
    # formula undefined (0/0) — falls back to an unweighted average across
    # children instead of freezing at 0%: (100 + 0) / 2 = 50%.
    cal = make_calendar()
    children = [
        RollupChildInput(
            start_date=date(2026, 9, 14),
            end_date=date(2026, 9, 14),
            duration_days=0,
            budgeted_cost=0,
            percent_complete=100,
        ),
        RollupChildInput(
            start_date=date(2026, 9, 14),
            end_date=date(2026, 9, 14),
            duration_days=0,
            budgeted_cost=0,
            percent_complete=0,
        ),
    ]
    result = compute_rollup(children, cal)
    assert result.percent_complete == 50.0


def test_duration_weighted_percent_complete_weights_by_duration():
    tasks = [
        Task(duration_days=1, percent_complete=0),
        Task(duration_days=9, percent_complete=100),
    ]
    # (0*1 + 100*9) / 10 = 90%.
    assert duration_weighted_percent_complete(tasks) == 90


def test_duration_weighted_percent_complete_falls_back_to_plain_average_when_all_zero_duration():
    tasks = [Task(duration_days=0, percent_complete=100), Task(duration_days=0, percent_complete=0)]
    assert duration_weighted_percent_complete(tasks) == 50.0


def test_duration_weighted_percent_complete_empty_list_is_zero():
    assert duration_weighted_percent_complete([]) == 0.0


def test_compute_rollup_single_child_matches_its_own_fields():
    cal = make_calendar()
    children = [
        RollupChildInput(
            start_date=date(2026, 9, 14),
            end_date=date(2026, 9, 18),
            duration_days=5,
            budgeted_cost=500,
            percent_complete=40,
        )
    ]
    result = compute_rollup(children, cal)
    assert result.start_date == date(2026, 9, 14)
    assert result.end_date == date(2026, 9, 18)
    assert result.duration_days == 5
    assert result.budgeted_cost == 500
    assert result.percent_complete == 40
