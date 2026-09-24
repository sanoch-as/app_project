import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import ForeignKey, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin, UUIDPKMixin

if TYPE_CHECKING:
    from app.models.page_reference import PageReference
    from app.models.space import Space

_EMPTY_DOC: dict[str, Any] = {"type": "doc", "content": []}


class Page(UUIDPKMixin, TimestampMixin, Base):
    """A page of rich-text content within a `Space`, nestable under another
    page via `parent_page_id` (subpages). `content` is Tiptap's own JSON
    document format, stored as-is — no markdown/HTML round-trip (ADR-042).
    Sibling order is a plain `sort_order` integer (unlike `Task.wbs_code`,
    pages have no CPM/rollup coupling that would need a dotted-path code)."""

    __tablename__ = "pages"

    space_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_page_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("pages.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: dict(_EMPTY_DOC),
        server_default=text('\'{"type": "doc", "content": []}\'::jsonb'),
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    space: Mapped["Space"] = relationship(back_populates="pages")
    parent: Mapped["Page | None"] = relationship(remote_side="Page.id", back_populates="children")
    children: Mapped[list["Page"]] = relationship(
        back_populates="parent", cascade="all, delete-orphan"
    )
    references: Mapped[list["PageReference"]] = relationship(
        back_populates="page", cascade="all, delete-orphan"
    )
