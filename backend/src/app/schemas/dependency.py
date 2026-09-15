import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import DependencyType


class DependencyCreate(BaseModel):
    successor_id: uuid.UUID
    dependency_type: DependencyType = DependencyType.FS
    # Bounded for the same reason as Task.duration_days (schemas/task.py):
    # services/working_calendar.py's shift_working_days walks one calendar
    # day at a time, so an unbounded lag could hang a request indefinitely.
    lag_days: int = Field(default=0, ge=-3650, le=3650)


class DependencyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    predecessor_id: uuid.UUID
    successor_id: uuid.UUID
    dependency_type: DependencyType
    lag_days: int
