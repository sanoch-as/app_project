import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class BaselineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class BaselineTaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    task_id: uuid.UUID
    planned_start_date: date
    planned_end_date: date
    planned_cost: float


class BaselineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    created_by: uuid.UUID | None
    created_at: datetime
    baseline_tasks: list[BaselineTaskRead]
