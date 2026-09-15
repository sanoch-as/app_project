"""Creates a demo organization with projects, tasks, dependencies, a
baseline, and worklogs — for local exploration/demos (spec section 9 phase
9, section 11 DoD). Safe to re-run: it deletes any existing organization
with the same slug first (cascades to everything under it) and rebuilds
from scratch.

Usage (against the local docker-compose Postgres, or Neon if DATABASE_URL
in backend/.env points there — this script loads that same .env):

    cd backend && source .venv/bin/activate && cd ..
    python scripts/seed_data.py

Demo login (all users share this password): admin@example.com / demo1234
(also alice@example.com, bob@example.com, carol@example.com — all `member`).
"""

import asyncio
import sys
import uuid
from datetime import date, timedelta
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
_BACKEND_DIR = _REPO_ROOT / "backend"
_SRC_DIR = _BACKEND_DIR / "src"
if str(_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(_SRC_DIR))
# app.core.config's Settings reads ".env" relative to the current working
# directory — chdir so it finds backend/.env regardless of where this
# script was invoked from (repo root or backend/).
import os  # noqa: E402

os.chdir(_BACKEND_DIR)

from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.core.database import AsyncSessionLocal, engine  # noqa: E402
from app.core.enums import (  # noqa: E402
    DependencyType,
    ProjectStatus,
    TaskPriority,
    TaskStatus,
    UserRole,
)
from app.core.security import CurrentUser, hash_password  # noqa: E402
from app.models.user import User  # noqa: E402
from app.repositories import (  # noqa: E402
    organization_repository,
    project_repository,
    user_repository,
)
from app.repositories import worklog_repository as worklog_repo  # noqa: E402
from app.schemas.task import TaskAssigneeInput  # noqa: E402
from app.services import (  # noqa: E402
    baseline_service,
    dependency_service,
    task_service,
)
from app.services.working_calendar import WorkingCalendar  # noqa: E402

DEMO_SLUG = "demo"
DEMO_PASSWORD = "demo1234"
TODAY = date.today()
CALENDAR = WorkingCalendar(working_days_per_week=5, holidays=frozenset())


def _status_for(end_date: date, start_date: date) -> tuple[TaskStatus, float]:
    """Derives a plausible status/percent_complete from where a task's
    computed dates land relative to today, so the demo always looks "live"
    regardless of when it's actually run."""
    if end_date < TODAY:
        return TaskStatus.COMPLETED, 100.0
    if start_date <= TODAY:
        return TaskStatus.IN_PROGRESS, 45.0
    return TaskStatus.NOT_STARTED, 0.0


async def _reset_demo_organization(db: AsyncSession) -> None:
    existing = await organization_repository.get_by_slug(db, DEMO_SLUG)
    if existing is not None:
        await db.delete(
            existing
        )  # cascades: users, projects, tasks, everything under them
        await db.commit()


async def _create_users(
    db: AsyncSession, org_id: uuid.UUID
) -> tuple[User, User, User, User]:
    admin = await user_repository.create(
        db,
        organization_id=org_id,
        email="admin@example.com",
        hashed_password=hash_password(DEMO_PASSWORD),
        full_name="Priya Patel",
        role=UserRole.ADMIN,
        cost_per_hour=75,
    )
    alice = await user_repository.create(
        db,
        organization_id=org_id,
        email="alice@example.com",
        hashed_password=hash_password(DEMO_PASSWORD),
        full_name="Alice Nguyen",
        role=UserRole.MEMBER,
        cost_per_hour=60,
    )
    bob = await user_repository.create(
        db,
        organization_id=org_id,
        email="bob@example.com",
        hashed_password=hash_password(DEMO_PASSWORD),
        full_name="Bob Martinez",
        role=UserRole.MEMBER,
        cost_per_hour=55,
    )
    carol = await user_repository.create(
        db,
        organization_id=org_id,
        email="carol@example.com",
        hashed_password=hash_password(DEMO_PASSWORD),
        full_name="Carol Kim",
        role=UserRole.MEMBER,
        cost_per_hour=45,
    )
    await db.commit()
    return admin, alice, bob, carol


