import uuid
from datetime import UTC, date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.enums import DateFormat, Language, UserRole
from app.core.security import CurrentUser, get_current_user
from app.repositories import task_repository, user_repository, worklog_repository
from app.schemas.common import Page
from app.schemas.worklog import WorklogRead
from app.services import progress_service, project_service, report_export_service

# No single prefix: /reports/worklogs (system-wide) and
# /projects/{id}/reports/export (project-scoped) — section 7.
router = APIRouter(tags=["reports"])


@router.get("/reports/worklogs", response_model=Page[WorklogRead])
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


@router.get("/projects/{project_id}/reports/export")
async def export_project_report(
    project_id: uuid.UUID,
    export_type: Literal["tasks", "tasks_xlsx", "tasks_pdf", "worklogs", "summary"] = Query(
        alias="type"
    ),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    project = await project_service.get_project_for_user(db, current_user, project_id)

    if export_type == "tasks":
        tasks = await task_repository.list_all_by_project(db, project_id)
        csv_body = report_export_service.tasks_to_csv(tasks)
        return Response(
            content=csv_body,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{project.name}-tasks.csv"'},
        )

    if export_type in ("tasks_xlsx", "tasks_pdf"):
        tasks = await task_repository.list_all_by_project(db, project_id)
        user = await user_repository.get_by_id(db, current_user.organization_id, current_user.id)
        language = user.language if user is not None else Language.ES
        date_format = user.date_format if user is not None else DateFormat.DMY

        if export_type == "tasks_xlsx":
            xlsx_body = report_export_service.tasks_to_styled_xlsx(
                project, tasks, language, date_format
            )
            return Response(
                content=xlsx_body,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition": f'attachment; filename="{project.name}-tareas.xlsx"'
                },
            )

        pdf_body = report_export_service.tasks_to_styled_pdf(project, tasks, language, date_format)
        return Response(
            content=pdf_body,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{project.name}-tareas.pdf"'},
        )

    if export_type == "worklogs":
        rows = await worklog_repository.list_for_export(db, project_id)
        csv_body = report_export_service.worklogs_to_csv(rows)
        return Response(
            content=csv_body,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{project.name}-worklogs.csv"'},
        )

    # summary
    metrics, curve = await progress_service.get_current_progress(db, project)
    pdf_body = report_export_service.project_summary_to_pdf(
        project, metrics, curve, datetime.now(UTC).date()
    )
    return Response(
        content=pdf_body,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{project.name}-summary.pdf"'},
    )
