from datetime import date

from app.models.task import Task
from app.services.rollup import RollupChildInput, compute_rollup, duration_weighted_percent_complete
from app.services.working_calendar import WorkingCalendar


def make_calendar(working_days_per_week: int = 5) -> WorkingCalendar:
    return WorkingCalendar(working_days_per_week=working_days_per_week, holidays=frozenset())


def _child(
    *,
    start_date: date,
    end_date: date,
    duration_days: int,
    budgeted_cost: float,
    percent_complete: float,
    leaf_duration_days: int | None = None,
) -> RollupChildInput:
    """`leaf_duration_days` defaults to `duration_days` — the two only need
    to differ in tests that specifically exercise the gap/span distinction
    (see ADR-037)."""
    return RollupChildInput(
        start_date=start_date,
        end_date=end_date,
        duration_days=duration_days,
        budgeted_cost=budgeted_cost,
        percent_complete=percent_complete,
        leaf_duration_days=leaf_duration_days if leaf_duration_days is not None else duration_days,
    )


def test_compute_rollup_dates_span_min_start_max_end():
    cal = make_calendar()
    children = [
        _child(
            start_date=date(2026, 9, 14),
            end_date=date(2026, 9, 16),
            duration_days=3,
            budgeted_cost=1000,
            percent_complete=50,
        ),
        _child(
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
        _child(
            start_date=date(2026, 9, 14),
            end_date=date(2026, 9, 14),
            duration_days=1,
            budgeted_cost=9000,
            percent_complete=0,
        ),
        _child(
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


def test_compute_rollup_weights_by_leaf_duration_not_span():
    # This is the ADR-037 fix: weighting by duration_days (a child's own
    # calendar span) instead of leaf_duration_days (its true underlying leaf
    # work) would give a different, wrong answer whenever a parent's span is
    # inflated by a gap between its own children. Child A is itself a parent
    # whose span is 10 days (a gap inflates it) but whose real leaf work is
    # only 2 days; child B is a genuine 8-day leaf.
    cal = make_calendar()
    children = [
        _child(
            start_date=date(2026, 9, 14),
            end_date=date(2026, 9, 25),  # 10 working-day span, gap-inflated
            duration_days=10,
            leaf_duration_days=2,  # but only 2 days of real leaf work inside
            budgeted_cost=0,
            percent_complete=100,
        ),
        _child(
            start_date=date(2026, 9, 14),
            end_date=date(2026, 9, 23),
            duration_days=8,
            leaf_duration_days=8,
            budgeted_cost=0,
            percent_complete=0,
        ),
    ]
    result = compute_rollup(children, cal)
    # Weighted by leaf_duration_days: (100*2 + 0*8) / (2+8) = 20%.
    # The old, buggy span-weighted formula would give (100*10 + 0*8)/18 ≈ 55.6%.
    assert result.percent_complete == 20.0
    assert result.leaf_duration_days == 10


def test_compute_rollup_all_zero_duration_children_falls_back_to_plain_average():
    # An all-milestones group (leaf duration 0 each) makes the
    # duration-weighted formula undefined (0/0) — falls back to an
    # unweighted average across children instead of freezing at 0%:
    # (100 + 0) / 2 = 50%.
    cal = make_calendar()
    children = [
        _child(
            start_date=date(2026, 9, 14),
            end_date=date(2026, 9, 14),
            duration_days=0,
            budgeted_cost=0,
            percent_complete=100,
        ),
        _child(
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
        _child(
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
    assert result.leaf_duration_days == 5
