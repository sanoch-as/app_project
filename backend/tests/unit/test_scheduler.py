import uuid
from datetime import date

from app.core.enums import DependencyType
from app.services.critical_path import DependencyEdge
from app.services.scheduler import TaskScheduleState, reschedule_successors
from app.services.working_calendar import WorkingCalendar

CAL = WorkingCalendar(working_days_per_week=5, holidays=frozenset())

A, B, C = (uuid.uuid4() for _ in range(3))


def make_state(task_id, start, duration_days) -> TaskScheduleState:
    return TaskScheduleState(
        id=task_id,
        start_date=start,
        end_date=CAL.add_working_days(start, duration_days),
        duration_days=duration_days,
    )


def test_pushing_predecessor_later_cascades_to_successor():
    tasks = {
        A: make_state(A, date(2026, 9, 14), 1),
        B: make_state(B, date(2026, 9, 15), 1),  # currently right after A
    }
    deps = [DependencyEdge(A, B, DependencyType.FS, 0)]

    # Move A two working days later; B must follow since it would otherwise
    # start before A finishes.
    tasks[A].start_date = date(2026, 9, 16)
    tasks[A].end_date = date(2026, 9, 16)

    changed = reschedule_successors(A, tasks, deps, CAL)

    assert B in changed
    assert tasks[B].start_date == date(2026, 9, 16)


def test_successor_with_existing_slack_is_not_pulled_earlier():
    tasks = {
        A: make_state(A, date(2026, 9, 14), 1),
        B: make_state(B, date(2026, 9, 21), 1),  # already scheduled well after A
    }
    deps = [DependencyEdge(A, B, DependencyType.FS, 0)]

    changed = reschedule_successors(A, tasks, deps, CAL)

    assert changed == []
    assert tasks[B].start_date == date(2026, 9, 21)


def test_cascade_propagates_through_multiple_levels():
    tasks = {
        A: make_state(A, date(2026, 9, 14), 1),
        B: make_state(B, date(2026, 9, 15), 1),
        C: make_state(C, date(2026, 9, 16), 1),
    }
    deps = [
        DependencyEdge(A, B, DependencyType.FS, 0),
        DependencyEdge(B, C, DependencyType.FS, 0),
    ]

    tasks[A].start_date = date(2026, 9, 18)  # a Friday
    tasks[A].end_date = date(2026, 9, 18)

    changed = reschedule_successors(A, tasks, deps, CAL)

    # FS lag 0 is "EF_predecessor + 0", i.e. same-day is allowed (spec section
    # 6.1's literal formula) — both 1-day successors land on the same Friday.
    assert set(changed) == {B, C}
    assert tasks[B].start_date == date(2026, 9, 18)
    assert tasks[C].start_date == date(2026, 9, 18)


def test_no_dependencies_means_no_cascade():
    tasks = {A: make_state(A, date(2026, 9, 14), 1)}
    changed = reschedule_successors(A, tasks, [], CAL)
    assert changed == []
