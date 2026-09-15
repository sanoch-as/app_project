import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task_progress_snapshot import TaskProgressSnapshot


async def upsert_many(
    db: AsyncSession,
    project_id: uuid.UUID,
    snapshot_date: date,
    rows: list[tuple[uuid.UUID, float]],
) -> None:
    """One row per (task_id, snapshot_date) — see the unique constraint on
    task_progress_snapshots. Re-running recalculate for the same day overwrites it,
    mirroring progress_snapshot_repository.upsert's behavior at the project level."""
    if not rows:
        return

    task_ids = [task_id for task_id, _ in rows]
    result = await db.execute(
        select(TaskProgressSnapshot).where(
            TaskProgressSnapshot.task_id.in_(task_ids),
            TaskProgressSnapshot.snapshot_date == snapshot_date,
        )
    )
    existing_by_task = {row.task_id: row for row in result.scalars().all()}

    for task_id, percent_complete in rows:
        snapshot = existing_by_task.get(task_id)
        if snapshot is None:
            snapshot = TaskProgressSnapshot(
                project_id=project_id, task_id=task_id, snapshot_date=snapshot_date
            )
            db.add(snapshot)
        snapshot.percent_complete = percent_complete

    await db.flush()


async def list_up_to_date(
    db: AsyncSession, project_id: uuid.UUID, end_date: date
) -> list[TaskProgressSnapshot]:
    """No lower bound: reconstructing "what was task X's % at checkpoint C" needs the
    most recent snapshot at-or-before C, which may have been written well before the
    caller's requested range if nothing changed since — see progress_service's
    point-in-time lookup."""
    result = await db.execute(
        select(TaskProgressSnapshot)
        .where(
            TaskProgressSnapshot.project_id == project_id,
            TaskProgressSnapshot.snapshot_date <= end_date,
        )
        .order_by(TaskProgressSnapshot.snapshot_date)
    )
    return list(result.scalars().all())
