"""Bulk-creates/updates tasks from a parsed Jira CSV (jira_csv_parser.py) —
the DB-touching orchestrator half of the Jira import feature (ADR-034).

Deliberately bypasses task_service.create_task/update_task: those each do
their own whole-project CPM recalculation and commit per task, which for a
CSV of dozens of rows would mean dozens of full recalculations in one
request — a real risk against Vercel Hobby's 10s maxDuration
(backend/vercel.json, same class of risk already documented in ADR-003 for
POST /progress/recalculate-all).

It also constructs every Task/TaskDependency row directly and stages them
all in memory instead of calling task_repository.create/update (or
dependency_repository's equivalents) per row — those each do their own
`await db.flush()`, which is a real network round trip to Postgres, not
just a Python-side operation. Over a local database that's cheap enough not
to notice; over a real deployment (Vercel's function talking to Neon) it
was consistently enough round trips per row (create/update + an extra
lookup per generated dependency) to blow past the same 10s maxDuration this
module already exists to protect (ADR-039) — a 25-row CSV timed out in
production even though the exact same file imported near-instantly locally.
Every row's ID is generated in Python (`uuid.uuid4()`, matching
UUIDPKMixin's own client-side default) precisely so a child's
`parent_task_id` is known before its parent is ever sent to the database,
letting the whole tree — creates, updates, and the dependency chain — flush
in one batch instead of one round trip per row."""

import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import DependencyType
from app.core.exceptions import ValidationAppError
from app.models.dependency import TaskDependency
from app.models.project import Project
from app.models.task import Task
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
    new_tasks: list[Task] = []

    def process(node: JiraTaskNode, parent_task_id: uuid.UUID | None, wbs_code: str) -> uuid.UUID:
        nonlocal created, updated
        existing = existing_by_key.get(node.issue_key)
        if existing is not None:
            existing.parent_task_id = parent_task_id
            existing.name = node.name
            existing.wbs_code = wbs_code
            existing.start_date = node.start_date
            existing.end_date = node.end_date
            existing.duration_days = node.duration_days
            existing.leaf_duration_days = node.leaf_duration_days
            existing.status = node.status
            existing.priority = node.priority
            existing.percent_complete = node.percent_complete
            existing.budgeted_cost = node.budgeted_cost
            existing.estimated_hours = node.estimated_hours
            # description/is_milestone are deliberately never touched — a
            # re-sync must never clobber a hand-written description or
            # un-flag a manually-marked milestone (neither comes from any
            # Jira column).
            updated += 1
            task_id = existing.id
        else:
            task_id = uuid.uuid4()
            new_tasks.append(
                Task(
                    id=task_id,
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
            )
            created += 1

        task_id_by_key[node.issue_key] = task_id
        for child in node.children:
            process(child, task_id, f"{wbs_code}.{child.sibling_index}")
        return task_id

    # parsed.roots is always exactly one node: the synthetic project-summary
    # task jira_csv_parser.parse_jira_csv wraps everything else under. It
    # always sits at wbs_code "0" — task_service.create_task's own 1-based
    # numbering (see docs/DECISIONS.md ADR-036) never produces "0" for a
    # hand-created root task, so this can never collide.
    for root in parsed.roots:
        process(root, None, "0")
    db.add_all(new_tasks)

    # The CSV never carries real predecessor/successor data (see
    # jira_csv_parser.build_sequential_dependencies), so every sibling group
    # of leaf tasks is chained Finish-to-Start as a stand-in schedule — fully
    # recomputed from the current file on every (re)import. Dependencies the
    # user added by hand (created_by_jira_import=False) are never touched.
    # One query for every existing dependency instead of one per generated
    # edge (ADR-039) — membership/pre-existence is then just a Python set
    # lookup. An edge that's unchanged since the last import is left alone
    # rather than deleted-and-recreated: besides being wasted writes, a
    # delete and an insert of the *same* (predecessor_id, successor_id) pair
    # in one flush isn't guaranteed to apply in an order that avoids
    # tripping the unique constraint on that pair.
    existing_dependencies = await dependency_repository.list_by_project(db, project.id)
    manual_pairs = {
        (d.predecessor_id, d.successor_id)
        for d in existing_dependencies
        if not d.created_by_jira_import
    }
    existing_auto_by_pair = {
        (d.predecessor_id, d.successor_id): d
        for d in existing_dependencies
        if d.created_by_jira_import
    }

    computed_pairs: set[tuple[uuid.UUID, uuid.UUID]] = set()
    dependency_count = 0
    new_dependencies: list[TaskDependency] = []
    for predecessor_key, successor_key in build_sequential_dependencies(parsed.roots):
        pair = (task_id_by_key[predecessor_key], task_id_by_key[successor_key])
        if pair in manual_pairs:
            continue  # a manual dependency already links this exact pair
        computed_pairs.add(pair)
        dependency_count += 1
        if pair in existing_auto_by_pair:
            continue  # unchanged since the last import — nothing to do
        new_dependencies.append(
            TaskDependency(
                id=uuid.uuid4(),
                predecessor_id=pair[0],
                successor_id=pair[1],
                dependency_type=DependencyType.FS,
                lag_days=0,
                created_by_jira_import=True,
            )
        )
    db.add_all(new_dependencies)

    # A previously auto-generated edge the current file no longer produces
    # (order/dates changed, a task's status changed, etc.) is stale.
    for pair, dependency in existing_auto_by_pair.items():
        if pair not in computed_pairs:
            await db.delete(dependency)

    await schedule_service.recalculate_schedule(db, project, calendar)
    await db.commit()

    return JiraImportResult(
        project_id=project.id,
        created_count=created,
        updated_count=updated,
        dependency_count=dependency_count,
        warnings=parsed.warnings,
    )
