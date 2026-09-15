"""Critical Path Method (CPM) — spec section 6.1. Pure, DB-free algorithm:
callers (services/task_service.py, the /gantt endpoint) load a project's
tasks + dependencies, call `compute_critical_path`, and persist the results.
Runs synchronously in the same request that creates/edits a task or
dependency — no background worker (see ADR-003)."""

import uuid
from dataclasses import dataclass
from datetime import date

from app.core.enums import DependencyType
from app.services.working_calendar import WorkingCalendar


@dataclass(frozen=True)
class TaskScheduleInput:
    id: uuid.UUID
    start_date: date
    duration_days: int  # 0 for a milestone


@dataclass(frozen=True)
class DependencyEdge:
    predecessor_id: uuid.UUID
    successor_id: uuid.UUID
    dependency_type: DependencyType
    lag_days: int


@dataclass(frozen=True)
class TaskCPMResult:
    task_id: uuid.UUID
    early_start: date
    early_finish: date
    late_start: date
    late_finish: date
    total_float: int
    is_critical: bool


def finish_of(start: date, duration_days: int, calendar: WorkingCalendar) -> date:
    return start if duration_days <= 0 else calendar.add_working_days(start, duration_days)


def start_from_finish(finish: date, duration_days: int, calendar: WorkingCalendar) -> date:
    return (
        finish if duration_days <= 0 else calendar.shift_working_days(finish, -(duration_days - 1))
    )


def _topological_order(task_ids: list[uuid.UUID], edges: list[DependencyEdge]) -> list[uuid.UUID]:
    """Kahn's algorithm. Dependency creation already rejects cycles (section 5's
    DFS check), so a cycle here would only happen from a data inconsistency —
    any leftover nodes are appended in their original order as a fallback
    rather than raising, so CPM degrades gracefully instead of 500ing."""
    in_degree = {task_id: 0 for task_id in task_ids}
    successors: dict[uuid.UUID, list[uuid.UUID]] = {task_id: [] for task_id in task_ids}
    for edge in edges:
        if edge.predecessor_id not in in_degree or edge.successor_id not in in_degree:
            continue
        successors[edge.predecessor_id].append(edge.successor_id)
        in_degree[edge.successor_id] += 1

    queue = [task_id for task_id in task_ids if in_degree[task_id] == 0]
    ordered: list[uuid.UUID] = []
    while queue:
        node = queue.pop(0)
        ordered.append(node)
        for succ in successors[node]:
            in_degree[succ] -= 1
            if in_degree[succ] == 0:
                queue.append(succ)

    if len(ordered) != len(task_ids):
        remaining = [t for t in task_ids if t not in ordered]
        ordered.extend(remaining)
    return ordered


def forward_constraint(
    dependency_type: DependencyType,
    lag_days: int,
    pred_es: date,
    pred_ef: date,
    succ_duration: int,
    calendar: WorkingCalendar,
) -> date:
    """Minimum early_start the successor may take because of this one dependency."""
    if dependency_type == DependencyType.FS:
        return calendar.shift_working_days(pred_ef, lag_days)
    if dependency_type == DependencyType.SS:
        return calendar.shift_working_days(pred_es, lag_days)
    if dependency_type == DependencyType.FF:
        min_ef = calendar.shift_working_days(pred_ef, lag_days)
        return start_from_finish(min_ef, succ_duration, calendar)
    # SF
    min_ef = calendar.shift_working_days(pred_es, lag_days)
    return start_from_finish(min_ef, succ_duration, calendar)


def _backward_constraint(
    dependency_type: DependencyType,
    lag_days: int,
    succ_ls: date,
    succ_lf: date,
    pred_duration: int,
    calendar: WorkingCalendar,
) -> date:
    """Maximum late_finish the predecessor may take because of this one dependency."""
    if dependency_type == DependencyType.FS:
        return calendar.shift_working_days(succ_ls, -lag_days)
    if dependency_type == DependencyType.FF:
        return calendar.shift_working_days(succ_lf, -lag_days)
    if dependency_type == DependencyType.SS:
        max_ls = calendar.shift_working_days(succ_ls, -lag_days)
        return finish_of(max_ls, pred_duration, calendar)
    # SF
    max_ls = calendar.shift_working_days(succ_lf, -lag_days)
    return finish_of(max_ls, pred_duration, calendar)


def compute_critical_path(
    tasks: list[TaskScheduleInput], dependencies: list[DependencyEdge], calendar: WorkingCalendar
) -> list[TaskCPMResult]:
    if not tasks:
        return []

    by_id = {task.id: task for task in tasks}
    task_ids = list(by_id.keys())
    order = _topological_order(task_ids, dependencies)

    predecessors_of: dict[uuid.UUID, list[DependencyEdge]] = {tid: [] for tid in task_ids}
    successors_of: dict[uuid.UUID, list[DependencyEdge]] = {tid: [] for tid in task_ids}
    for edge in dependencies:
        if edge.predecessor_id not in by_id or edge.successor_id not in by_id:
            continue
        predecessors_of[edge.successor_id].append(edge)
        successors_of[edge.predecessor_id].append(edge)

    early_start: dict[uuid.UUID, date] = {}
    early_finish: dict[uuid.UUID, date] = {}

    for task_id in order:
        task = by_id[task_id]
        preds = predecessors_of[task_id]
        if not preds:
            es = task.start_date
        else:
            candidates = [
                forward_constraint(
                    edge.dependency_type,
                    edge.lag_days,
                    early_start[edge.predecessor_id],
                    early_finish[edge.predecessor_id],
                    task.duration_days,
                    calendar,
                )
                for edge in preds
            ]
            es = max([*candidates, task.start_date])
        early_start[task_id] = es
        early_finish[task_id] = finish_of(es, task.duration_days, calendar)

    project_finish = max(early_finish.values())

    late_start: dict[uuid.UUID, date] = {}
    late_finish: dict[uuid.UUID, date] = {}

    for task_id in reversed(order):
        task = by_id[task_id]
        succs = successors_of[task_id]
        if not succs:
            lf = project_finish
        else:
            candidates = [
                _backward_constraint(
                    edge.dependency_type,
                    edge.lag_days,
                    late_start[edge.successor_id],
                    late_finish[edge.successor_id],
                    task.duration_days,
                    calendar,
                )
                for edge in succs
            ]
            lf = min(candidates)
        late_finish[task_id] = lf
        late_start[task_id] = start_from_finish(lf, task.duration_days, calendar)

    results = []
    for task_id in task_ids:
        es, ef = early_start[task_id], early_finish[task_id]
        ls, lf = late_start[task_id], late_finish[task_id]
        total_float = calendar.working_day_offset(es, ls)
        results.append(
            TaskCPMResult(
                task_id=task_id,
                early_start=es,
                early_finish=ef,
                late_start=ls,
                late_finish=lf,
                total_float=total_float,
                is_critical=total_float <= 0,
            )
        )
    return results
