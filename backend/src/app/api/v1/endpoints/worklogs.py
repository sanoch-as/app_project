import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import CurrentUser, get_current_user
from app.schemas.common import Page
from app.schemas.worklog import WorklogCreate, WorklogRead, WorklogUpdate
from app.services import worklog_service

# No single prefix: /tasks/{id}/worklogs and /worklogs/{id} (section 7).
router = APIRouter(tags=["worklogs"])


@router.get("/tasks/{task_id}/worklogs", response_model=Page[WorklogRead])
async def list_worklogs(
    task_id: uuid.UUID,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page[WorklogRead]:
    worklogs, total = await worklog_service.list_task_worklogs(
        db, current_user, task_id, limit=limit, offset=offset
    )
    return Page[WorklogRead](
        items=[WorklogRead.model_validate(w) for w in worklogs],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/tasks/{task_id}/worklogs", response_model=WorklogRead, status_code=status.HTTP_201_CREATED
)
async def create_worklog(
    task_id: uuid.UUID,
    payload: WorklogCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorklogRead:
    worklog = await worklog_service.create_worklog(
        db,
        current_user,
        task_id,
        work_date=payload.work_date,
        hours=payload.hours,
        description=payload.description,
    )
    return WorklogRead.model_validate(worklog)


@router.patch("/worklogs/{worklog_id}", response_model=WorklogRead)
async def update_worklog(
    worklog_id: uuid.UUID,
    payload: WorklogUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorklogRead:
    updated = await worklog_service.update_worklog(
        db, current_user, worklog_id, **payload.model_dump(exclude_unset=True)
    )
    return WorklogRead.model_validate(updated)


@router.delete("/worklogs/{worklog_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_worklog(
    worklog_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await worklog_service.delete_worklog(db, current_user, worklog_id)
