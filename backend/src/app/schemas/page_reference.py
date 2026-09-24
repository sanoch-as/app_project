import uuid

from pydantic import BaseModel


class PageReferenceSummary(BaseModel):
    """One page that mentions the requested project/task/page — built from a
    joined `(Page, Space)` row, not a single ORM object, so it has no
    `from_attributes` config; the endpoint constructs it field by field."""

    page_id: uuid.UUID
    page_title: str
    space_id: uuid.UUID
    space_name: str
    project_id: uuid.UUID | None
