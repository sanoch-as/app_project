import uuid
from datetime import date

from app.core.enums import DependencyType
from app.services.critical_path import (
    DependencyEdge,
    TaskScheduleInput,
    compute_critical_path,
)
from app.services.working_calendar import WorkingCalendar

CAL = WorkingCalendar(working_days_per_week=5, holidays=frozenset())

A, B, C, D = (uuid.uuid4() for _ in range(4))


def result_by_id(results, task_id):
    return next(r for r in results if r.task_id == task_id)


def test_single_task_no_dependencies_is_critical_with_zero_float():
    tasks = [TaskScheduleInput(id=A, start_date=date(2026, 9, 14), duration_days=3)]
    results = compute_critical_path(tasks, [], CAL)
    r = result_by_id(results, A)
    assert r.early_start == date(2026, 9, 14)
    assert r.early_finish == date(2026, 9, 16)
    assert r.late_start == r.early_start
    assert r.late_finish == r.early_finish
    assert r.total_float == 0
    assert r.is_critical


def test_linear_fs_chain_has_zero_float_throughout():
    # A (Mon-Wed, 3d) -> B (3d) -> C (3d), all FS lag 0: a straight critical chain.
    tasks = [
        TaskScheduleInput(id=A, start_date=date(2026, 9, 14), duration_days=3),
        TaskScheduleInput(id=B, start_date=date(2026, 9, 14), duration_days=3),
        TaskScheduleInput(id=C, start_date=date(2026, 9, 14), duration_days=3),
    ]
    deps = [
        DependencyEdge(A, B, DependencyType.FS, 0),
        DependencyEdge(B, C, DependencyType.FS, 0),
    ]
    results = compute_critical_path(tasks, deps, CAL)
    a, b, c = result_by_id(results, A), result_by_id(results, B), result_by_id(results, C)

    assert a.early_finish == date(2026, 9, 16)  # Mon-Wed
    assert b.early_start == date(2026, 9, 16)  # FS lag 0: starts the day A finishes
    assert b.early_finish == date(2026, 9, 18)
    assert c.early_start == date(2026, 9, 18)
    for r in (a, b, c):
        assert r.total_float == 0
        assert r.is_critical


def test_fs_lag_pushes_successor_start_forward():
    tasks = [
        TaskScheduleInput(id=A, start_date=date(2026, 9, 14), duration_days=1),
        TaskScheduleInput(id=B, start_date=date(2026, 9, 14), duration_days=1),
    ]
    deps = [DependencyEdge(A, B, DependencyType.FS, 2)]
    results = compute_critical_path(tasks, deps, CAL)
    b = result_by_id(results, B)
    # A finishes Mon 9/14; +2 working days = Wed 9/16.
    assert b.early_start == date(2026, 9, 16)


def test_negative_lag_allows_overlap():
    tasks = [
        TaskScheduleInput(id=A, start_date=date(2026, 9, 14), duration_days=5),
        TaskScheduleInput(id=B, start_date=date(2026, 9, 14), duration_days=1),
    ]
    deps = [DependencyEdge(A, B, DependencyType.FS, -2)]
    results = compute_critical_path(tasks, deps, CAL)
    a, b = result_by_id(results, A), result_by_id(results, B)
    # A: Mon-Fri (9/14-9/18). FS lag -2: B can start 2 working days before A finishes.
    assert a.early_finish == date(2026, 9, 18)
    assert b.early_start == date(2026, 9, 16)


def test_ss_dependency_constrains_start_not_finish():
    tasks = [
        TaskScheduleInput(id=A, start_date=date(2026, 9, 14), duration_days=5),
        TaskScheduleInput(id=B, start_date=date(2026, 9, 14), duration_days=1),
    ]
    deps = [DependencyEdge(A, B, DependencyType.SS, 1)]
    results = compute_critical_path(tasks, deps, CAL)
    b = result_by_id(results, B)
    # SS lag 1: B starts 1 working day after A starts (Mon 9/14 -> Tue 9/15).
    assert b.early_start == date(2026, 9, 15)


def test_ff_dependency_constrains_finish():
    tasks = [
        TaskScheduleInput(id=A, start_date=date(2026, 9, 14), duration_days=3),
        TaskScheduleInput(id=B, start_date=date(2026, 9, 14), duration_days=1),
    ]
    deps = [DependencyEdge(A, B, DependencyType.FF, 0)]
    results = compute_critical_path(tasks, deps, CAL)
    a, b = result_by_id(results, A), result_by_id(results, B)
    # A finishes Wed 9/16; FF lag 0 forces B (1-day task) to finish on 9/16 too.
    assert a.early_finish == date(2026, 9, 16)
    assert b.early_finish == date(2026, 9, 16)
    assert b.early_start == date(2026, 9, 16)


def test_parallel_paths_produce_float_on_shorter_path():
    # A -> B -> D (long path, 3 + 3 = 6 days)
    # A -> C -> D (short path, 1 + 1 = 2 days) — C/that path should have float.
    tasks = [
        TaskScheduleInput(id=A, start_date=date(2026, 9, 14), duration_days=1),
        TaskScheduleInput(id=B, start_date=date(2026, 9, 14), duration_days=3),
        TaskScheduleInput(id=C, start_date=date(2026, 9, 14), duration_days=1),
        TaskScheduleInput(id=D, start_date=date(2026, 9, 14), duration_days=1),
    ]
    deps = [
        DependencyEdge(A, B, DependencyType.FS, 0),
        DependencyEdge(A, C, DependencyType.FS, 0),
        DependencyEdge(B, D, DependencyType.FS, 0),
        DependencyEdge(C, D, DependencyType.FS, 0),
    ]
    results = compute_critical_path(tasks, deps, CAL)
    a, b, c, d = (result_by_id(results, x) for x in (A, B, C, D))

    assert a.is_critical
    assert b.is_critical
    assert d.is_critical
    assert not c.is_critical
    assert c.total_float > 0


def test_milestone_has_matching_early_start_and_finish():
    tasks = [
        TaskScheduleInput(id=A, start_date=date(2026, 9, 14), duration_days=1),
        TaskScheduleInput(id=B, start_date=date(2026, 9, 14), duration_days=0),
    ]
    deps = [DependencyEdge(A, B, DependencyType.FS, 0)]
    results = compute_critical_path(tasks, deps, CAL)
    b = result_by_id(results, B)
    assert b.early_start == b.early_finish


def test_multiple_predecessors_take_the_most_restrictive_constraint():
    tasks = [
        TaskScheduleInput(id=A, start_date=date(2026, 9, 14), duration_days=5),  # ends 9/18
        TaskScheduleInput(id=B, start_date=date(2026, 9, 14), duration_days=1),  # ends 9/14
        TaskScheduleInput(id=C, start_date=date(2026, 9, 14), duration_days=1),
    ]
    deps = [
        DependencyEdge(A, C, DependencyType.FS, 0),
        DependencyEdge(B, C, DependencyType.FS, 0),
    ]
    results = compute_critical_path(tasks, deps, CAL)
    c = result_by_id(results, C)
    # C must wait for the longer predecessor A (finishes 9/18), not the shorter B.
    assert c.early_start == date(2026, 9, 18)
