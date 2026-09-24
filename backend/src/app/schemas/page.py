import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

_EMPTY_DOC: dict[str, Any] = {"type": "doc", "content": []}


class PageCreate(BaseModel):
    parent_page_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=255)
    content: dict[str, Any] = Field(default_factory=lambda: dict(_EMPTY_DOC))


class PageUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    content: dict[str, Any] | None = None


class PageMove(BaseModel):
    """Reassigns a page's parent and/or its position among the new parent's
    (or space-root, if `parent_page_id` is None) children — mirrors
    `TaskMove` exactly. `position` is the desired 0-based index among
    siblings after the move."""

    parent_page_id: uuid.UUID | None = None
    position: int = Field(ge=0)


class PageSummary(BaseModel):
    """Sidebar/tree-fetch shape — omits `content` so `GET /spaces/{id}/pages`
    stays light even for a large space."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    space_id: uuid.UUID
    parent_page_id: uuid.UUID | None
    title: str
    sort_order: int
    updated_at: datetime


class PageRead(PageSummary):
    content: dict[str, Any]
    created_at: datetime
