import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import CurrentUser, get_current_user
from app.schemas.common import Page
from app.schemas.task_comment import TaskCommentCreate, TaskCommentRead
from app.services import task_comment_service

# No single prefix: /tasks/{id}/comments and /comments/{id} (mirrors worklogs.py).
router = APIRouter(tags=["comments"])


@router.get("/tasks/{task_id}/comments", response_model=Page[TaskCommentRead])
async def list_comments(
    task_id: uuid.UUID,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page[TaskCommentRead]:
    comments, total = await task_comment_service.list_task_comments(
        db, current_user, task_id, limit=limit, offset=offset
    )
    return Page[TaskCommentRead](
        items=[TaskCommentRead.model_validate(c) for c in comments],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/tasks/{task_id}/comments",
    response_model=TaskCommentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_comment(
    task_id: uuid.UUID,
    payload: TaskCommentCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskCommentRead:
    comment = await task_comment_service.create_comment(
        db, current_user, task_id, body=payload.body
    )
    return TaskCommentRead.model_validate(comment)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await task_comment_service.delete_comment(db, current_user, comment_id)
