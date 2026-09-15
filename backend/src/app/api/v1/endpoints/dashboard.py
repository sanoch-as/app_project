import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import CurrentUser, get_current_user
from app.schemas.dashboard import DashboardSummary, ProjectDashboard
from app.services import dashboard_service

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardSummary:
    return await dashboard_service.get_portfolio_summary(db, current_user)


@router.get("/projects/{project_id}/dashboard", response_model=ProjectDashboard)
async def get_project_dashboard(
    project_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectDashboard:
    return await dashboard_service.get_project_dashboard(db, current_user, project_id)
