from datetime import date

from app.services.rollup import RollupChildInput, compute_rollup
from app.services.working_calendar import WorkingCalendar


def make_calendar(working_days_per_week: int = 5) -> WorkingCalendar:
    return WorkingCalendar(working_days_per_week=working_days_per_week, holidays=frozenset())


def test_compute_rollup_dates_span_min_start_max_end():
    cal = make_calendar()
    children = [
        RollupChildInput(
            start_date=date(2026, 9, 14),
            end_date=date(2026, 9, 16),
            budgeted_cost=1000,
            percent_complete=50,
        ),
        RollupChildInput(
            start_date=date(2026, 9, 15),
            end_date=date(2026, 9, 21),
            budgeted_cost=1000,
            percent_complete=0,
        ),
    ]
    result = compute_rollup(children, cal)
    assert result.start_date == date(2026, 9, 14)
    assert result.end_date == date(2026, 9, 21)
    # Mon 14 - Mon 21 inclusive, 5-day week: 6 working days.
    assert result.duration_days == 6


def test_compute_rollup_percent_complete_is_cost_weighted():
    cal = make_calendar()
    children = [
        RollupChildInput(
            start_date=date(2026, 9, 14),
            end_date=date(2026, 9, 14),
            budgeted_cost=9000,
            percent_complete=0,
        ),
        RollupChildInput(
            start_date=date(2026, 9, 14),
            end_date=date(2026, 9, 14),
            budgeted_cost=1000,
            percent_complete=100,
        ),
    ]
    result = compute_rollup(children, cal)
    # EV = 0*9000 + 1*1000 = 1000; total cost = 10000 -> 10%.
    assert result.percent_complete == 10
    assert result.budgeted_cost == 10000


def test_compute_rollup_zero_cost_children_is_zero_percent_not_a_division_error():
    cal = make_calendar()
    children = [
        RollupChildInput(
            start_date=date(2026, 9, 14),
            end_date=date(2026, 9, 15),
            budgeted_cost=0,
            percent_complete=100,
        ),
        RollupChildInput(
            start_date=date(2026, 9, 14),
            end_date=date(2026, 9, 15),
            budgeted_cost=0,
            percent_complete=0,
        ),
    ]
    result = compute_rollup(children, cal)
    assert result.percent_complete == 0.0
    assert result.budgeted_cost == 0


def test_compute_rollup_single_child_matches_its_own_fields():
    cal = make_calendar()
    children = [
        RollupChildInput(
            start_date=date(2026, 9, 14),
            end_date=date(2026, 9, 18),
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
