import pytest
from httpx import AsyncClient

from tests.fixtures.auth import auth_header, invite_member, register_admin

pytestmark = pytest.mark.asyncio


async def test_new_user_defaults_to_spanish_and_dmy_date_format(client: AsyncClient):
    admin = await register_admin(client)
    assert admin["user"]["language"] == "es"
    assert admin["user"]["date_format"] == "dmy"


async def test_admin_can_update_own_language_and_date_format(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]

    response = await client.patch(
        f"/api/v1/users/{admin['user']['id']}",
        json={"language": "en", "date_format": "iso"},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["language"] == "en"
    assert body["date_format"] == "iso"


async def test_member_can_update_own_language_and_date_format(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    member = await invite_member(client, admin_token=admin_token)
    member_token = member["tokens"]["access_token"]
    member_id = member["user"]["id"]

    response = await client.patch(
        f"/api/v1/users/{member_id}",
        json={"language": "en", "date_format": "iso"},
        headers=auth_header(member_token),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["language"] == "en"
    assert body["date_format"] == "iso"


async def test_member_still_cannot_update_admin_only_fields_on_self(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    member = await invite_member(client, admin_token=admin_token)
    member_token = member["tokens"]["access_token"]
    member_id = member["user"]["id"]

    response = await client.patch(
        f"/api/v1/users/{member_id}",
        json={"role": "admin"},
        headers=auth_header(member_token),
    )
    assert response.status_code == 403
