import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.baseline import Baseline, BaselineTask
from app.models.project import Project


@dataclass(frozen=True)
class TaskSnapshot:
    task_id: uuid.UUID
    planned_start_date: date
    planned_end_date: date
    planned_cost: float


async def create(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    name: str,
    created_by: uuid.UUID,
    task_snapshots: list[TaskSnapshot],
) -> Baseline:
    baseline = Baseline(project_id=project_id, name=name, created_by=created_by)
    db.add(baseline)
    await db.flush()

    for snapshot in task_snapshots:
        db.add(
            BaselineTask(
                baseline_id=baseline.id,
                task_id=snapshot.task_id,
                planned_start_date=snapshot.planned_start_date,
                planned_end_date=snapshot.planned_end_date,
                planned_cost=snapshot.planned_cost,
            )
        )
    await db.flush()
    return baseline


async def get_by_id_in_org(
    db: AsyncSession, organization_id: uuid.UUID, baseline_id: uuid.UUID
) -> Baseline | None:
    result = await db.execute(
        select(Baseline)
        .join(Project, Project.id == Baseline.project_id)
        .where(Baseline.id == baseline_id, Project.organization_id == organization_id)
        .options(selectinload(Baseline.baseline_tasks))
    )
    return result.scalar_one_or_none()


async def list_by_project(
    db: AsyncSession, project_id: uuid.UUID, *, limit: int, offset: int
) -> tuple[list[Baseline], int]:
    base_query = select(Baseline).where(Baseline.project_id == project_id)
    total = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar_one()
    result = await db.execute(
        base_query.order_by(Baseline.created_at.desc())
        .limit(limit)
        .offset(offset)
        .options(selectinload(Baseline.baseline_tasks))
    )
    return list(result.scalars().all()), total


async def get_active_baseline(db: AsyncSession, project_id: uuid.UUID) -> Baseline | None:
    """The most recently created baseline (see ADR-014) — used by EVM (Phase 5)."""
    result = await db.execute(
        select(Baseline)
        .where(Baseline.project_id == project_id)
        .order_by(Baseline.created_at.desc())
        .limit(1)
        .options(selectinload(Baseline.baseline_tasks))
    )
    return result.scalar_one_or_none()
