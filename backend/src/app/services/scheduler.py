"""Cascade rescheduling — spec section 6.2. When a task's start_date/duration
changes, walk its successors and push any that now violate their dependency
constraint forward (never backward — a successor that already starts later
than required keeps whatever slack a PM deliberately gave it), propagating
recursively. Runs synchronously in the same request (see ADR-003), like
services/critical_path.py, which it reuses for the constraint formulas."""

import uuid
from dataclasses import dataclass
from datetime import date

from app.services.critical_path import DependencyEdge, finish_of, forward_constraint
from app.services.working_calendar import WorkingCalendar


@dataclass
class TaskScheduleState:
    id: uuid.UUID
    start_date: date
    end_date: date
    duration_days: int


def reschedule_successors(
    changed_task_id: uuid.UUID,
    tasks_by_id: dict[uuid.UUID, TaskScheduleState],
    dependencies: list[DependencyEdge],
    calendar: WorkingCalendar,
) -> list[uuid.UUID]:
    """Mutates `tasks_by_id` in place (moving `start_date`/`end_date` forward
    where required) and returns the ids of every task it actually changed,
    so the caller knows which rows to persist. `changed_task_id` itself is
    never modified here — it's the trigger, already carrying its new dates."""
    successors_of: dict[uuid.UUID, list[DependencyEdge]] = {}
    for edge in dependencies:
        successors_of.setdefault(edge.predecessor_id, []).append(edge)

    changed: list[uuid.UUID] = []
    queue = [changed_task_id]
    seen_in_queue = {changed_task_id}

    while queue:
        current_id = queue.pop(0)
        current = tasks_by_id.get(current_id)
        if current is None:
            continue

        for edge in successors_of.get(current_id, []):
            successor = tasks_by_id.get(edge.successor_id)
            if successor is None:
                continue

            required_start = forward_constraint(
                edge.dependency_type,
                edge.lag_days,
                current.start_date,
                current.end_date,
                successor.duration_days,
                calendar,
            )
            if required_start > successor.start_date:
                successor.start_date = required_start
                successor.end_date = finish_of(required_start, successor.duration_days, calendar)
                changed.append(successor.id)
                if successor.id not in seen_in_queue:
                    queue.append(successor.id)
                    seen_in_queue.add(successor.id)

    return changed
