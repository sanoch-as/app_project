import pytest
from httpx import AsyncClient

from tests.fixtures.auth import auth_header, invite_member, register_admin

pytestmark = pytest.mark.asyncio


async def _create_project(client: AsyncClient, admin_token: str, **overrides) -> dict:
    payload = {"name": "Docs Test Project"}
    payload.update(overrides)
    response = await client.post("/api/v1/projects", json=payload, headers=auth_header(admin_token))
    assert response.status_code == 201, response.text
    return response.json()


async def test_create_and_list_project_tied_space(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = await _create_project(client, admin_token)

    response = await client.post(
        "/api/v1/spaces",
        json={"project_id": project["id"], "name": "Project Wiki", "icon": "📁"},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 201, response.text
    space = response.json()
    assert space["project_id"] == project["id"]
    assert space["name"] == "Project Wiki"

    listed = await client.get(
        f"/api/v1/spaces?project_id={project['id']}", headers=auth_header(admin_token)
    )
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == space["id"]


async def test_create_independent_space(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]

    response = await client.post(
        "/api/v1/spaces", json={"name": "Company Handbook"}, headers=auth_header(admin_token)
    )
    assert response.status_code == 201, response.text
    space = response.json()
    assert space["project_id"] is None


async def test_member_without_project_access_cannot_see_project_tied_space(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    member = await invite_member(client, admin_token=admin_token)
    member_token = member["tokens"]["access_token"]

    project = await _create_project(client, admin_token)
    created = await client.post(
        "/api/v1/spaces",
        json={"project_id": project["id"], "name": "Private Wiki"},
        headers=auth_header(admin_token),
    )
    space_id = created.json()["id"]

    response = await client.get(f"/api/v1/spaces/{space_id}", headers=auth_header(member_token))
    assert response.status_code == 404


async def test_any_org_member_sees_an_independent_space(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    member = await invite_member(client, admin_token=admin_token)
    member_token = member["tokens"]["access_token"]

    created = await client.post(
        "/api/v1/spaces", json={"name": "Org Wide Space"}, headers=auth_header(admin_token)
    )
    space_id = created.json()["id"]

    response = await client.get(f"/api/v1/spaces/{space_id}", headers=auth_header(member_token))
    assert response.status_code == 200
    assert response.json()["id"] == space_id


async def test_cross_org_space_access_is_not_found(client: AsyncClient):
    admin_a = await register_admin(client)
    admin_a_token = admin_a["tokens"]["access_token"]
    admin_b = await register_admin(client)
    admin_b_token = admin_b["tokens"]["access_token"]

    created = await client.post(
        "/api/v1/spaces", json={"name": "Org A Space"}, headers=auth_header(admin_a_token)
    )
    space_id = created.json()["id"]

    response = await client.get(f"/api/v1/spaces/{space_id}", headers=auth_header(admin_b_token))
    assert response.status_code == 404


async def test_update_and_delete_space(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]

    created = await client.post(
        "/api/v1/spaces", json={"name": "Draft Name"}, headers=auth_header(admin_token)
    )
    space_id = created.json()["id"]

    updated = await client.patch(
        f"/api/v1/spaces/{space_id}",
        json={"name": "Final Name"},
        headers=auth_header(admin_token),
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Final Name"

    deleted = await client.delete(f"/api/v1/spaces/{space_id}", headers=auth_header(admin_token))
    assert deleted.status_code == 204

    gone = await client.get(f"/api/v1/spaces/{space_id}", headers=auth_header(admin_token))
    assert gone.status_code == 404
