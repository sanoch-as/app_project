import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.enums import UserRole
from app.core.security import CurrentUser, get_current_user
from app.repositories import worklog_repository
from app.schemas.common import Page
from app.schemas.worklog import WorklogRead

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/worklogs", response_model=Page[WorklogRead])
async def worklogs_report(
    project_id: uuid.UUID | None = Query(default=None),
    user_id: uuid.UUID | None = Query(default=None),
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page[WorklogRead]:
    restrict_to_member_id = None if current_user.role == UserRole.ADMIN else current_user.id
    worklogs, total = await worklog_repository.list_report(
        db,
        current_user.organization_id,
        project_id=project_id,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
        restrict_to_member_id=restrict_to_member_id,
        limit=limit,
        offset=offset,
    )
    return Page[WorklogRead](
        items=[WorklogRead.model_validate(w) for w in worklogs],
        total=total,
        limit=limit,
        offset=offset,
    )
