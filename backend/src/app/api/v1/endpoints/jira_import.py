import uuid

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.enums import UserRole
from app.core.security import CurrentUser, get_current_user, require_role
from app.repositories import project_repository
from app.schemas.jira_import import JiraImportResponse
from app.services import jira_import_service, project_service

# No single prefix: /projects/import/jira-csv (create a new project) and
# /projects/{id}/tasks/import/jira-csv (sync into an existing one) — same
# dual-shape pattern as worklogs.py/tasks.py.
router = APIRouter(tags=["jira-import"])


@router.post(
    "/projects/import/jira-csv",
    response_model=JiraImportResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)
async def import_jira_csv_as_new_project(
    project_name: str = Form(..., min_length=1, max_length=255),
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JiraImportResponse:
    content = await file.read()
    jira_import_service.validate_upload(content)  # before any DB write — see docstring

    project = await project_repository.create(
        db,
        organization_id=current_user.organization_id,
        name=project_name,
        description=None,
        start_date=None,
        end_date=None,
        created_by=current_user.id,
        working_days_per_week=5,
        standard_hours_per_day=8.0,
    )
    result = await jira_import_service.import_jira_csv(db, project, content)
    return JiraImportResponse(
        project_id=result.project_id,
        created_count=result.created_count,
        updated_count=result.updated_count,
        dependency_count=result.dependency_count,
        warnings=result.warnings,
    )


@router.post("/projects/{project_id}/tasks/import/jira-csv", response_model=JiraImportResponse)
async def import_jira_csv_into_project(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JiraImportResponse:
    project = await project_service.get_project_for_user(db, current_user, project_id)
    content = await file.read()
    result = await jira_import_service.import_jira_csv(db, project, content)
    return JiraImportResponse(
        project_id=result.project_id,
        created_count=result.created_count,
        updated_count=result.updated_count,
        dependency_count=result.dependency_count,
        warnings=result.warnings,
    )
