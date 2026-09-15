import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import CurrentUser, get_current_user
from app.schemas.dependency import DependencyCreate, DependencyRead
from app.services import dependency_service

router = APIRouter(tags=["dependencies"])


@router.post(
    "/tasks/{task_id}/dependencies",
    response_model=DependencyRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_dependency(
    task_id: uuid.UUID,
    payload: DependencyCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DependencyRead:
    dependency = await dependency_service.create_dependency(
        db,
        current_user,
        task_id,
        successor_id=payload.successor_id,
        dependency_type=payload.dependency_type,
        lag_days=payload.lag_days,
    )
    return DependencyRead.model_validate(dependency)


@router.delete("/dependencies/{dependency_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dependency(
    dependency_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await dependency_service.delete_dependency(db, current_user, dependency_id)
