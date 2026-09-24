import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import ReferencedEntityType, UserRole
from app.core.exceptions import NotFoundError, ValidationAppError
from app.core.security import CurrentUser
from app.models.page import Page
from app.models.space import Space
from app.repositories import page_reference_repository, page_repository
from app.services import space_service
from app.services.mention_extraction import extract_mentions


async def get_page_for_user(
    db: AsyncSession, current_user: CurrentUser, page_id: uuid.UUID
) -> Page:
    page = await page_repository.get_by_id_in_org(db, current_user.organization_id, page_id)
    if page is None:
        raise NotFoundError("Page not found")
    await space_service.get_space_for_user(db, current_user, page.space_id)
    return page


async def list_page_tree(
    db: AsyncSession, current_user: CurrentUser, space_id: uuid.UUID
) -> list[Page]:
    await space_service.get_space_for_user(db, current_user, space_id)
    return await page_repository.list_all_by_space(db, space_id)


async def _sync_references(db: AsyncSession, page: Page, content: dict[str, Any]) -> None:
    await page_reference_repository.replace_for_page(db, page.id, extract_mentions(content))


async def create_page(
    db: AsyncSession,
    current_user: CurrentUser,
    space: Space,
    *,
    parent_page_id: uuid.UUID | None,
    title: str,
    content: dict[str, Any],
) -> Page:
    existing_pages = await page_repository.list_all_by_space(db, space.id)
    if parent_page_id is not None and not any(p.id == parent_page_id for p in existing_pages):
        raise ValidationAppError(
            "parent_page_id does not belong to this space", code="invalid_parent"
        )
    siblings = [p for p in existing_pages if p.parent_page_id == parent_page_id]

    page = await page_repository.create(
        db,
        space_id=space.id,
        parent_page_id=parent_page_id,
        title=title,
        content=content,
        sort_order=len(siblings),
    )
    await _sync_references(db, page, content)
    await db.commit()
    return page


async def update_page(
    db: AsyncSession,
    current_user: CurrentUser,
    page_id: uuid.UUID,
    *,
    title: str | None,
    content: dict[str, Any] | None,
) -> Page:
    page = await get_page_for_user(db, current_user, page_id)
    updated = await page_repository.update(db, page, title=title, content=content)
    if content is not None:
        await _sync_references(db, updated, content)
    await db.commit()
    return updated


async def delete_page(db: AsyncSession, current_user: CurrentUser, page_id: uuid.UUID) -> None:
    page = await get_page_for_user(db, current_user, page_id)
    await page_repository.delete(db, page)
    await db.commit()


async def move_page(
    db: AsyncSession,
    current_user: CurrentUser,
    page_id: uuid.UUID,
    *,
    new_parent_id: uuid.UUID | None,
    position: int,
) -> Page:
    page = await get_page_for_user(db, current_user, page_id)
    all_pages = await page_repository.list_all_by_space(db, page.space_id)
    by_id = {p.id: p for p in all_pages}

    if new_parent_id is not None:
        if new_parent_id == page.id:
            raise ValidationAppError("A page cannot become its own parent", code="invalid_move")
        if new_parent_id not in by_id:
            raise ValidationAppError(
                "parent_page_id does not belong to this space", code="invalid_move"
            )
        cursor: uuid.UUID | None = new_parent_id
        while cursor is not None:
            if cursor == page.id:
                raise ValidationAppError(
                    "This move would create a cycle in the page hierarchy",
                    code="page_move_cycle",
                )
            cursor = by_id[cursor].parent_page_id

    old_parent_id = page.parent_page_id
    old_siblings = sorted(
        (p for p in all_pages if p.parent_page_id == old_parent_id and p.id != page.id),
        key=lambda p: p.sort_order,
    )
    new_siblings = sorted(
        (p for p in all_pages if p.parent_page_id == new_parent_id and p.id != page.id),
        key=lambda p: p.sort_order,
    )
    position = max(0, min(position, len(new_siblings)))
    new_siblings.insert(position, page)

    page.parent_page_id = new_parent_id
    if old_parent_id != new_parent_id:
        for index, sibling in enumerate(old_siblings):
            sibling.sort_order = index
    for index, sibling in enumerate(new_siblings):
        sibling.sort_order = index

    await db.flush()
    await db.commit()
    reloaded = await page_repository.get_by_id_in_org(db, current_user.organization_id, page.id)
    assert reloaded is not None
    return reloaded


async def list_references(
    db: AsyncSession,
    current_user: CurrentUser,
    *,
    referenced_type: ReferencedEntityType,
    referenced_id: uuid.UUID,
    limit: int,
    offset: int,
) -> tuple[list[tuple[Page, Space]], int]:
    return await page_reference_repository.list_referencing(
        db,
        current_user.organization_id,
        current_user.id,
        is_admin=current_user.role == UserRole.ADMIN,
        referenced_type=referenced_type,
        referenced_id=referenced_id,
        limit=limit,
        offset=offset,
    )
