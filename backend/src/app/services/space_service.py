import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UserRole
from app.core.exceptions import NotFoundError
from app.core.security import CurrentUser
from app.models.space import Space
from app.repositories import space_repository
from app.services import project_service


async def get_space_for_user(
    db: AsyncSession, current_user: CurrentUser, space_id: uuid.UUID
) -> Space:
    """A project-tied space delegates to `project_service.get_project_for_user`
    (same membership rule as the project itself); an independent space is
    visible to every member of the organization — no separate ACL table
    (ADR-042)."""
    space = await space_repository.get_by_id(db, current_user.organization_id, space_id)
    if space is None:
        raise NotFoundError("Space not found")
    if space.project_id is not None:
        await project_service.get_project_for_user(db, current_user, space.project_id)
    return space


async def list_spaces(
    db: AsyncSession,
    current_user: CurrentUser,
    *,
    project_id: uuid.UUID | None,
    limit: int,
    offset: int,
) -> tuple[list[Space], int]:
    if project_id is not None:
        await project_service.get_project_for_user(db, current_user, project_id)
        return await space_repository.list_by_project(db, project_id, limit=limit, offset=offset)
    return await space_repository.list_visible(
        db,
        current_user.organization_id,
        current_user.id,
        is_admin=current_user.role == UserRole.ADMIN,
        limit=limit,
        offset=offset,
    )


async def create_space(
    db: AsyncSession,
    current_user: CurrentUser,
    *,
    project_id: uuid.UUID | None,
    name: str,
    description: str | None,
    icon: str | None,
) -> Space:
    if project_id is not None:
        await project_service.get_project_for_user(db, current_user, project_id)
    space = await space_repository.create(
        db,
        organization_id=current_user.organization_id,
        project_id=project_id,
        name=name,
        description=description,
        icon=icon,
        created_by=current_user.id,
    )
    await db.commit()
    return space


async def update_space(
    db: AsyncSession,
    current_user: CurrentUser,
    space_id: uuid.UUID,
    *,
    name: str | None,
    description: str | None,
    icon: str | None,
) -> Space:
    space = await get_space_for_user(db, current_user, space_id)
    updated = await space_repository.update(
        db, space, name=name, description=description, icon=icon
    )
    await db.commit()
    return updated


async def delete_space(db: AsyncSession, current_user: CurrentUser, space_id: uuid.UUID) -> None:
    space = await get_space_for_user(db, current_user, space_id)
    await space_repository.delete(db, space)
    await db.commit()
