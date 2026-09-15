import uuid
from datetime import date

from pydantic import BaseModel

from app.core.enums import ProjectStatus, TaskStatus


class OverdueTask(BaseModel):
    id: uuid.UUID
    name: str
    end_date: date
    status: TaskStatus


class UpcomingMilestone(BaseModel):
    id: uuid.UUID
    name: str
    start_date: date


class ProjectDashboard(BaseModel):
    project_id: uuid.UUID
    percent_complete: float
    spi: float | None
    cpi: float | None
    overdue_tasks: list[OverdueTask]
    upcoming_milestones: list[UpcomingMilestone]


class PortfolioProjectSummary(BaseModel):
    id: uuid.UUID
    name: str
    status: ProjectStatus
    percent_complete: float
    spi: float | None
    cpi: float | None
    overdue_task_count: int


class DashboardSummary(BaseModel):
    total_projects: int
    projects: list[PortfolioProjectSummary]
