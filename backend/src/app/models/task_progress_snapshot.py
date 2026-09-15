import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import UUIDPKMixin

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.task import Task


class TaskProgressSnapshot(UUIDPKMixin, Base):
    """One row per (task_id, snapshot_date) — written daily by the same cron/recalculate
    flow that writes ProgressSnapshot (services/progress_service.py), so the "% Real"
    forecast curve (ADR-028) has a real historical percent_complete to reconstruct from,
    instead of only ever seeing each task's current value (ADR-013)."""

    __tablename__ = "task_progress_snapshots"
    __table_args__ = (
        UniqueConstraint("task_id", "snapshot_date", name="uq_task_progress_snapshots_task_date"),
        Index("ix_task_progress_snapshots_project_date", "project_id", "snapshot_date"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    percent_complete: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    project: Mapped["Project"] = relationship()
    task: Mapped["Task"] = relationship()
