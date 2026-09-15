from datetime import date

from app.services.working_calendar import WorkingCalendar


def make_calendar(
    working_days_per_week: int = 5, holidays: list[date] | None = None
) -> WorkingCalendar:
    return WorkingCalendar(
        working_days_per_week=working_days_per_week, holidays=frozenset(holidays or [])
    )


def test_is_working_day_five_day_week():
    cal = make_calendar(5)
    monday = date(2026, 9, 14)
    saturday = date(2026, 9, 19)
    sunday = date(2026, 9, 20)
    assert cal.is_working_day(monday)
    assert not cal.is_working_day(saturday)
    assert not cal.is_working_day(sunday)


def test_is_working_day_six_day_week():
    cal = make_calendar(6)
    saturday = date(2026, 9, 19)
    sunday = date(2026, 9, 20)
    assert cal.is_working_day(saturday)
    assert not cal.is_working_day(sunday)


def test_is_working_day_respects_holidays():
    monday = date(2026, 9, 14)
    cal = make_calendar(5, holidays=[monday])
    assert not cal.is_working_day(monday)


def test_add_working_days_single_day_duration_stays_same_day():
    cal = make_calendar(5)
    monday = date(2026, 9, 14)
    assert cal.add_working_days(monday, 1) == monday


def test_add_working_days_skips_weekend():
    cal = make_calendar(5)
    friday = date(2026, 9, 18)
    # 2 working days starting Friday: Friday + Monday (weekend skipped).
    assert cal.add_working_days(friday, 2) == date(2026, 9, 21)


def test_add_working_days_skips_holiday():
    monday = date(2026, 9, 14)
    tuesday = date(2026, 9, 15)
    cal = make_calendar(5, holidays=[tuesday])
    # 2 working days starting Monday: Monday + Wednesday (Tuesday is a holiday).
    assert cal.add_working_days(monday, 2) == date(2026, 9, 16)


def test_add_working_days_zero_or_negative_duration_returns_start():
    cal = make_calendar(5)
    monday = date(2026, 9, 14)
    assert cal.add_working_days(monday, 0) == monday
    assert cal.add_working_days(monday, -3) == monday


def test_working_days_between_full_week():
    cal = make_calendar(5)
    monday = date(2026, 9, 14)
    following_monday = date(2026, 9, 21)
    # Mon-Fri (5) + following Mon (1) = 6 working days across 8 calendar days.
    assert cal.working_days_between(monday, following_monday) == 6


def test_working_days_between_end_before_start_returns_zero():
    cal = make_calendar(5)
    assert cal.working_days_between(date(2026, 9, 20), date(2026, 9, 14)) == 0
