import pytest
from httpx import AsyncClient

from tests.fixtures.auth import auth_header, register_admin

pytestmark = pytest.mark.asyncio


async def _create_project_and_tasks(client: AsyncClient, admin_token: str, count: int) -> dict:
    project = await client.post(
        "/api/v1/projects", json={"name": "Dependency Test"}, headers=auth_header(admin_token)
    )
    project_id = project.json()["id"]
    task_ids = []
    for i in range(count):
        task = await client.post(
            f"/api/v1/projects/{project_id}/tasks",
            json={"name": f"Task {i}", "start_date": "2026-09-14", "duration_days": 1},
            headers=auth_header(admin_token),
        )
        task_ids.append(task.json()["id"])
    return {"project_id": project_id, "task_ids": task_ids}


async def test_create_simple_dependency(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    ctx = await _create_project_and_tasks(client, admin_token, 2)

    response = await client.post(
        f"/api/v1/tasks/{ctx['task_ids'][0]}/dependencies",
        json={"successor_id": ctx["task_ids"][1], "dependency_type": "FS", "lag_days": 2},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["predecessor_id"] == ctx["task_ids"][0]
    assert body["successor_id"] == ctx["task_ids"][1]
    assert body["lag_days"] == 2


async def test_self_dependency_rejected(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    ctx = await _create_project_and_tasks(client, admin_token, 1)

    response = await client.post(
        f"/api/v1/tasks/{ctx['task_ids'][0]}/dependencies",
        json={"successor_id": ctx["task_ids"][0]},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 422


async def test_duplicate_dependency_rejected(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    ctx = await _create_project_and_tasks(client, admin_token, 2)

    await client.post(
        f"/api/v1/tasks/{ctx['task_ids'][0]}/dependencies",
        json={"successor_id": ctx["task_ids"][1]},
        headers=auth_header(admin_token),
    )
    response = await client.post(
        f"/api/v1/tasks/{ctx['task_ids'][0]}/dependencies",
        json={"successor_id": ctx["task_ids"][1]},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 409


async def test_cyclic_dependency_rejected(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    ctx = await _create_project_and_tasks(client, admin_token, 3)
    t0, t1, t2 = ctx["task_ids"]

    await client.post(
        f"/api/v1/tasks/{t0}/dependencies",
        json={"successor_id": t1},
        headers=auth_header(admin_token),
    )
    await client.post(
        f"/api/v1/tasks/{t1}/dependencies",
        json={"successor_id": t2},
        headers=auth_header(admin_token),
    )

    response = await client.post(
        f"/api/v1/tasks/{t2}/dependencies",
        json={"successor_id": t0},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 422
    assert response.json()["code"] == "dependency_cycle"


async def test_delete_dependency(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    ctx = await _create_project_and_tasks(client, admin_token, 2)

    create_response = await client.post(
        f"/api/v1/tasks/{ctx['task_ids'][0]}/dependencies",
        json={"successor_id": ctx["task_ids"][1]},
        headers=auth_header(admin_token),
    )
    dependency_id = create_response.json()["id"]

    delete_response = await client.delete(
        f"/api/v1/dependencies/{dependency_id}", headers=auth_header(admin_token)
    )
    assert delete_response.status_code == 204

    # Deleting again should now 404.
    second_delete = await client.delete(
        f"/api/v1/dependencies/{dependency_id}", headers=auth_header(admin_token)
    )
    assert second_delete.status_code == 404


async def test_successor_must_be_in_same_project(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    ctx_a = await _create_project_and_tasks(client, admin_token, 1)
    ctx_b = await _create_project_and_tasks(client, admin_token, 1)

    response = await client.post(
        f"/api/v1/tasks/{ctx_a['task_ids'][0]}/dependencies",
        json={"successor_id": ctx_b["task_ids"][0]},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 422


async def test_absurd_lag_days_is_rejected(client: AsyncClient):
    # Same rationale as the duration_days bound on tasks: unbounded lag would
    # let services/working_calendar.py's day-by-day walk hang a request.
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    ctx = await _create_project_and_tasks(client, admin_token, 2)

    response = await client.post(
        f"/api/v1/tasks/{ctx['task_ids'][0]}/dependencies",
        json={"successor_id": ctx["task_ids"][1], "lag_days": 10_000_000},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 422
