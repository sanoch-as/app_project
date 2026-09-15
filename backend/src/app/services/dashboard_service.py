import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import TaskStatus, UserRole
from app.core.security import CurrentUser
from app.models.project import Project
from app.models.task import Task
from app.repositories import project_repository, task_repository
from app.schemas.dashboard import (
    DashboardSummary,
    OverdueTask,
    PortfolioProjectSummary,
    ProjectDashboard,
    UpcomingMilestone,
)
from app.services import progress_service, project_service

UPCOMING_MILESTONES_LIMIT = 5


def _overall_percent_complete(tasks: list[Task]) -> float:
    """Cost-weighted overall progress: EV / total budgeted cost. A simple
    average of each task's percent_complete would let a tiny task skew the
    number as much as the project's biggest deliverable."""
    total_budgeted = sum(float(t.budgeted_cost) for t in tasks)
    if not total_budgeted:
        return 0.0
    earned = sum((float(t.percent_complete) / 100) * float(t.budgeted_cost) for t in tasks)
    return earned / total_budgeted * 100


def _overdue_tasks(tasks: list[Task], today: datetime) -> list[Task]:
    return [t for t in tasks if t.status != TaskStatus.COMPLETED and t.end_date < today.date()]


def _upcoming_milestones(tasks: list[Task], today: datetime) -> list[Task]:
    milestones = [t for t in tasks if t.is_milestone and t.start_date >= today.date()]
    return sorted(milestones, key=lambda t: t.start_date)[:UPCOMING_MILESTONES_LIMIT]


async def get_project_dashboard(
    db: AsyncSession, current_user: CurrentUser, project_id: uuid.UUID
) -> ProjectDashboard:
    project = await project_service.get_project_for_user(db, current_user, project_id)
    tasks = await task_repository.list_all_by_project(db, project_id)
    today = datetime.now(UTC)

    metrics, _ = await progress_service.get_current_progress(db, project)

    return ProjectDashboard(
        project_id=project.id,
        percent_complete=_overall_percent_complete(tasks),
        spi=metrics.spi,
        cpi=metrics.cpi,
        overdue_tasks=[
            OverdueTask(id=t.id, name=t.name, end_date=t.end_date, status=t.status)
            for t in _overdue_tasks(tasks, today)
        ],
        upcoming_milestones=[
            UpcomingMilestone(id=t.id, name=t.name, start_date=t.start_date)
            for t in _upcoming_milestones(tasks, today)
        ],
    )


async def _portfolio_project_summary(
    db: AsyncSession, project: Project, today: datetime
) -> PortfolioProjectSummary:
    tasks = await task_repository.list_all_by_project(db, project.id)
    metrics, _ = await progress_service.get_current_progress(db, project)
    return PortfolioProjectSummary(
        id=project.id,
        name=project.name,
        status=project.status,
        percent_complete=_overall_percent_complete(tasks),
        spi=metrics.spi,
        cpi=metrics.cpi,
        overdue_task_count=len(_overdue_tasks(tasks, today)),
    )


async def get_portfolio_summary(db: AsyncSession, current_user: CurrentUser) -> DashboardSummary:
    restrict_to_user_id = None if current_user.role == UserRole.ADMIN else current_user.id
    projects = await project_repository.list_all_visible(
        db, current_user.organization_id, restrict_to_user_id
    )
    today = datetime.now(UTC)
    summaries = [await _portfolio_project_summary(db, p, today) for p in projects]
    return DashboardSummary(total_projects=len(summaries), projects=summaries)
