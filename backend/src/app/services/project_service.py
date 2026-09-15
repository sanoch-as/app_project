import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import UserRole
from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import CurrentUser
from app.models.project import Project, ProjectMember
from app.repositories import project_repository, user_repository


async def get_project_for_user(
    db: AsyncSession, current_user: CurrentUser, project_id: uuid.UUID
) -> Project:
    """Admins see every project in their org; members only see projects they
    belong to — a project outside either scope looks exactly like a
    nonexistent one (see docs/api-conventions.md)."""
    project = await project_repository.get_by_id(db, current_user.organization_id, project_id)
    if project is None:
        raise NotFoundError("Project not found")
    if current_user.role != UserRole.ADMIN and not await project_repository.is_member(
        db, project_id, current_user.id
    ):
        raise NotFoundError("Project not found")
    return project


async def list_projects(
    db: AsyncSession, current_user: CurrentUser, *, limit: int, offset: int
) -> tuple[list[Project], int]:
    if current_user.role == UserRole.ADMIN:
        return await project_repository.list_by_organization(
            db, current_user.organization_id, limit=limit, offset=offset
        )
    return await project_repository.list_for_member(
        db, current_user.organization_id, current_user.id, limit=limit, offset=offset
    )


async def add_member(
    db: AsyncSession, current_user: CurrentUser, project_id: uuid.UUID, user_id: uuid.UUID
) -> ProjectMember:
    await get_project_for_user(db, current_user, project_id)
    target_user = await user_repository.get_by_id(db, current_user.organization_id, user_id)
    if target_user is None:
        raise NotFoundError("User not found")
    if await project_repository.get_member(db, project_id, user_id) is not None:
        raise ConflictError("User is already a member of this project", code="already_member")
    member = await project_repository.add_member(db, project_id, user_id)
    await db.commit()
    await db.refresh(member, attribute_names=["user"])
    return member
