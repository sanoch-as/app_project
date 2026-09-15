import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import CurrentUser
from app.models.baseline import Baseline
from app.repositories import baseline_repository, task_repository
from app.repositories.baseline_repository import TaskSnapshot
from app.services import project_service


async def create_baseline(
    db: AsyncSession, current_user: CurrentUser, project_id: uuid.UUID, *, name: str
) -> Baseline:
    """Snapshots every task's current start_date/end_date/budgeted_cost — the
    source of "avance previsto" for EVM (section 4.1 point 14, ADR-017)."""
    await project_service.get_project_for_user(db, current_user, project_id)

    tasks = await task_repository.list_all_by_project(db, project_id)
    snapshots = [
        TaskSnapshot(
            task_id=task.id,
            planned_start_date=task.start_date,
            planned_end_date=task.end_date,
            planned_cost=task.budgeted_cost,
        )
        for task in tasks
    ]

    baseline = await baseline_repository.create(
        db,
        project_id=project_id,
        name=name,
        created_by=current_user.id,
        task_snapshots=snapshots,
    )
    await db.commit()
    reloaded = await baseline_repository.get_by_id_in_org(
        db, current_user.organization_id, baseline.id
    )
    assert reloaded is not None
    return reloaded
