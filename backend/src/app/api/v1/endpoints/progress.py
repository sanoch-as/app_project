import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import CurrentUser, get_current_user, verify_cron_secret
from app.schemas.progress import (
    EVMMetricsRead,
    ProgressResponse,
    ProjectedProgressResponse,
    RecalculateAllResponse,
    RecalculateResponse,
    SCurvePointRead,
)
from app.services import progress_service, project_service

router = APIRouter(prefix="/projects/{project_id}/progress", tags=["progress"])
cron_router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("", response_model=ProgressResponse)
async def get_progress(
    project_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProgressResponse:
    project = await project_service.get_project_for_user(db, current_user, project_id)
    current, curve = await progress_service.get_current_progress(db, project)
    return ProgressResponse(
        status_date=datetime.now(UTC).date(),
        current=EVMMetricsRead.from_metrics(current),
        s_curve=[SCurvePointRead.from_point(p) for p in curve],
    )


@router.get("/projected", response_model=ProjectedProgressResponse)
async def get_projected_progress(
    project_id: uuid.UUID,
    status_date: date = Query(..., description="Target date to project baseline progress to"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectedProgressResponse:
    project = await project_service.get_project_for_user(db, current_user, project_id)
    result = await progress_service.get_projected_progress(db, project, status_date)
    return ProjectedProgressResponse.from_result(result)


@router.post("/recalculate", response_model=RecalculateResponse)
async def recalculate_progress(
    project_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RecalculateResponse:
    project = await project_service.get_project_for_user(db, current_user, project_id)
    metrics = await progress_service.recalculate_and_store(db, project)
    return RecalculateResponse(
        status_date=datetime.now(UTC).date(), current=EVMMetricsRead.from_metrics(metrics)
    )


@cron_router.post(
    "/recalculate-all",
    response_model=RecalculateAllResponse,
    dependencies=[Depends(verify_cron_secret)],
)
async def recalculate_all(db: AsyncSession = Depends(get_db)) -> RecalculateAllResponse:
    count = await progress_service.recalculate_all_active(db)
    return RecalculateAllResponse(projects_recalculated=count)
