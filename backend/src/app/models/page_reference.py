import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.enums import ReferencedEntityType
from app.models.mixins import UUIDPKMixin

if TYPE_CHECKING:
    from app.models.page import Page


class PageReference(UUIDPKMixin, Base):
    """An inline mention extracted from a page's `content` on every save
    (ADR-042) — `referenced_id` targets a `Project`, `Task`, or another
    `Page` depending on `referenced_type`; it can't be a real FK since the
    target table varies, so it's a plain indexed UUID. Rows are fully
    replaced (delete-then-insert) each time a page's content is saved, not
    diffed — see `page_reference_repository.replace_for_page`."""

    __tablename__ = "page_references"
    __table_args__ = (
        UniqueConstraint(
            "page_id",
            "referenced_type",
            "referenced_id",
            name="uq_page_references_page_type_target",
        ),
        Index("ix_page_references_target", "referenced_type", "referenced_id"),
    )

    page_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("pages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    referenced_type: Mapped[ReferencedEntityType] = mapped_column(nullable=False)
    referenced_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)

    page: Mapped["Page"] = relationship(back_populates="references")
