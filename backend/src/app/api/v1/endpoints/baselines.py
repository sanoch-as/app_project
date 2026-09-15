import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.enums import UserRole
from app.core.exceptions import NotFoundError
from app.core.security import CurrentUser, get_current_user, require_role
from app.repositories import baseline_repository
from app.schemas.baseline import BaselineCreate, BaselineRead
from app.schemas.common import Page
from app.services import baseline_service, project_service

# No single prefix: /projects/{id}/baselines and /baselines/{id} (section 7).
router = APIRouter(tags=["baselines"])


@router.post(
    "/projects/{project_id}/baselines",
    response_model=BaselineRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)
async def create_baseline(
    project_id: uuid.UUID,
    payload: BaselineCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BaselineRead:
    baseline = await baseline_service.create_baseline(
        db, current_user, project_id, name=payload.name
    )
    return BaselineRead.model_validate(baseline)


@router.get("/projects/{project_id}/baselines", response_model=Page[BaselineRead])
async def list_baselines(
    project_id: uuid.UUID,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page[BaselineRead]:
    await project_service.get_project_for_user(db, current_user, project_id)
    baselines, total = await baseline_repository.list_by_project(
        db, project_id, limit=limit, offset=offset
    )
    return Page[BaselineRead](
        items=[BaselineRead.model_validate(b) for b in baselines],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/baselines/{baseline_id}", response_model=BaselineRead)
async def get_baseline(
    baseline_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BaselineRead:
    baseline = await baseline_repository.get_by_id_in_org(
        db, current_user.organization_id, baseline_id
    )
    if baseline is None:
        raise NotFoundError("Baseline not found")
    await project_service.get_project_for_user(db, current_user, baseline.project_id)
    return BaselineRead.model_validate(baseline)
