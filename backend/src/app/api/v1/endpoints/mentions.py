import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.enums import ReferencedEntityType
from app.core.security import CurrentUser, get_current_user
from app.schemas.mention import MentionSearchResult
from app.services import mention_search_service

router = APIRouter(tags=["mentions"])

_ALL_TYPES = {member.value for member in ReferencedEntityType}


@router.get("/mentions/search", response_model=list[MentionSearchResult])
async def search_mentions(
    q: str = Query(min_length=1, max_length=100),
    types: str = Query(default="project,task,page"),
    space_id: uuid.UUID | None = Query(default=None),
    exclude_page_id: uuid.UUID | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MentionSearchResult]:
    requested = {t.strip() for t in types.split(",") if t.strip()}
    resolved_types = {ReferencedEntityType(t) for t in requested & _ALL_TYPES}
    return await mention_search_service.search(
        db,
        current_user,
        q=q,
        types=resolved_types,
        space_id=space_id,
        exclude_page_id=exclude_page_id,
    )
