import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.enums import TaskPriority, TaskStatus
from app.models.mixins import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.dependency import TaskDependency
    from app.models.project import Project
    from app.models.task_comment import TaskComment
    from app.models.user import User
    from app.models.worklog import Worklog


class Task(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        UniqueConstraint("project_id", "external_key", name="uq_tasks_project_external_key"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_task_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    wbs_code: Mapped[str] = mapped_column(String(50), nullable=False)
    # Jira issue key (e.g. "BH-8") for tasks created by the Jira CSV importer —
    # None for every hand-created task. Lets a re-import find this exact row
    # again to update it instead of creating a duplicate (see ADR-034).
    external_key: Mapped[str | None] = mapped_column(String(64), nullable=True)

    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    # For a leaf task, equals duration_days. For a WBS parent, the recursive
    # sum of every leaf task's duration underneath it (NOT its own calendar
    # span) — the weight compute_rollup uses to roll percent_complete up the
    # tree, so a nested rollup always matches a flat leaf-duration-weighted
    # average regardless of gaps between sibling tasks (see ADR-037).
    leaf_duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    percent_complete: Mapped[float] = mapped_column(
        Numeric(5, 2), default=0, server_default="0", nullable=False
    )
    status: Mapped[TaskStatus] = mapped_column(
        default=TaskStatus.NOT_STARTED, server_default=TaskStatus.NOT_STARTED.value, nullable=False
    )
    priority: Mapped[TaskPriority] = mapped_column(
        default=TaskPriority.MEDIUM, server_default=TaskPriority.MEDIUM.value, nullable=False
    )
    is_milestone: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    # Manually curated: does this task show as a bar on the Resumen tab's
    # Roadmap widget (an "Add to Timeline" analog, ADR-041)? Independent of
    # WBS depth/rollup — a task with children can still be flagged.
    on_timeline: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )

    estimated_hours: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    budgeted_cost: Mapped[float] = mapped_column(
        Numeric(14, 2), default=0, server_default="0", nullable=False
    )

    # CPM outputs (services/critical_path.py), recomputed synchronously on write.
    early_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    early_finish: Mapped[date | None] = mapped_column(Date, nullable=True)
    late_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    late_finish: Mapped[date | None] = mapped_column(Date, nullable=True)
    total_float: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_critical: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )

    project: Mapped["Project"] = relationship(back_populates="tasks")
    parent: Mapped["Task | None"] = relationship(remote_side="Task.id", back_populates="children")
    children: Mapped[list["Task"]] = relationship(
        back_populates="parent", cascade="all, delete-orphan"
    )

    assignees: Mapped[list["TaskAssignee"]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )
    worklogs: Mapped[list["Worklog"]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )
    comments: Mapped[list["TaskComment"]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )
    predecessor_links: Mapped[list["TaskDependency"]] = relationship(
        back_populates="successor",
        foreign_keys="TaskDependency.successor_id",
        cascade="all, delete-orphan",
    )
    successor_links: Mapped[list["TaskDependency"]] = relationship(
        back_populates="predecessor",
        foreign_keys="TaskDependency.predecessor_id",
        cascade="all, delete-orphan",
    )


class TaskAssignee(UUIDPKMixin, Base):
    __tablename__ = "task_assignees"
    __table_args__ = (UniqueConstraint("task_id", "user_id", name="uq_task_assignees_task_user"),)

    task_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    allocation_percent: Mapped[float] = mapped_column(
        Numeric(5, 2), default=100, server_default="100", nullable=False
    )

    task: Mapped["Task"] = relationship(back_populates="assignees")
    user: Mapped["User"] = relationship()
