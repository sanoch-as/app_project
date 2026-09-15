import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import DependencyType
from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.core.security import CurrentUser
from app.models.dependency import TaskDependency
from app.repositories import dependency_repository, task_repository
from app.services import project_service, schedule_service


def _would_create_cycle(
    existing_edges: list[tuple[uuid.UUID, uuid.UUID]],
    new_predecessor: uuid.UUID,
    new_successor: uuid.UUID,
) -> bool:
    """DFS cycle check (spec section 5): a new predecessor->successor edge
    creates a cycle iff successor can already reach predecessor."""
    adjacency: dict[uuid.UUID, list[uuid.UUID]] = {}
    for pred, succ in existing_edges:
        adjacency.setdefault(pred, []).append(succ)

    visited: set[uuid.UUID] = set()
    stack = [new_successor]
    while stack:
        node = stack.pop()
        if node == new_predecessor:
            return True
        if node in visited:
            continue
        visited.add(node)
        stack.extend(adjacency.get(node, []))
    return False


async def create_dependency(
    db: AsyncSession,
    current_user: CurrentUser,
    task_id: uuid.UUID,
    *,
    successor_id: uuid.UUID,
    dependency_type: DependencyType,
    lag_days: int,
) -> TaskDependency:
    predecessor = await task_repository.get_by_id(db, current_user.organization_id, task_id)
    if predecessor is None:
        raise NotFoundError("Task not found")
    project = await project_service.get_project_for_user(db, current_user, predecessor.project_id)

    if successor_id == task_id:
        raise ValidationAppError("A task cannot depend on itself")

    successor = await task_repository.get_by_id_in_project(db, predecessor.project_id, successor_id)
    if successor is None:
        raise ValidationAppError("successor_id does not belong to the same project")

    if await dependency_repository.get_by_pair(db, task_id, successor_id) is not None:
        raise ConflictError("This dependency already exists", code="dependency_exists")

    existing = await dependency_repository.list_by_project(db, predecessor.project_id)
    edges = [(d.predecessor_id, d.successor_id) for d in existing]
    if _would_create_cycle(edges, task_id, successor_id):
        raise ValidationAppError(
            "This dependency would create a cycle in the task schedule", code="dependency_cycle"
        )

    dependency = await dependency_repository.create(
        db,
        predecessor_id=task_id,
        successor_id=successor_id,
        dependency_type=dependency_type,
        lag_days=lag_days,
    )
    calendar = await schedule_service.get_calendar(db, project)
    await schedule_service.recalculate_schedule(db, project, calendar, changed_task_id=task_id)
    await db.commit()
    return dependency


async def delete_dependency(
    db: AsyncSession, current_user: CurrentUser, dependency_id: uuid.UUID
) -> None:
    dependency = await dependency_repository.get_by_id(db, dependency_id)
    if dependency is None:
        raise NotFoundError("Dependency not found")
    predecessor = await task_repository.get_by_id(
        db, current_user.organization_id, dependency.predecessor_id
    )
    if predecessor is None:
        raise NotFoundError("Dependency not found")
    project = await project_service.get_project_for_user(db, current_user, predecessor.project_id)
    await dependency_repository.delete(db, dependency)
    # No cascade needed: removing a constraint only ever loosens the schedule,
    # it never requires pushing a successor forward. CPM float/critical flags
    # still need a fresh recompute since the graph changed.
    calendar = await schedule_service.get_calendar(db, project)
    await schedule_service.recalculate_schedule(db, project, calendar)
    await db.commit()
