import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.progress_snapshot import ProgressSnapshot
from app.services.evm import EVMMetrics


async def upsert(
    db: AsyncSession, project_id: uuid.UUID, snapshot_date: date, metrics: EVMMetrics
) -> ProgressSnapshot:
    """One row per (project_id, snapshot_date) — see the unique constraint on
    progress_snapshots. Re-running recalculate for the same day overwrites it."""
    result = await db.execute(
        select(ProgressSnapshot).where(
            ProgressSnapshot.project_id == project_id,
            ProgressSnapshot.snapshot_date == snapshot_date,
        )
    )
    snapshot = result.scalar_one_or_none()
    if snapshot is None:
        snapshot = ProgressSnapshot(project_id=project_id, snapshot_date=snapshot_date)
        db.add(snapshot)

    snapshot.cumulative_pv = metrics.pv
    snapshot.cumulative_ev = metrics.ev
    snapshot.cumulative_ac = metrics.ac
    snapshot.spi = metrics.spi
    snapshot.cpi = metrics.cpi
    await db.flush()
    return snapshot
