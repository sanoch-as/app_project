import pytest
from httpx import AsyncClient

from tests.fixtures.auth import auth_header, invite_member, register_admin

pytestmark = pytest.mark.asyncio


async def _setup_project_and_task(client: AsyncClient, admin_token: str) -> dict:
    project = await client.post(
        "/api/v1/projects", json={"name": "Comment Test"}, headers=auth_header(admin_token)
    )
    project_id = project.json()["id"]
    task = await client.post(
        f"/api/v1/projects/{project_id}/tasks",
        json={"name": "Task A", "start_date": "2026-09-14", "duration_days": 3},
        headers=auth_header(admin_token),
    )
    return {"project_id": project_id, "task_id": task.json()["id"]}


async def test_create_and_list_comment_on_a_task(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    ctx = await _setup_project_and_task(client, admin_token)

    created = await client.post(
        f"/api/v1/tasks/{ctx['task_id']}/comments",
        json={"body": "First comment"},
        headers=auth_header(admin_token),
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["body"] == "First comment"
    assert body["task_id"] == ctx["task_id"]
    assert body["user_id"] == admin["user"]["id"]

    await client.post(
        f"/api/v1/tasks/{ctx['task_id']}/comments",
        json={"body": "Second comment"},
        headers=auth_header(admin_token),
    )

    listed = await client.get(
        f"/api/v1/tasks/{ctx['task_id']}/comments", headers=auth_header(admin_token)
    )
    assert listed.status_code == 200, listed.text
    listed_body = listed.json()
    assert listed_body["total"] == 2
    # Oldest first.
    assert [c["body"] for c in listed_body["items"]] == ["First comment", "Second comment"]


async def test_member_must_belong_to_project_to_comment(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    member = await invite_member(client, admin_token=admin_token)
    ctx = await _setup_project_and_task(client, admin_token)

    forbidden = await client.post(
        f"/api/v1/tasks/{ctx['task_id']}/comments",
        json={"body": "Should be blocked"},
        headers=auth_header(member["tokens"]["access_token"]),
    )
    assert forbidden.status_code == 404

    await client.post(
        f"/api/v1/projects/{ctx['project_id']}/members",
        json={"user_id": member["user"]["id"]},
        headers=auth_header(admin_token),
    )
    allowed = await client.post(
        f"/api/v1/tasks/{ctx['task_id']}/comments",
        json={"body": "Now allowed"},
        headers=auth_header(member["tokens"]["access_token"]),
    )
    assert allowed.status_code == 201


async def test_comment_on_a_task_in_another_organization_404s(client: AsyncClient):
    org_a = await register_admin(client, org_name="Org A")
    ctx = await _setup_project_and_task(client, org_a["tokens"]["access_token"])

    org_b = await register_admin(client, org_name="Org B")
    forbidden = await client.get(
        f"/api/v1/tasks/{ctx['task_id']}/comments",
        headers=auth_header(org_b["tokens"]["access_token"]),
    )
    assert forbidden.status_code == 404


async def test_user_cannot_delete_others_comment(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    member = await invite_member(client, admin_token=admin_token)
    ctx = await _setup_project_and_task(client, admin_token)
    await client.post(
        f"/api/v1/projects/{ctx['project_id']}/members",
        json={"user_id": member["user"]["id"]},
        headers=auth_header(admin_token),
    )

    created = await client.post(
        f"/api/v1/tasks/{ctx['task_id']}/comments",
        json={"body": "Mine"},
        headers=auth_header(member["tokens"]["access_token"]),
    )
    comment_id = created.json()["id"]

    other_member = await invite_member(client, admin_token=admin_token)
    await client.post(
        f"/api/v1/projects/{ctx['project_id']}/members",
        json={"user_id": other_member["user"]["id"]},
        headers=auth_header(admin_token),
    )
    forbidden = await client.delete(
        f"/api/v1/comments/{comment_id}",
        headers=auth_header(other_member["tokens"]["access_token"]),
    )
    assert forbidden.status_code == 403

    admin_delete = await client.delete(
        f"/api/v1/comments/{comment_id}", headers=auth_header(admin_token)
    )
    assert admin_delete.status_code == 204


async def test_delete_own_comment(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    ctx = await _setup_project_and_task(client, admin_token)

    created = await client.post(
        f"/api/v1/tasks/{ctx['task_id']}/comments",
        json={"body": "Delete me"},
        headers=auth_header(admin_token),
    )
    comment_id = created.json()["id"]

    deleted = await client.delete(
        f"/api/v1/comments/{comment_id}", headers=auth_header(admin_token)
    )
    assert deleted.status_code == 204

    listed = await client.get(
        f"/api/v1/tasks/{ctx['task_id']}/comments", headers=auth_header(admin_token)
    )
    assert listed.json()["total"] == 0


async def test_comment_body_length_validation(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    ctx = await _setup_project_and_task(client, admin_token)

    too_long = await client.post(
        f"/api/v1/tasks/{ctx['task_id']}/comments",
        json={"body": "x" * 5001},
        headers=auth_header(admin_token),
    )
    assert too_long.status_code == 422

    empty = await client.post(
        f"/api/v1/tasks/{ctx['task_id']}/comments",
        json={"body": ""},
        headers=auth_header(admin_token),
    )
    assert empty.status_code == 422