async def _seed_customer_portal_project(
    db: AsyncSession,
    admin_user: CurrentUser,
    admin: User,
    alice: User,
    bob: User,
    carol: User,
) -> None:
    project = await project_repository.create(
        db,
        organization_id=admin_user.organization_id,
        name="Customer Portal Redesign",
        description="Redesign and rebuild the self-service customer portal.",
        start_date=TODAY - timedelta(days=60),
        end_date=TODAY + timedelta(days=45),
        created_by=admin.id,
        working_days_per_week=5,
        standard_hours_per_day=8.0,
    )
    project.status = ProjectStatus.ACTIVE
    await db.commit()
    for member in (admin, alice, bob, carol):
        await project_repository.add_member(db, project.id, member.id)
    await db.commit()

    def assignee(user: User, allocation: float = 100) -> list[TaskAssigneeInput]:
        return [TaskAssigneeInput(user_id=user.id, allocation_percent=allocation)]

    # Requirements -> Stakeholder review -> Wireframes -> UI design -> Backend
    # API -(SS overlap)- Frontend impl -> QA -> Launch (milestone).
    start = TODAY - timedelta(days=25)
    requirements = await task_service.create_task(
        db,
        admin_user,
        project.id,
        parent_task_id=None,
        name="Requirements Gathering",
        description="Interview stakeholders, document functional requirements.",
        start_date=start,
        duration_days=5,
        is_milestone=False,
        priority=TaskPriority.HIGH,
        estimated_hours=40,
        budgeted_cost=4000,
        assignees=assignee(admin),
    )

    review = await task_service.create_task(
        db,
        admin_user,
        project.id,
        parent_task_id=None,
        name="Stakeholder Review",
        description="Walk requirements back through stakeholders for sign-off.",
        start_date=requirements.end_date,
        duration_days=2,
        is_milestone=False,
        priority=TaskPriority.MEDIUM,
        estimated_hours=8,
        budgeted_cost=700,
        assignees=assignee(admin),
    )
    await dependency_service.create_dependency(
        db,
        admin_user,
        requirements.id,
        successor_id=review.id,
        dependency_type=DependencyType.FS,
        lag_days=0,
    )

    wireframes = await task_service.create_task(
        db,
        admin_user,
        project.id,
        parent_task_id=None,
        name="Wireframes",
        description="Low-fidelity wireframes for every portal screen.",
        start_date=review.end_date,
        duration_days=4,
        is_milestone=False,
        priority=TaskPriority.MEDIUM,
        estimated_hours=32,
        budgeted_cost=2000,
        assignees=assignee(bob),
    )
    await dependency_service.create_dependency(
        db,
        admin_user,
        review.id,
        successor_id=wireframes.id,
        dependency_type=DependencyType.FS,
        lag_days=0,
    )

    ui_design = await task_service.create_task(
        db,
        admin_user,
        project.id,
        parent_task_id=None,
        name="UI Design",
        description="High-fidelity mockups based on approved wireframes.",
        start_date=wireframes.end_date,
        duration_days=5,
        is_milestone=False,
        priority=TaskPriority.MEDIUM,
        estimated_hours=40,
        budgeted_cost=2500,
        assignees=assignee(bob),
    )
    await dependency_service.create_dependency(
        db,
        admin_user,
        wireframes.id,
        successor_id=ui_design.id,
        dependency_type=DependencyType.FS,
        lag_days=0,
    )

    backend_api = await task_service.create_task(
        db,
        admin_user,
        project.id,
        parent_task_id=None,
        name="Backend API Development",
        description="Build the REST API the new portal consumes.",
        start_date=ui_design.end_date,
        duration_days=10,
        is_milestone=False,
        priority=TaskPriority.CRITICAL,
        estimated_hours=80,
        budgeted_cost=5500,
        assignees=assignee(alice),
    )
    await dependency_service.create_dependency(
        db,
        admin_user,
        ui_design.id,
        successor_id=backend_api.id,
        dependency_type=DependencyType.FS,
        lag_days=0,
    )

    frontend_impl_start = CALENDAR.shift_working_days(backend_api.start_date, 3)
    frontend_impl = await task_service.create_task(
        db,
        admin_user,
        project.id,
        parent_task_id=None,
        name="Frontend Implementation",
        description="Build the portal UI against the new API.",
        start_date=frontend_impl_start,
        duration_days=8,
        is_milestone=False,
        priority=TaskPriority.HIGH,
        estimated_hours=64,
        budgeted_cost=4000,
        assignees=assignee(bob),
    )
    await dependency_service.create_dependency(
        db,
        admin_user,
        backend_api.id,
        successor_id=frontend_impl.id,
        dependency_type=DependencyType.SS,
        lag_days=3,
    )

    qa_start = max(backend_api.end_date, frontend_impl.end_date)
    qa_testing = await task_service.create_task(
        db,
        admin_user,
        project.id,
        parent_task_id=None,
        name="QA Testing",
        description="End-to-end testing of the new portal.",
        start_date=qa_start,
        duration_days=6,
        is_milestone=False,
        priority=TaskPriority.HIGH,
        estimated_hours=48,
        budgeted_cost=2500,
        assignees=assignee(carol),
    )
    await dependency_service.create_dependency(
        db,
        admin_user,
        backend_api.id,
        successor_id=qa_testing.id,
        dependency_type=DependencyType.FS,
        lag_days=0,
    )
    await dependency_service.create_dependency(
        db,
        admin_user,
        frontend_impl.id,
        successor_id=qa_testing.id,
        dependency_type=DependencyType.FS,
        lag_days=0,
    )

    launch = await task_service.create_task(
        db,
        admin_user,
        project.id,
        parent_task_id=None,
        name="Launch",
        description="Go-live milestone.",
        start_date=qa_testing.end_date,
        duration_days=0,
        is_milestone=True,
        priority=TaskPriority.CRITICAL,
        estimated_hours=None,
        budgeted_cost=0,
        assignees=[],
    )
    await dependency_service.create_dependency(
        db,
        admin_user,
        qa_testing.id,
        successor_id=launch.id,
        dependency_type=DependencyType.FS,
        lag_days=0,
    )

    # Baseline captured once the initial schedule/costs above are in place —
    # the "planned" line in the S-curve and the planned-vs-actual comparison.
    await baseline_service.create_baseline(
        db, admin_user, project.id, name="Initial Plan"
    )

    # Bring progress up to date on tasks that have (plausibly) started, and
    # log some hours against them so AC/CPI have something to show.
    for task, owner in (
        (requirements, admin),
        (review, admin),
        (wireframes, bob),
        (ui_design, bob),
        (backend_api, alice),
        (frontend_impl, bob),
        (qa_testing, carol),
        (launch, admin),
    ):
        status, percent_complete = _status_for(task.end_date, task.start_date)
        await task_service.update_task(
            db,
            admin_user,
            task,
            project,
            fields={"status": status, "percent_complete": percent_complete},
            assignees=None,
        )
        if (
            task.duration_days > 0
            and status != TaskStatus.NOT_STARTED
            and task.estimated_hours
        ):
            # Spread hours evenly across the task's working days up to today,
            # totaling percent_complete% of its estimate — keeps AC roughly
            # proportional to EV so CPI lands somewhere plausible instead of
            # being dominated by how few/many days happened to get logged.
            work_days = []
            day = task.start_date
            logging_cutoff = min(task.end_date, TODAY)
            while day <= logging_cutoff:
                if CALENDAR.is_working_day(day):
                    work_days.append(day)
                day += timedelta(days=1)
            if work_days:
                total_hours = float(task.estimated_hours) * (percent_complete / 100)
                hours_per_day = round(total_hours / len(work_days), 2)
                for work_day in work_days:
                    await worklog_repo.create(
                        db,
                        task_id=task.id,
                        user_id=owner.id,
                        work_date=work_day,
                        hours=hours_per_day,
                        description=f"Work on {task.name}",
                    )
    await db.commit()


