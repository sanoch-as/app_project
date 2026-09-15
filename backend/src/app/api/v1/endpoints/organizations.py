import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.core.security import get_current_org
from app.repositories import organization_repository
from app.schemas.organization import OrganizationRead

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("/me", response_model=OrganizationRead)
async def get_my_organization(
    organization_id: uuid.UUID = Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
) -> OrganizationRead:
    organization = await organization_repository.get_by_id(db, organization_id)
    if organization is None:
        raise NotFoundError("Organization not found")
    return OrganizationRead.model_validate(organization)
