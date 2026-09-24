import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.enums import ReferencedEntityType
from app.core.security import CurrentUser, get_current_user
from app.schemas.common import Page as Pagination
from app.schemas.page import PageCreate, PageMove, PageRead, PageSummary, PageUpdate
from app.schemas.page_reference import PageReferenceSummary
from app.services import page_service, space_service

router = APIRouter(tags=["pages"])


@router.get("/spaces/{space_id}/pages", response_model=list[PageSummary])
async def list_pages(
    space_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PageSummary]:
    """Unpaginated by design — the client builds the page tree from this
    flat list (mirrors `GET /projects/{id}/gantt`'s "give me everything"
    shape, not the paginated `Page[T]` envelope)."""
    pages = await page_service.list_page_tree(db, current_user, space_id)
    return [PageSummary.model_validate(p) for p in pages]


@router.post(
    "/spaces/{space_id}/pages", response_model=PageRead, status_code=status.HTTP_201_CREATED
)
async def create_page(
    space_id: uuid.UUID,
    payload: PageCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PageRead:
    space = await space_service.get_space_for_user(db, current_user, space_id)
    page = await page_service.create_page(
        db,
        current_user,
        space,
        parent_page_id=payload.parent_page_id,
        title=payload.title,
        content=payload.content,
    )
    return PageRead.model_validate(page)


@router.get("/pages/references", response_model=Pagination[PageReferenceSummary])
async def list_page_references(
    referenced_type: ReferencedEntityType = Query(...),
    referenced_id: uuid.UUID = Query(...),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Pagination[PageReferenceSummary]:
    rows, total = await page_service.list_references(
        db,
        current_user,
        referenced_type=referenced_type,
        referenced_id=referenced_id,
        limit=limit,
        offset=offset,
    )
    return Pagination[PageReferenceSummary](
        items=[
            PageReferenceSummary(
                page_id=page.id,
                page_title=page.title,
                space_id=space.id,
                space_name=space.name,
                project_id=space.project_id,
            )
            for page, space in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/pages/{page_id}", response_model=PageRead)
async def get_page(
    page_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PageRead:
    page = await page_service.get_page_for_user(db, current_user, page_id)
    return PageRead.model_validate(page)


@router.patch("/pages/{page_id}", response_model=PageRead)
async def update_page(
    page_id: uuid.UUID,
    payload: PageUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PageRead:
    page = await page_service.update_page(
        db, current_user, page_id, title=payload.title, content=payload.content
    )
    return PageRead.model_validate(page)


@router.post("/pages/{page_id}/move", response_model=PageRead)
async def move_page(
    page_id: uuid.UUID,
    payload: PageMove,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PageRead:
    page = await page_service.move_page(
        db,
        current_user,
        page_id,
        new_parent_id=payload.parent_page_id,
        position=payload.position,
    )
    return PageRead.model_validate(page)


@router.delete("/pages/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_page(
    page_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await page_service.delete_page(db, current_user, page_id)
