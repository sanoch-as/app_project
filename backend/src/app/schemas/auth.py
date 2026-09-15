from pydantic import BaseModel, EmailStr, Field

from app.schemas.organization import OrganizationRead
from app.schemas.user import UserRead


class RegisterRequest(BaseModel):
    organization_name: str = Field(min_length=1, max_length=255)
    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RegisterResponse(BaseModel):
    organization: OrganizationRead
    user: UserRead
    tokens: TokenPair
