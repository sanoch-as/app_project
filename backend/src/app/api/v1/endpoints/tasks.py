import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.enums import TaskStatus
from app.core.exceptions import NotFoundError
from app.core.security import CurrentUser, get_current_user
from app.repositories import task_repository
from app.schemas.common import Page
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate
from app.services import project_service, task_service

# No single prefix: this module serves both /projects/{id}/tasks and /tasks/{id}
# (section 7 lists both shapes under the same file).
router = APIRouter(tags=["tasks"])


@router.get("/projects/{project_id}/tasks", response_model=Page[TaskRead])
async def list_tasks(
    project_id: uuid.UUID,
    status_filter: TaskStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page[TaskRead]:
    await project_service.get_project_for_user(db, current_user, project_id)
    tasks, total = await task_repository.list_by_project(
        db, project_id, status=status_filter, limit=limit, offset=offset
    )
    return Page[TaskRead](
        items=[TaskRead.model_validate(t) for t in tasks], total=total, limit=limit, offset=offset
    )


@router.post(
    "/projects/{project_id}/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED
)
async def create_task(
    project_id: uuid.UUID,
    payload: TaskCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskRead:
    task = await task_service.create_task(
        db,
        current_user,
        project_id,
        parent_task_id=payload.parent_task_id,
        name=payload.name,
        description=payload.description,
        start_date=payload.start_date,
        duration_days=payload.duration_days,
        is_milestone=payload.is_milestone,
        priority=payload.priority,
        estimated_hours=payload.estimated_hours,
        budgeted_cost=payload.budgeted_cost,
        assignees=payload.assignees,
    )
    return TaskRead.model_validate(task)


@router.get("/tasks/{task_id}", response_model=TaskRead)
async def get_task(
    task_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskRead:
    task = await task_repository.get_by_id(db, current_user.organization_id, task_id)
    if task is None:
        raise NotFoundError("Task not found")
    await project_service.get_project_for_user(db, current_user, task.project_id)
    return TaskRead.model_validate(task)


@router.patch("/tasks/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: uuid.UUID,
    payload: TaskUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskRead:
    task = await task_repository.get_by_id(db, current_user.organization_id, task_id)
    if task is None:
        raise NotFoundError("Task not found")
    project = await project_service.get_project_for_user(db, current_user, task.project_id)

    fields = payload.model_dump(exclude_unset=True, exclude={"assignees"})
    updated = await task_service.update_task(
        db, current_user, task, project, fields=fields, assignees=payload.assignees
    )
    return TaskRead.model_validate(updated)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    task = await task_repository.get_by_id(db, current_user.organization_id, task_id)
    if task is None:
        raise NotFoundError("Task not found")
    await project_service.get_project_for_user(db, current_user, task.project_id)
    await task_repository.delete(db, task)
    await db.commit()
