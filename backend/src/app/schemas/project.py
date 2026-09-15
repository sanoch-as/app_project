import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import ProjectStatus
from app.schemas.user import UserRead

if TYPE_CHECKING:
    from app.models.project import Project


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    description: str | None
    status: ProjectStatus
    start_date: date | None
    end_date: date | None
    created_by: uuid.UUID | None
    working_days_per_week: int
    standard_hours_per_day: float
    holidays: list[date] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, project: "Project", holidays: list[date]) -> "ProjectRead":
        """`Project.holidays` is a relationship to `ProjectHoliday` rows, not
        plain dates, so it can't be picked up by `model_validate(project)`
        (from_attributes) directly — build the response explicitly instead."""
        return cls(
            id=project.id,
            organization_id=project.organization_id,
            name=project.name,
            description=project.description,
            status=project.status,
            start_date=project.start_date,
            end_date=project.end_date,
            created_by=project.created_by,
            working_days_per_week=project.working_days_per_week,
            standard_hours_per_day=project.standard_hours_per_day,
            holidays=holidays,
            created_at=project.created_at,
            updated_at=project.updated_at,
        )


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    working_days_per_week: int = Field(default=5, ge=1, le=7)
    standard_hours_per_day: float = Field(default=8.0, gt=0, le=24)
    holidays: list[date] = Field(default_factory=list)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    status: ProjectStatus | None = None
    start_date: date | None = None
    end_date: date | None = None
    working_days_per_week: int | None = Field(default=None, ge=1, le=7)
    standard_hours_per_day: float | None = Field(default=None, gt=0, le=24)
    holidays: list[date] | None = Field(default=None, description="Full replace when provided")


class ProjectMemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    user: UserRead


class ProjectMemberCreate(BaseModel):
    user_id: uuid.UUID
