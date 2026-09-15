import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.enums import UserRole
from app.core.exceptions import NotFoundError
from app.core.security import CurrentUser, get_current_user, require_role
from app.repositories import project_repository
from app.schemas.common import Page
from app.schemas.project import (
    ProjectCreate,
    ProjectMemberCreate,
    ProjectMemberRead,
    ProjectRead,
    ProjectUpdate,
)
from app.services import project_service

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=Page[ProjectRead])
async def list_projects(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Page[ProjectRead]:
    projects, total = await project_service.list_projects(
        db, current_user, limit=limit, offset=offset
    )
    holidays_by_project = await project_repository.get_holidays_by_project_ids(
        db, [p.id for p in projects]
    )
    return Page[ProjectRead](
        items=[ProjectRead.from_model(p, holidays_by_project[p.id]) for p in projects],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "",
    response_model=ProjectRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)
async def create_project(
    payload: ProjectCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectRead:
    project = await project_repository.create(
        db,
        organization_id=current_user.organization_id,
        name=payload.name,
        description=payload.description,
        start_date=payload.start_date,
        end_date=payload.end_date,
        created_by=current_user.id,
        working_days_per_week=payload.working_days_per_week,
        standard_hours_per_day=payload.standard_hours_per_day,
    )
    if payload.holidays:
        await project_repository.set_holidays(db, project.id, payload.holidays)
    await db.commit()
    await db.refresh(project)
    return ProjectRead.from_model(project, payload.holidays)


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectRead:
    project = await project_service.get_project_for_user(db, current_user, project_id)
    holidays = await project_repository.get_holidays(db, project_id)
    return ProjectRead.from_model(project, holidays)


@router.patch(
    "/{project_id}",
    response_model=ProjectRead,
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)
async def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectRead:
    project = await project_repository.get_by_id(db, current_user.organization_id, project_id)
    if project is None:
        raise NotFoundError("Project not found")
    fields = payload.model_dump(exclude_unset=True, exclude={"holidays"})
    updated = await project_repository.update(db, project, **fields)
    if payload.holidays is not None:
        await project_repository.set_holidays(db, project_id, payload.holidays)
    await db.commit()
    await db.refresh(updated)
    holidays = await project_repository.get_holidays(db, project_id)
    return ProjectRead.from_model(updated, holidays)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)
async def delete_project(
    project_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    project = await project_repository.get_by_id(db, current_user.organization_id, project_id)
    if project is None:
        raise NotFoundError("Project not found")
    await project_repository.delete(db, project)
    await db.commit()


@router.get("/{project_id}/members", response_model=list[ProjectMemberRead])
async def list_members(
    project_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectMemberRead]:
    await project_service.get_project_for_user(db, current_user, project_id)
    members = await project_repository.list_members(db, project_id)
    return [ProjectMemberRead.model_validate(m) for m in members]


@router.post(
    "/{project_id}/members",
    response_model=ProjectMemberRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)
async def add_member(
    project_id: uuid.UUID,
    payload: ProjectMemberCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectMemberRead:
    member = await project_service.add_member(db, current_user, project_id, payload.user_id)
    return ProjectMemberRead.model_validate(member)


@router.delete(
    "/{project_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)
async def remove_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await project_service.get_project_for_user(db, current_user, project_id)
    removed = await project_repository.remove_member(db, project_id, user_id)
    if not removed:
        raise NotFoundError("Project member not found")
    await db.commit()
