import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.enums import UserRole
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.core.security import CurrentUser, get_current_user, hash_password, require_role
from app.repositories import user_repository
from app.schemas.common import Page
from app.schemas.user import UserInvite, UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])

# Fields a non-admin may change on their own profile without an admin role —
# personal preferences, not organization-administrative data (role/cost_per_hour/
# is_active stay admin-only).
SELF_EDITABLE_FIELDS = {"full_name", "language", "date_format"}


@router.get("", response_model=Page[UserRead])
async def list_users(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page[UserRead]:
    users, total = await user_repository.list_by_organization(
        db, current_user.organization_id, limit=limit, offset=offset
    )
    return Page[UserRead](
        items=[UserRead.model_validate(u) for u in users], total=total, limit=limit, offset=offset
    )


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    user = await user_repository.get_by_id(db, current_user.organization_id, user_id)
    if user is None:
        raise NotFoundError("User not found")
    return UserRead.model_validate(user)


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    user = await user_repository.get_by_id(db, current_user.organization_id, user_id)
    if user is None:
        raise NotFoundError("User not found")

    is_self = current_user.id == user_id
    is_admin = current_user.role == UserRole.ADMIN
    if not is_admin and not is_self:
        raise ForbiddenError("You can only update your own profile")

    update_fields = payload.model_dump(exclude_unset=True)
    if not is_admin:
        # Members may only change their own profile preferences (see the permission
        # matrix, section 8, amended for personal settings — language/date_format).
        disallowed = set(update_fields) - SELF_EDITABLE_FIELDS
        if disallowed:
            raise ForbiddenError(f"Members cannot update: {', '.join(sorted(disallowed))}")

    updated = await user_repository.update(db, user, **update_fields)
    await db.commit()
    await db.refresh(updated)
    return UserRead.model_validate(updated)


@router.post(
    "/invite",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)
async def invite_user(
    payload: UserInvite,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    """Admin-creates-user. No email delivery in v1 — see docs/BACKLOG.md (module J)."""
    if await user_repository.get_by_email(db, payload.email) is not None:
        raise ConflictError("A user with this email already exists", code="email_taken")

    user = await user_repository.create(
        db,
        organization_id=current_user.organization_id,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        cost_per_hour=payload.cost_per_hour,
    )
    await db.commit()
    await db.refresh(user)
    return UserRead.model_validate(user)
