import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SpaceCreate(BaseModel):
    project_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    icon: str | None = Field(default=None, max_length=32)


class SpaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    icon: str | None = Field(default=None, max_length=32)


class SpaceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    project_id: uuid.UUID | None
    name: str
    description: str | None
    icon: str | None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
