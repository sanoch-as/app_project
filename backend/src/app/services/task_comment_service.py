import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UserRole
from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.security import CurrentUser
from app.models.task_comment import TaskComment
from app.repositories import task_comment_repository, task_repository
from app.services import project_service


async def create_comment(
    db: AsyncSession, current_user: CurrentUser, task_id: uuid.UUID, *, body: str
) -> TaskComment:
    task = await task_repository.get_by_id(db, current_user.organization_id, task_id)
    if task is None:
        raise NotFoundError("Task not found")
    await project_service.get_project_for_user(db, current_user, task.project_id)

    comment = await task_comment_repository.create(
        db, task_id=task_id, user_id=current_user.id, body=body
    )
    await db.commit()
    return comment


def _assert_can_delete(current_user: CurrentUser, comment: TaskComment) -> None:
    if current_user.role != UserRole.ADMIN and comment.user_id != current_user.id:
        raise ForbiddenError("You can only delete your own comments")


async def delete_comment(
    db: AsyncSession, current_user: CurrentUser, comment_id: uuid.UUID
) -> None:
    comment = await task_comment_repository.get_by_id_in_org(
        db, current_user.organization_id, comment_id
    )
    if comment is None:
        raise NotFoundError("Comment not found")
    _assert_can_delete(current_user, comment)
    await task_comment_repository.delete(db, comment)
    await db.commit()


async def list_task_comments(
    db: AsyncSession, current_user: CurrentUser, task_id: uuid.UUID, *, limit: int, offset: int
) -> tuple[list[TaskComment], int]:
    task = await task_repository.get_by_id(db, current_user.organization_id, task_id)
    if task is None:
        raise NotFoundError("Task not found")
    await project_service.get_project_for_user(db, current_user, task.project_id)
    return await task_comment_repository.list_by_task(db, task_id, limit=limit, offset=offset)
