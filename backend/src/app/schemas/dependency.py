import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import DependencyType


class DependencyCreate(BaseModel):
    successor_id: uuid.UUID
    dependency_type: DependencyType = DependencyType.FS
    lag_days: int = Field(default=0)


class DependencyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    predecessor_id: uuid.UUID
    successor_id: uuid.UUID
    dependency_type: DependencyType
    lag_days: int
