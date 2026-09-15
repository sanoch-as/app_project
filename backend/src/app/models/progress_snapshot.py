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


class ProgressSnapshot(UUIDPKMixin, Base):
    __tablename__ = "progress_snapshots"
    __table_args__ = (
        UniqueConstraint("project_id", "snapshot_date", name="uq_progress_snapshots_project_date"),
        Index("ix_progress_snapshots_project_date", "project_id", "snapshot_date"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    cumulative_pv: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    cumulative_ev: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    cumulative_ac: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    spi: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    cpi: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    project: Mapped["Project"] = relationship()
