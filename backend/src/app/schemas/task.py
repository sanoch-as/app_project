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


# Working-day arithmetic (services/working_calendar.py) walks forward one
# calendar day at a time, so an unbounded duration_days/lag_days would let a
# single request loop essentially forever inside the request handler (a real
# resource-exhaustion vector, not just a data-quality one) — 3650 working
# days is about 14 calendar years, already far beyond any real task/lag.
MAX_WORKING_DAYS = 3650


class TaskCreate(BaseModel):
    parent_task_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=10_000)
    start_date: date
    duration_days: int = Field(ge=0, le=MAX_WORKING_DAYS)
    is_milestone: bool = False
    priority: TaskPriority = TaskPriority.MEDIUM
    estimated_hours: float | None = Field(default=None, ge=0, le=1_000_000)
    budgeted_cost: float = Field(default=0, ge=0, le=1_000_000_000)
    assignees: list[TaskAssigneeInput] = Field(default_factory=list, max_length=100)


class TaskUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=10_000)
    start_date: date | None = None
    end_date: date | None = None
    duration_days: int | None = Field(default=None, ge=0, le=MAX_WORKING_DAYS)
    percent_complete: float | None = Field(default=None, ge=0, le=100)
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    is_milestone: bool | None = None
    estimated_hours: float | None = Field(default=None, ge=0, le=1_000_000)
    budgeted_cost: float | None = Field(default=None, ge=0, le=1_000_000_000)
    assignees: list[TaskAssigneeInput] | None = Field(default=None, max_length=100)


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


class TaskMove(BaseModel):
    """Reassigns a task's WBS parent and/or its position among the new
    parent's (or root-level, if `parent_task_id` is None) children — see
    POST /tasks/{task_id}/move. `position` is the desired 0-based index
    among siblings after the move; the frontend already has the full
    ordered sibling list in memory to compute it (drag-and-drop, section
    "Jerarquía WBS")."""

    parent_task_id: uuid.UUID | None = None
    position: int = Field(ge=0)


class GanttResponse(BaseModel):
    """Optimized payload for the Gantt view (section 7): every task and
    dependency of the project in one response, no pagination."""

    tasks: list[TaskRead]
    dependencies: list[DependencyRead]
