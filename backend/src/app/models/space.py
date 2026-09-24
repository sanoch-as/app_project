import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.page import Page
    from app.models.project import Project
    from app.models.user import User


class Space(UUIDPKMixin, TimestampMixin, Base):
    """A documentation container (ADR-042) — either tied to one `project_id`
    (visible to that project's members) or independent/org-wide
    (`project_id is None`, visible to every member of the organization).
    A project may have more than one space; no uniqueness is enforced here."""

    __tablename__ = "spaces"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    organization: Mapped["Organization"] = relationship()
    project: Mapped["Project | None"] = relationship()
    creator: Mapped["User | None"] = relationship()
    pages: Mapped[list["Page"]] = relationship(back_populates="space", cascade="all, delete-orphan")
