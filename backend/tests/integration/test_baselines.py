import pytest
from httpx import AsyncClient

from tests.fixtures.auth import auth_header, invite_member, register_admin

pytestmark = pytest.mark.asyncio


async def _setup_project_with_task(client: AsyncClient, admin_token: str) -> dict:
    project = await client.post(
        "/api/v1/projects", json={"name": "Baseline Test"}, headers=auth_header(admin_token)
    )
    project_id = project.json()["id"]
    task = await client.post(
        f"/api/v1/projects/{project_id}/tasks",
        json={
            "name": "Task A",
            "start_date": "2026-09-14",
            "duration_days": 3,
            "budgeted_cost": 1000,
        },
        headers=auth_header(admin_token),
    )
    return {"project_id": project_id, "task": task.json()}


async def test_admin_can_save_baseline_snapshotting_tasks(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    ctx = await _setup_project_with_task(client, admin_token)

    response = await client.post(
        f"/api/v1/projects/{ctx['project_id']}/baselines",
        json={"name": "Initial Plan"},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "Initial Plan"
    assert len(body["baseline_tasks"]) == 1
    bt = body["baseline_tasks"][0]
    assert bt["task_id"] == ctx["task"]["id"]
    assert bt["planned_start_date"] == ctx["task"]["start_date"]
    assert bt["planned_end_date"] == ctx["task"]["end_date"]
    assert float(bt["planned_cost"]) == 1000.0


async def test_member_cannot_save_baseline(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    member = await invite_member(client, admin_token=admin_token)
    ctx = await _setup_project_with_task(client, admin_token)
    await client.post(
        f"/api/v1/projects/{ctx['project_id']}/members",
        json={"user_id": member["user"]["id"]},
        headers=auth_header(admin_token),
    )

    response = await client.post(
        f"/api/v1/projects/{ctx['project_id']}/baselines",
        json={"name": "Should fail"},
        headers=auth_header(member["tokens"]["access_token"]),
    )
    assert response.status_code == 403


async def test_baseline_captures_a_point_in_time_snapshot(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    ctx = await _setup_project_with_task(client, admin_token)

    first_baseline = await client.post(
        f"/api/v1/projects/{ctx['project_id']}/baselines",
        json={"name": "First"},
        headers=auth_header(admin_token),
    )
    first_id = first_baseline.json()["id"]

    # Change the task's schedule after the baseline was saved.
    await client.patch(
        f"/api/v1/tasks/{ctx['task']['id']}",
        json={"start_date": "2026-09-21"},
        headers=auth_header(admin_token),
    )

    # The historical baseline should still reflect the original dates.
    reread = await client.get(f"/api/v1/baselines/{first_id}", headers=auth_header(admin_token))
    assert reread.json()["baseline_tasks"][0]["planned_start_date"] == "2026-09-14"


async def test_list_baselines_for_project(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    ctx = await _setup_project_with_task(client, admin_token)

    await client.post(
        f"/api/v1/projects/{ctx['project_id']}/baselines",
        json={"name": "First"},
        headers=auth_header(admin_token),
    )
    await client.post(
        f"/api/v1/projects/{ctx['project_id']}/baselines",
        json={"name": "Second"},
        headers=auth_header(admin_token),
    )

    response = await client.get(
        f"/api/v1/projects/{ctx['project_id']}/baselines", headers=auth_header(admin_token)
    )
    assert response.status_code == 200
    assert response.json()["total"] == 2
