import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ReferencedEntityType, UserRole
from app.core.security import CurrentUser
from app.repositories import mention_search_repository
from app.schemas.mention import MentionSearchResult

_PER_TYPE_LIMIT = 8


async def search(
    db: AsyncSession,
    current_user: CurrentUser,
    *,
    q: str,
    types: set[ReferencedEntityType],
    space_id: uuid.UUID | None,
    exclude_page_id: uuid.UUID | None,
) -> list[MentionSearchResult]:
    """Backs the editor's `@mention` popup — three small ILIKE-scoped
    lookups (no full-text search engine needed at this app's scale),
    respecting the exact same visibility rules as the rest of the app."""
    is_admin = current_user.role == UserRole.ADMIN
    results: list[MentionSearchResult] = []

    if ReferencedEntityType.PROJECT in types:
        projects = await mention_search_repository.search_projects(
            db,
            current_user.organization_id,
            current_user.id,
            is_admin=is_admin,
            q=q,
            limit=_PER_TYPE_LIMIT,
        )
        results.extend(
            MentionSearchResult(
                type=ReferencedEntityType.PROJECT, id=p.id, label=p.name, sublabel=None
            )
            for p in projects
        )

    if ReferencedEntityType.TASK in types:
        tasks = await mention_search_repository.search_tasks(
            db,
            current_user.organization_id,
            current_user.id,
            is_admin=is_admin,
            q=q,
            limit=_PER_TYPE_LIMIT,
        )
        results.extend(
            MentionSearchResult(
                type=ReferencedEntityType.TASK, id=t.id, label=t.name, sublabel=t.wbs_code
            )
            for t in tasks
        )

    if ReferencedEntityType.PAGE in types:
        pages = await mention_search_repository.search_pages(
            db,
            current_user.organization_id,
            current_user.id,
            is_admin=is_admin,
            q=q,
            space_id=space_id,
            exclude_page_id=exclude_page_id,
            limit=_PER_TYPE_LIMIT,
        )
        results.extend(
            MentionSearchResult(
                type=ReferencedEntityType.PAGE, id=p.id, label=p.title, sublabel=None
            )
            for p in pages
        )

    return results
