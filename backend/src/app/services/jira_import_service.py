"""Bulk-creates/updates tasks from a parsed Jira CSV (jira_csv_parser.py) —
the DB-touching orchestrator half of the Jira import feature (ADR-034).

Deliberately bypasses task_service.create_task/update_task: those each do
their own whole-project CPM recalculation and commit per task, which for a
CSV of dozens of rows would mean dozens of full recalculations in one
request — a real risk against Vercel Hobby's 10s maxDuration
(backend/vercel.json, same class of risk already documented in ADR-003 for
POST /progress/recalculate-all). This module instead writes every task via
task_repository directly and recalculates/commits exactly once at the end.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import DependencyType
from app.core.exceptions import ValidationAppError
from app.models.project import Project
from app.repositories import dependency_repository, task_repository
from app.services import schedule_service
from app.services.jira_csv_parser import (
    JiraTaskNode,
    build_sequential_dependencies,
    parse_jira_csv,
    read_csv_rows,
)

# A defensive secondary cap on raw upload size (guards a pathological CSV
# with few rows but huge cell values) — checked before any parsing at all.
MAX_UPLOAD_BYTES = 2 * 1024 * 1024


@dataclass(frozen=True)
class JiraImportResult:
    project_id: uuid.UUID
    created_count: int
    updated_count: int
    dependency_count: int
    warnings: list[str]


def validate_upload(content: bytes) -> None:
    """Byte-size and row-count checks only — no project/calendar needed, so
    the endpoint that creates a brand-new project for the import can call
    this *before* creating it, guaranteeing an oversized/malformed upload
    never leaves a project behind with nothing imported into it."""
    if len(content) > MAX_UPLOAD_BYTES:
        raise ValidationAppError(
            f"File is {len(content)} bytes, exceeding the {MAX_UPLOAD_BYTES}-byte limit",
            code="jira_import_file_too_large",
        )
    read_csv_rows(content)  # raises if the row count exceeds MAX_IMPORT_ROWS


async def import_jira_csv(db: AsyncSession, project: Project, content: bytes) -> JiraImportResult:
    validate_upload(content)

    calendar = await schedule_service.get_calendar(db, project)
    parsed = parse_jira_csv(content, calendar, project.name)

    existing_tasks = await task_repository.list_all_by_project(db, project.id)
    existing_by_key = {t.external_key: t for t in existing_tasks if t.external_key is not None}

    created = 0
    updated = 0
    task_id_by_key: dict[str, uuid.UUID] = {}

    async def process(
        node: JiraTaskNode, parent_task_id: uuid.UUID | None, wbs_code: str
    ) -> uuid.UUID:
        nonlocal created, updated
        existing = existing_by_key.get(node.issue_key)
        if existing is not None:
            # update() only sets attrs whose value isn't None (so a partial
            # PATCH from the UI never clobbers unrelated fields) — but a
            # re-sync legitimately needs to be able to *clear* these two, so
            # they're set directly first.
            existing.parent_task_id = parent_task_id
            existing.estimated_hours = node.estimated_hours
            await task_repository.update(
                db,
                existing,
                name=node.name,
                wbs_code=wbs_code,
                start_date=node.start_date,
                end_date=node.end_date,
                duration_days=node.duration_days,
                leaf_duration_days=node.leaf_duration_days,
                status=node.status,
                priority=node.priority,
                percent_complete=node.percent_complete,
                budgeted_cost=node.budgeted_cost,
            )
            updated += 1
            task_id = existing.id
        else:
            task = await task_repository.create(
                db,
                project_id=project.id,
                parent_task_id=parent_task_id,
                name=node.name,
                description=None,
                wbs_code=wbs_code,
                start_date=node.start_date,
                end_date=node.end_date,
                duration_days=node.duration_days,
                leaf_duration_days=node.leaf_duration_days,
                is_milestone=False,
                estimated_hours=node.estimated_hours,
                budgeted_cost=node.budgeted_cost,
                priority=node.priority,
                status=node.status,
                percent_complete=node.percent_complete,
                external_key=node.issue_key,
            )
            created += 1
            task_id = task.id

        task_id_by_key[node.issue_key] = task_id
        for child in node.children:
            await process(child, task_id, f"{wbs_code}.{child.sibling_index}")
        return task_id

    # parsed.roots is always exactly one node: the synthetic project-summary
    # task jira_csv_parser.parse_jira_csv wraps everything else under. It
    # always sits at wbs_code "0" — task_service.create_task's own 1-based
    # numbering (see docs/DECISIONS.md ADR-036) never produces "0" for a
    # hand-created root task, so this can never collide.
    for root in parsed.roots:
        await process(root, None, "0")

    # The CSV never carries real predecessor/successor data (see
    # jira_csv_parser.build_sequential_dependencies), so every sibling group
    # of leaf tasks is chained Finish-to-Start as a stand-in schedule — fully
    # recomputed from the current file on every (re)import. Dependencies the
    # user added by hand (created_by_jira_import=False) are never touched.
    await dependency_repository.delete_jira_import_generated_for_project(db, project.id)
    dependency_count = 0
    for predecessor_key, successor_key in build_sequential_dependencies(parsed.roots):
        predecessor_id = task_id_by_key[predecessor_key]
        successor_id = task_id_by_key[successor_key]
        if await dependency_repository.get_by_pair(db, predecessor_id, successor_id) is not None:
            continue  # a manual dependency already links this exact pair
        await dependency_repository.create(
            db,
            predecessor_id=predecessor_id,
            successor_id=successor_id,
            dependency_type=DependencyType.FS,
            lag_days=0,
            created_by_jira_import=True,
        )
        dependency_count += 1

    await schedule_service.recalculate_schedule(db, project, calendar)
    await db.commit()

    return JiraImportResult(
        project_id=project.id,
        created_count=created,
        updated_count=updated,
        dependency_count=dependency_count,
        warnings=parsed.warnings,
    )
