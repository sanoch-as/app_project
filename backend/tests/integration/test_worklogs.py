import pytest
from httpx import AsyncClient

from tests.fixtures.auth import auth_header, invite_member, register_admin

pytestmark = pytest.mark.asyncio


async def _setup_project_and_task(client: AsyncClient, admin_token: str) -> dict:
    project = await client.post(
        "/api/v1/projects", json={"name": "Worklog Test"}, headers=auth_header(admin_token)
    )
    project_id = project.json()["id"]
    task = await client.post(
        f"/api/v1/projects/{project_id}/tasks",
        json={"name": "Task A", "start_date": "2026-09-14", "duration_days": 3},
        headers=auth_header(admin_token),
    )
    return {"project_id": project_id, "task_id": task.json()["id"]}


async def test_log_hours_on_a_task(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    ctx = await _setup_project_and_task(client, admin_token)

    response = await client.post(
        f"/api/v1/tasks/{ctx['task_id']}/worklogs",
        json={"work_date": "2026-09-14", "hours": 4.5, "description": "Initial design work"},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["hours"] == 4.5
    assert body["task_id"] == ctx["task_id"]


async def test_member_must_belong_to_project_to_log_hours(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    member = await invite_member(client, admin_token=admin_token)
    ctx = await _setup_project_and_task(client, admin_token)

    forbidden = await client.post(
        f"/api/v1/tasks/{ctx['task_id']}/worklogs",
        json={"work_date": "2026-09-14", "hours": 2},
        headers=auth_header(member["tokens"]["access_token"]),
    )
    assert forbidden.status_code == 404

    await client.post(
        f"/api/v1/projects/{ctx['project_id']}/members",
        json={"user_id": member["user"]["id"]},
        headers=auth_header(admin_token),
    )
    allowed = await client.post(
        f"/api/v1/tasks/{ctx['task_id']}/worklogs",
        json={"work_date": "2026-09-14", "hours": 2},
        headers=auth_header(member["tokens"]["access_token"]),
    )
    assert allowed.status_code == 201


async def test_user_cannot_modify_others_worklog(client: AsyncClient):
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
        f"/api/v1/tasks/{ctx['task_id']}/worklogs",
        json={"work_date": "2026-09-14", "hours": 3},
        headers=auth_header(member["tokens"]["access_token"]),
    )
    worklog_id = created.json()["id"]

    # A different member (not the owner, not admin) cannot touch it.
    other_member = await invite_member(client, admin_token=admin_token)
    forbidden = await client.patch(
        f"/api/v1/worklogs/{worklog_id}",
        json={"hours": 8},
        headers=auth_header(other_member["tokens"]["access_token"]),
    )
    assert forbidden.status_code == 403

    # The admin CAN modify anyone's worklog.
    admin_edit = await client.patch(
        f"/api/v1/worklogs/{worklog_id}",
        json={"hours": 1},
        headers=auth_header(admin_token),
    )
    assert admin_edit.status_code == 200
    assert admin_edit.json()["hours"] == 1


async def test_update_and_delete_own_worklog(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    ctx = await _setup_project_and_task(client, admin_token)

    created = await client.post(
        f"/api/v1/tasks/{ctx['task_id']}/worklogs",
        json={"work_date": "2026-09-14", "hours": 2},
        headers=auth_header(admin_token),
    )
    worklog_id = created.json()["id"]

    updated = await client.patch(
        f"/api/v1/worklogs/{worklog_id}",
        json={"hours": 5, "description": "revised"},
        headers=auth_header(admin_token),
    )
    assert updated.status_code == 200
    assert updated.json()["hours"] == 5
    assert updated.json()["description"] == "revised"

    deleted = await client.delete(
        f"/api/v1/worklogs/{worklog_id}", headers=auth_header(admin_token)
    )
    assert deleted.status_code == 204

    listing = await client.get(
        f"/api/v1/tasks/{ctx['task_id']}/worklogs", headers=auth_header(admin_token)
    )
    assert listing.json()["total"] == 0


async def test_worklogs_report_filters_by_project_and_date_range(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    ctx = await _setup_project_and_task(client, admin_token)

    await client.post(
        f"/api/v1/tasks/{ctx['task_id']}/worklogs",
        json={"work_date": "2026-09-14", "hours": 2},
        headers=auth_header(admin_token),
    )
    await client.post(
        f"/api/v1/tasks/{ctx['task_id']}/worklogs",
        json={"work_date": "2026-09-20", "hours": 3},
        headers=auth_header(admin_token),
    )

    response = await client.get(
        "/api/v1/reports/worklogs",
        params={"project_id": ctx["project_id"], "from": "2026-09-14", "to": "2026-09-16"},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["hours"] == 2


async def test_member_report_restricted_to_their_projects(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    member = await invite_member(client, admin_token=admin_token)

    ctx_visible = await _setup_project_and_task(client, admin_token)
    ctx_hidden = await _setup_project_and_task(client, admin_token)
    await client.post(
        f"/api/v1/projects/{ctx_visible['project_id']}/members",
        json={"user_id": member["user"]["id"]},
        headers=auth_header(admin_token),
    )

    await client.post(
        f"/api/v1/tasks/{ctx_visible['task_id']}/worklogs",
        json={"work_date": "2026-09-14", "hours": 2},
        headers=auth_header(member["tokens"]["access_token"]),
    )
    await client.post(
        f"/api/v1/tasks/{ctx_hidden['task_id']}/worklogs",
        json={"work_date": "2026-09-14", "hours": 5},
        headers=auth_header(admin_token),
    )

    response = await client.get(
        "/api/v1/reports/worklogs", headers=auth_header(member["tokens"]["access_token"])
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["hours"] == 2
