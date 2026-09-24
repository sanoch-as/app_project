import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import CurrentUser, get_current_user
from app.schemas.common import Page
from app.schemas.space import SpaceCreate, SpaceRead, SpaceUpdate
from app.services import space_service

router = APIRouter(tags=["spaces"])


@router.get("/spaces", response_model=Page[SpaceRead])
async def list_spaces(
    project_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page[SpaceRead]:
    spaces, total = await space_service.list_spaces(
        db, current_user, project_id=project_id, limit=limit, offset=offset
    )
    return Page[SpaceRead](
        items=[SpaceRead.model_validate(s) for s in spaces], total=total, limit=limit, offset=offset
    )


@router.post("/spaces", response_model=SpaceRead, status_code=status.HTTP_201_CREATED)
async def create_space(
    payload: SpaceCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SpaceRead:
    space = await space_service.create_space(
        db,
        current_user,
        project_id=payload.project_id,
        name=payload.name,
        description=payload.description,
        icon=payload.icon,
    )
    return SpaceRead.model_validate(space)


@router.get("/spaces/{space_id}", response_model=SpaceRead)
async def get_space(
    space_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SpaceRead:
    space = await space_service.get_space_for_user(db, current_user, space_id)
    return SpaceRead.model_validate(space)


@router.patch("/spaces/{space_id}", response_model=SpaceRead)
async def update_space(
    space_id: uuid.UUID,
    payload: SpaceUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SpaceRead:
    space = await space_service.update_space(
        db,
        current_user,
        space_id,
        name=payload.name,
        description=payload.description,
        icon=payload.icon,
    )
    return SpaceRead.model_validate(space)


@router.delete("/spaces/{space_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_space(
    space_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await space_service.delete_space(db, current_user, space_id)
