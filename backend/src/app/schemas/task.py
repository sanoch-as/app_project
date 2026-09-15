import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import TaskPriority, TaskStatus
from app.schemas.dependency import DependencyRead
from app.schemas.user import UserRead


class TaskAssigneeInput(BaseModel):
    user_id: uuid.UUID
    allocation_percent: float = Field(default=100, ge=0, le=100)


class TaskAssigneeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user: UserRead
    allocation_percent: float


class TaskCreate(BaseModel):
    parent_task_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    start_date: date
    duration_days: int = Field(ge=0)
    is_milestone: bool = False
    priority: TaskPriority = TaskPriority.MEDIUM
    estimated_hours: float | None = Field(default=None, ge=0)
    budgeted_cost: float = Field(default=0, ge=0)
    assignees: list[TaskAssigneeInput] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    start_date: date | None = None
    duration_days: int | None = Field(default=None, ge=0)
    percent_complete: float | None = Field(default=None, ge=0, le=100)
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    is_milestone: bool | None = None
    estimated_hours: float | None = Field(default=None, ge=0)
    budgeted_cost: float | None = Field(default=None, ge=0)
    assignees: list[TaskAssigneeInput] | None = None


class TaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    parent_task_id: uuid.UUID | None
    name: str
    description: str | None
    wbs_code: str
    start_date: date
    end_date: date
    duration_days: int
    percent_complete: float
    status: TaskStatus
    priority: TaskPriority
    is_milestone: bool
    estimated_hours: float | None
    budgeted_cost: float
    early_start: date | None
    early_finish: date | None
    late_start: date | None
    late_finish: date | None
    total_float: int | None
    is_critical: bool
    assignees: list[TaskAssigneeRead]
    created_at: datetime
    updated_at: datetime


class GanttResponse(BaseModel):
    """Optimized payload for the Gantt view (section 7): every task and
    dependency of the project in one response, no pagination."""

    tasks: list[TaskRead]
    dependencies: list[DependencyRead]
