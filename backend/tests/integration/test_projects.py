import pytest
from httpx import AsyncClient

from tests.fixtures.auth import auth_header, invite_member, register_admin

pytestmark = pytest.mark.asyncio


async def test_admin_can_create_and_read_project(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]

    response = await client.post(
        "/api/v1/projects",
        json={"name": "Website Revamp", "working_days_per_week": 5, "holidays": ["2026-12-25"]},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 201, response.text
    project = response.json()
    assert project["name"] == "Website Revamp"
    assert project["status"] == "planning"
    assert project["holidays"] == ["2026-12-25"]

    get_response = await client.get(
        f"/api/v1/projects/{project['id']}", headers=auth_header(admin_token)
    )
    assert get_response.status_code == 200
    assert get_response.json()["id"] == project["id"]


async def test_member_cannot_create_project(client: AsyncClient):
    admin = await register_admin(client)
    member = await invite_member(client, admin_token=admin["tokens"]["access_token"])

    response = await client.post(
        "/api/v1/projects",
        json={"name": "Should Fail"},
        headers=auth_header(member["tokens"]["access_token"]),
    )
    assert response.status_code == 403


async def test_member_only_sees_projects_they_belong_to(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    member = await invite_member(client, admin_token=admin_token)

    visible = await client.post(
        "/api/v1/projects", json={"name": "Visible Project"}, headers=auth_header(admin_token)
    )
    await client.post(
        "/api/v1/projects", json={"name": "Hidden Project"}, headers=auth_header(admin_token)
    )
    visible_id = visible.json()["id"]

    await client.post(
        f"/api/v1/projects/{visible_id}/members",
        json={"user_id": member["user"]["id"]},
        headers=auth_header(admin_token),
    )

    member_token = member["tokens"]["access_token"]
    list_response = await client.get("/api/v1/projects", headers=auth_header(member_token))
    assert list_response.status_code == 200
    body = list_response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == visible_id

    hidden_get = await client.get(
        f"/api/v1/projects/{visible_id}", headers=auth_header(member_token)
    )
    assert hidden_get.status_code == 200  # member IS part of this one


async def test_member_gets_404_for_project_they_are_not_part_of(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    member = await invite_member(client, admin_token=admin_token)

    other = await client.post(
        "/api/v1/projects", json={"name": "Not My Project"}, headers=auth_header(admin_token)
    )
    other_id = other.json()["id"]

    response = await client.get(
        f"/api/v1/projects/{other_id}", headers=auth_header(member["tokens"]["access_token"])
    )
    assert response.status_code == 404


async def test_add_and_remove_project_member(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    member = await invite_member(client, admin_token=admin_token)

    project = await client.post(
        "/api/v1/projects", json={"name": "Team Project"}, headers=auth_header(admin_token)
    )
    project_id = project.json()["id"]

    add_response = await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"user_id": member["user"]["id"]},
        headers=auth_header(admin_token),
    )
    assert add_response.status_code == 201

    duplicate_response = await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"user_id": member["user"]["id"]},
        headers=auth_header(admin_token),
    )
    assert duplicate_response.status_code == 409

    members_response = await client.get(
        f"/api/v1/projects/{project_id}/members", headers=auth_header(admin_token)
    )
    assert len(members_response.json()) == 1

    remove_response = await client.delete(
        f"/api/v1/projects/{project_id}/members/{member['user']['id']}",
        headers=auth_header(admin_token),
    )
    assert remove_response.status_code == 204

    members_after = await client.get(
        f"/api/v1/projects/{project_id}/members", headers=auth_header(admin_token)
    )
    assert len(members_after.json()) == 0


async def test_update_and_delete_project(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]

    project = await client.post(
        "/api/v1/projects", json={"name": "Old Name"}, headers=auth_header(admin_token)
    )
    project_id = project.json()["id"]

    update_response = await client.patch(
        f"/api/v1/projects/{project_id}",
        json={"name": "New Name", "status": "active"},
        headers=auth_header(admin_token),
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "New Name"
    assert update_response.json()["status"] == "active"

    delete_response = await client.delete(
        f"/api/v1/projects/{project_id}", headers=auth_header(admin_token)
    )
    assert delete_response.status_code == 204

    get_response = await client.get(
        f"/api/v1/projects/{project_id}", headers=auth_header(admin_token)
    )
    assert get_response.status_code == 404