async def _seed_mobile_app_project(
    db: AsyncSession, admin_user: CurrentUser, admin: User, alice: User, bob: User
) -> None:
    project = await project_repository.create(
        db,
        organization_id=admin_user.organization_id,
        name="Mobile App Launch",
        description="Native mobile companion app — early planning stage.",
        start_date=TODAY,
        end_date=TODAY + timedelta(days=90),
        created_by=admin.id,
        working_days_per_week=5,
        standard_hours_per_day=8.0,
    )
    await db.commit()
    for member in (admin, alice, bob):
        await project_repository.add_member(db, project.id, member.id)
    await db.commit()

    discovery = await task_service.create_task(
        db,
        admin_user,
        project.id,
        parent_task_id=None,
        name="Product Discovery",
        description="Define scope and success metrics for the mobile app.",
        start_date=TODAY,
        duration_days=5,
        is_milestone=False,
        priority=TaskPriority.MEDIUM,
        estimated_hours=40,
        budgeted_cost=3000,
        assignees=[TaskAssigneeInput(user_id=admin.id, allocation_percent=50)],
    )
    await task_service.create_task(
        db,
        admin_user,
        project.id,
        parent_task_id=None,
        name="Technical Spike",
        description="Evaluate React Native vs. native for the two platforms.",
        start_date=discovery.end_date,
        duration_days=4,
        is_milestone=False,
        priority=TaskPriority.MEDIUM,
        estimated_hours=32,
        budgeted_cost=2500,
        assignees=[TaskAssigneeInput(user_id=alice.id, allocation_percent=50)],
    )
    await db.commit()


async def main() -> None:
    async with AsyncSessionLocal() as db:
        await _reset_demo_organization(db)

        org = await organization_repository.create(
            db, name="Nimbus Robotics", slug=DEMO_SLUG
        )
        await db.commit()

        admin, alice, bob, carol = await _create_users(db, org.id)
        admin_user = CurrentUser(
            id=admin.id, organization_id=org.id, role=UserRole.ADMIN
        )

        await _seed_customer_portal_project(db, admin_user, admin, alice, bob, carol)
        await _seed_mobile_app_project(db, admin_user, admin, alice, bob)

    await engine.dispose()
    print(
        "Seed complete. Log in as admin@example.com / demo1234 (or alice/bob/carol@example.com)."
    )


if __name__ == "__main__":
    asyncio.run(main())
