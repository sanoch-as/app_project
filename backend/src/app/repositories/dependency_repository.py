import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import DependencyType
from app.models.dependency import TaskDependency
from app.models.task import Task


async def get_by_id(db: AsyncSession, dependency_id: uuid.UUID) -> TaskDependency | None:
    result = await db.execute(select(TaskDependency).where(TaskDependency.id == dependency_id))
    return result.scalar_one_or_none()


async def list_by_project(db: AsyncSession, project_id: uuid.UUID) -> list[TaskDependency]:
    """Every dependency between two tasks of this project — used by the CPM
    engine, which needs the whole graph in one query (section 6.1)."""
    result = await db.execute(
        select(TaskDependency)
        .join(Task, Task.id == TaskDependency.predecessor_id)
        .where(Task.project_id == project_id)
    )
    return list(result.scalars().all())


async def get_by_pair(
    db: AsyncSession, predecessor_id: uuid.UUID, successor_id: uuid.UUID
) -> TaskDependency | None:
    result = await db.execute(
        select(TaskDependency).where(
            TaskDependency.predecessor_id == predecessor_id,
            TaskDependency.successor_id == successor_id,
        )
    )
    return result.scalar_one_or_none()


async def create(
    db: AsyncSession,
    *,
    predecessor_id: uuid.UUID,
    successor_id: uuid.UUID,
    dependency_type: DependencyType,
    lag_days: int,
    created_by_jira_import: bool = False,
) -> TaskDependency:
    dependency = TaskDependency(
        predecessor_id=predecessor_id,
        successor_id=successor_id,
        dependency_type=dependency_type,
        lag_days=lag_days,
        created_by_jira_import=created_by_jira_import,
    )
    db.add(dependency)
    await db.flush()
    return dependency


async def delete(db: AsyncSession, dependency: TaskDependency) -> None:
    await db.delete(dependency)
    await db.flush()


async def delete_jira_import_generated_for_project(db: AsyncSession, project_id: uuid.UUID) -> None:
    """Wipes only the auto-generated sequential dependencies a previous Jira
    import created for this project (see ADR-034 follow-up), so a resync can
    rebuild them from the current CSV order without ever touching a
    dependency the user added by hand."""
    result = await db.execute(
        select(TaskDependency)
        .join(Task, Task.id == TaskDependency.predecessor_id)
        .where(Task.project_id == project_id, TaskDependency.created_by_jira_import.is_(True))
    )
    for dependency in result.scalars().all():
        await db.delete(dependency)
    await db.flush()
