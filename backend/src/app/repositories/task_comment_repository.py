import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.task import Task
from app.models.task_comment import TaskComment


async def get_by_id_in_org(
    db: AsyncSession, organization_id: uuid.UUID, comment_id: uuid.UUID
) -> TaskComment | None:
    result = await db.execute(
        select(TaskComment)
        .join(Task, Task.id == TaskComment.task_id)
        .join(Project, Project.id == Task.project_id)
        .where(TaskComment.id == comment_id, Project.organization_id == organization_id)
    )
    return result.scalar_one_or_none()


async def list_by_task(
    db: AsyncSession, task_id: uuid.UUID, *, limit: int, offset: int
) -> tuple[list[TaskComment], int]:
    base_query = select(TaskComment).where(TaskComment.task_id == task_id)
    total = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar_one()
    result = await db.execute(
        base_query.order_by(TaskComment.created_at.asc()).limit(limit).offset(offset)
    )
    return list(result.scalars().all()), total


async def create(
    db: AsyncSession, *, task_id: uuid.UUID, user_id: uuid.UUID, body: str
) -> TaskComment:
    comment = TaskComment(task_id=task_id, user_id=user_id, body=body)
    db.add(comment)
    await db.flush()
    return comment


async def delete(db: AsyncSession, comment: TaskComment) -> None:
    await db.delete(comment)
    await db.flush()
