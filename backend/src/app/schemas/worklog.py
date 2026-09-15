import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class WorklogCreate(BaseModel):
    work_date: date
    hours: float = Field(gt=0, le=24)
    description: str | None = None


class WorklogUpdate(BaseModel):
    work_date: date | None = None
    hours: float | None = Field(default=None, gt=0, le=24)
    description: str | None = None


class WorklogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    task_id: uuid.UUID
    user_id: uuid.UUID
    work_date: date
    hours: float
    description: str | None
    created_at: datetime
    updated_at: datetime
