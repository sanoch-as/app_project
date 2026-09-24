import uuid

from pydantic import BaseModel

from app.core.enums import ReferencedEntityType


class MentionSearchResult(BaseModel):
    type: ReferencedEntityType
    id: uuid.UUID
    label: str
    sublabel: str | None
