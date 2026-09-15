import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UserRole
from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.security import CurrentUser
from app.models.worklog import Worklog
from app.repositories import task_repository, worklog_repository
from app.services import project_service


async def create_worklog(
    db: AsyncSession,
    current_user: CurrentUser,
    task_id: uuid.UUID,
    *,
    work_date: date,
    hours: float,
    description: str | None,
) -> Worklog:
    task = await task_repository.get_by_id(db, current_user.organization_id, task_id)
    if task is None:
        raise NotFoundError("Task not found")
    await project_service.get_project_for_user(db, current_user, task.project_id)

    worklog = await worklog_repository.create(
        db,
        task_id=task_id,
        user_id=current_user.id,
        work_date=work_date,
        hours=hours,
        description=description,
    )
    await db.commit()
    return worklog


def _assert_can_modify(current_user: CurrentUser, worklog: Worklog) -> None:
    if current_user.role != UserRole.ADMIN and worklog.user_id != current_user.id:
        raise ForbiddenError("You can only modify your own worklogs")


async def update_worklog(
    db: AsyncSession, current_user: CurrentUser, worklog_id: uuid.UUID, **fields: object
) -> Worklog:
    worklog = await worklog_repository.get_by_id_in_org(
        db, current_user.organization_id, worklog_id
    )
    if worklog is None:
        raise NotFoundError("Worklog not found")
    _assert_can_modify(current_user, worklog)

    updated = await worklog_repository.update(db, worklog, **fields)
    await db.commit()
    return updated


async def delete_worklog(
    db: AsyncSession, current_user: CurrentUser, worklog_id: uuid.UUID
) -> None:
    worklog = await worklog_repository.get_by_id_in_org(
        db, current_user.organization_id, worklog_id
    )
    if worklog is None:
        raise NotFoundError("Worklog not found")
    _assert_can_modify(current_user, worklog)
    await worklog_repository.delete(db, worklog)
    await db.commit()


async def list_task_worklogs(
    db: AsyncSession, current_user: CurrentUser, task_id: uuid.UUID, *, limit: int, offset: int
) -> tuple[list[Worklog], int]:
    task = await task_repository.get_by_id(db, current_user.organization_id, task_id)
    if task is None:
        raise NotFoundError("Task not found")
    await project_service.get_project_for_user(db, current_user, task.project_id)
    return await worklog_repository.list_by_task(db, task_id, limit=limit, offset=offset)
