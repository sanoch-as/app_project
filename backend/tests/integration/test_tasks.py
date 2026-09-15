import pytest
from httpx import AsyncClient

from tests.fixtures.auth import auth_header, invite_member, register_admin

pytestmark = pytest.mark.asyncio


async def _create_project(client: AsyncClient, admin_token: str, **overrides) -> dict:
    payload = {"name": "Test Project", "working_days_per_week": 5}
    payload.update(overrides)
    response = await client.post("/api/v1/projects", json=payload, headers=auth_header(admin_token))
    assert response.status_code == 201, response.text
    return response.json()


async def test_create_task_computes_end_date_from_working_calendar(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = await _create_project(client, admin_token)

    # Friday + 2 working days = the following Monday (weekend skipped).
    response = await client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={"name": "Design phase", "start_date": "2026-09-18", "duration_days": 2},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 201, response.text
    task = response.json()
    assert task["start_date"] == "2026-09-18"
    assert task["end_date"] == "2026-09-21"
    assert task["wbs_code"] == "1"
    assert task["status"] == "not_started"
    # A lone task with no dependencies has zero float — it's trivially critical.
    assert task["is_critical"] is True
    assert task["total_float"] == 0


async def test_milestone_has_zero_duration_and_same_start_end(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = await _create_project(client, admin_token)

    response = await client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={
            "name": "Kickoff",
            "start_date": "2026-09-14",
            "duration_days": 0,
            "is_milestone": True,
        },
        headers=auth_header(admin_token),
    )
    assert response.status_code == 201, response.text
    task = response.json()
    assert task["duration_days"] == 0
    assert task["start_date"] == task["end_date"] == "2026-09-14"


async def test_subtask_gets_hierarchical_wbs_code(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = await _create_project(client, admin_token)

    parent = await client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={"name": "Parent", "start_date": "2026-09-14", "duration_days": 5},
        headers=auth_header(admin_token),
    )
    parent_id = parent.json()["id"]

    child_one = await client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={
            "name": "Child 1",
            "parent_task_id": parent_id,
            "start_date": "2026-09-14",
            "duration_days": 1,
        },
        headers=auth_header(admin_token),
    )
    child_two = await client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={
            "name": "Child 2",
            "parent_task_id": parent_id,
            "start_date": "2026-09-15",
            "duration_days": 1,
        },
        headers=auth_header(admin_token),
    )
    assert child_one.json()["wbs_code"] == "1.1"
    assert child_two.json()["wbs_code"] == "1.2"


async def test_task_assignee_must_belong_to_organization(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = await _create_project(client, admin_token)

    response = await client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={
            "name": "Orphan assignee",
            "start_date": "2026-09-14",
            "duration_days": 1,
            "assignees": [{"user_id": "00000000-0000-0000-0000-000000000000"}],
        },
        headers=auth_header(admin_token),
    )
    assert response.status_code == 422


async def test_task_assignee_valid_user_is_attached(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    member = await invite_member(client, admin_token=admin_token)
    project = await _create_project(client, admin_token)

    response = await client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={
            "name": "Assigned task",
            "start_date": "2026-09-14",
            "duration_days": 1,
            "assignees": [{"user_id": member["user"]["id"], "allocation_percent": 50}],
        },
        headers=auth_header(admin_token),
    )
    assert response.status_code == 201, response.text
    task = response.json()
    assert len(task["assignees"]) == 1
    assert task["assignees"][0]["user"]["id"] == member["user"]["id"]
    assert task["assignees"][0]["allocation_percent"] == 50


async def test_member_can_create_task_only_in_projects_they_belong_to(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    member = await invite_member(client, admin_token=admin_token)
    member_token = member["tokens"]["access_token"]

    project = await _create_project(client, admin_token)

    forbidden = await client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={"name": "Should be hidden", "start_date": "2026-09-14", "duration_days": 1},
        headers=auth_header(member_token),
    )
    assert forbidden.status_code == 404

    await client.post(
        f"/api/v1/projects/{project['id']}/members",
        json={"user_id": member["user"]["id"]},
        headers=auth_header(admin_token),
    )

    allowed = await client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={"name": "Now allowed", "start_date": "2026-09-14", "duration_days": 1},
        headers=auth_header(member_token),
    )
    assert allowed.status_code == 201


async def test_update_task_recomputes_end_date_on_duration_change(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = await _create_project(client, admin_token)

    task = await client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={"name": "Task A", "start_date": "2026-09-14", "duration_days": 1},
        headers=auth_header(admin_token),
    )
    task_id = task.json()["id"]
    assert task.json()["end_date"] == "2026-09-14"

    updated = await client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"duration_days": 3},
        headers=auth_header(admin_token),
    )
    assert updated.status_code == 200
    assert updated.json()["end_date"] == "2026-09-16"


async def test_delete_task_cascades_to_children(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = await _create_project(client, admin_token)

    parent = await client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={"name": "Parent", "start_date": "2026-09-14", "duration_days": 5},
        headers=auth_header(admin_token),
    )
    parent_id = parent.json()["id"]
    child = await client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={
            "name": "Child",
            "parent_task_id": parent_id,
            "start_date": "2026-09-14",
            "duration_days": 1,
        },
        headers=auth_header(admin_token),
    )
    child_id = child.json()["id"]

    delete_response = await client.delete(
        f"/api/v1/tasks/{parent_id}", headers=auth_header(admin_token)
    )
    assert delete_response.status_code == 204

    child_get = await client.get(f"/api/v1/tasks/{child_id}", headers=auth_header(admin_token))
    assert child_get.status_code == 404


async def test_list_tasks_filters_by_status(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = await _create_project(client, admin_token)

    task = await client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={"name": "In progress task", "start_date": "2026-09-14", "duration_days": 1},
        headers=auth_header(admin_token),
    )
    task_id = task.json()["id"]
    await client.patch(
        f"/api/v1/tasks/{task_id}", json={"status": "in_progress"}, headers=auth_header(admin_token)
    )
    await client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={"name": "Not started task", "start_date": "2026-09-14", "duration_days": 1},
        headers=auth_header(admin_token),
    )

    response = await client.get(
        f"/api/v1/projects/{project['id']}/tasks?status=in_progress",
        headers=auth_header(admin_token),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == task_id
