import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.enums import UserRole


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    email: EmailStr
    full_name: str
    role: UserRole
    cost_per_hour: float | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    cost_per_hour: float | None = Field(default=None, ge=0, le=100_000)
    is_active: bool | None = None
    role: UserRole | None = None


class UserInvite(BaseModel):
    """Admin-creates-user (section 4.2/J notes there is no email delivery in v1)."""

    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    role: UserRole = UserRole.MEMBER
    cost_per_hour: float | None = Field(default=None, ge=0, le=100_000)
    password: str = Field(min_length=8, max_length=128)
