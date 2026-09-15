"""Basic project working calendar (spec section 4.1 point 5): `working_days_per_week`
working days starting Monday, plus an explicit holiday list. Shared by task
scheduling (this phase) and the CPM engine (services/critical_path.py,
services/scheduler.py) so both agree on what a "working day" is. See ADR-015."""

from dataclasses import dataclass
from datetime import date, timedelta


@dataclass(frozen=True)
class WorkingCalendar:
    working_days_per_week: int
    holidays: frozenset[date]

    def is_working_day(self, day: date) -> bool:
        # date.weekday(): Monday=0 ... Sunday=6. The first N weekdays (Mon-first)
        # are working days — see ADR-015 for why a count, not a weekday mask.
        if day.weekday() >= self.working_days_per_week:
            return False
        return day not in self.holidays

    def add_working_days(self, start: date, duration_days: int) -> date:
        """The date `duration_days - 1` working days after `start` (a 1-day
        duration ends the same day it starts). `duration_days <= 0` returns `start`."""
        if duration_days <= 1:
            return start
        remaining = duration_days - 1
        current = start
        while remaining > 0:
            current += timedelta(days=1)
            if self.is_working_day(current):
                remaining -= 1
        return current

    def working_days_between(self, start: date, end: date) -> int:
        """Inclusive count of working days from `start` to `end` (>= start)."""
        if end < start:
            return 0
        count = 0
        current = start
        while current <= end:
            if self.is_working_day(current):
                count += 1
            current += timedelta(days=1)
        return count
