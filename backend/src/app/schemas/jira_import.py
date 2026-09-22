import uuid

from pydantic import BaseModel


class JiraImportResponse(BaseModel):
    project_id: uuid.UUID
    created_count: int
    updated_count: int
    dependency_count: int
    warnings: list[str]
