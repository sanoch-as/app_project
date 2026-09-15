import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.enums import DependencyType
from app.models.mixins import UUIDPKMixin

if TYPE_CHECKING:
    from app.models.task import Task


class TaskDependency(UUIDPKMixin, Base):
    __tablename__ = "task_dependencies"
    __table_args__ = (
        UniqueConstraint("predecessor_id", "successor_id", name="uq_task_dependencies_pred_succ"),
    )

    predecessor_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    successor_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    dependency_type: Mapped[DependencyType] = mapped_column(
        default=DependencyType.FS, server_default=DependencyType.FS.value, nullable=False
    )
    lag_days: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    predecessor: Mapped["Task"] = relationship(
        foreign_keys=[predecessor_id], back_populates="successor_links"
    )
    successor: Mapped["Task"] = relationship(
        foreign_keys=[successor_id], back_populates="predecessor_links"
    )
