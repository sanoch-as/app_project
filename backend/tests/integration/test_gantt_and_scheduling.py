import pytest
from httpx import AsyncClient

from tests.fixtures.auth import auth_header, register_admin

pytestmark = pytest.mark.asyncio


async def _create_project(client: AsyncClient, admin_token: str) -> str:
    response = await client.post(
        "/api/v1/projects", json={"name": "Scheduling Test"}, headers=auth_header(admin_token)
    )
    return response.json()["id"]


async def _create_task(client: AsyncClient, admin_token: str, project_id: str, **overrides) -> dict:
    payload = {"name": "Task", "start_date": "2026-09-14", "duration_days": 1}
    payload.update(overrides)
    response = await client.post(
        f"/api/v1/projects/{project_id}/tasks", json=payload, headers=auth_header(admin_token)
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_gantt_endpoint_returns_tasks_and_dependencies(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project_id = await _create_project(client, admin_token)

    task_a = await _create_task(client, admin_token, project_id, name="A")
    task_b = await _create_task(
        client, admin_token, project_id, name="B", start_date="2026-09-15"
    )
    await client.post(
        f"/api/v1/tasks/{task_a['id']}/dependencies",
        json={"successor_id": task_b["id"]},
        headers=auth_header(admin_token),
    )

    response = await client.get(
        f"/api/v1/projects/{project_id}/gantt", headers=auth_header(admin_token)
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["tasks"]) == 2
    assert len(body["dependencies"]) == 1
    assert body["dependencies"][0]["predecessor_id"] == task_a["id"]


async def test_creating_dependency_marks_chain_critical(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project_id = await _create_project(client, admin_token)

    task_a = await _create_task(client, admin_token, project_id, name="A", duration_days=1)
    task_b = await _create_task(
        client, admin_token, project_id, name="B", start_date="2026-09-14", duration_days=1
    )

    await client.post(
        f"/api/v1/tasks/{task_a['id']}/dependencies",
        json={"successor_id": task_b["id"]},
        headers=auth_header(admin_token),
    )

    a_after = (
        await client.get(f"/api/v1/tasks/{task_a['id']}", headers=auth_header(admin_token))
    ).json()
    b_after = (
        await client.get(f"/api/v1/tasks/{task_b['id']}", headers=auth_header(admin_token))
    ).json()

    # A single-chain FS dependency with no parallel path: both are on the
    # critical path (zero float).
    assert a_after["is_critical"] is True
    assert b_after["is_critical"] is True
    assert b_after["total_float"] == 0


async def test_parallel_path_gets_float_via_api(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project_id = await _create_project(client, admin_token)

    start_task = await _create_task(client, admin_token, project_id, name="Start", duration_days=1)
    long_path = await _create_task(
        client, admin_token, project_id, name="Long", start_date="2026-09-14", duration_days=5
    )
    short_path = await _create_task(
        client, admin_token, project_id, name="Short", start_date="2026-09-14", duration_days=1
    )
    join_task = await _create_task(
        client, admin_token, project_id, name="Join", start_date="2026-09-14", duration_days=1
    )

    for succ in (long_path, short_path):
        await client.post(
            f"/api/v1/tasks/{start_task['id']}/dependencies",
            json={"successor_id": succ["id"]},
            headers=auth_header(admin_token),
        )
    for pred in (long_path, short_path):
        await client.post(
            f"/api/v1/tasks/{pred['id']}/dependencies",
            json={"successor_id": join_task["id"]},
            headers=auth_header(admin_token),
        )

    short_after = (
        await client.get(f"/api/v1/tasks/{short_path['id']}", headers=auth_header(admin_token))
    ).json()
    long_after = (
        await client.get(f"/api/v1/tasks/{long_path['id']}", headers=auth_header(admin_token))
    ).json()

    assert long_after["is_critical"] is True
    assert short_after["is_critical"] is False
    assert short_after["total_float"] > 0


async def test_moving_predecessor_cascades_successor_start_date(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project_id = await _create_project(client, admin_token)

    predecessor = await _create_task(
        client, admin_token, project_id, name="Pred", start_date="2026-09-14", duration_days=1
    )
    successor = await _create_task(
        client, admin_token, project_id, name="Succ", start_date="2026-09-15", duration_days=1
    )
    await client.post(
        f"/api/v1/tasks/{predecessor['id']}/dependencies",
        json={"successor_id": successor["id"]},
        headers=auth_header(admin_token),
    )

    # Push the predecessor's start forward well past the successor's current start.
    await client.patch(
        f"/api/v1/tasks/{predecessor['id']}",
        json={"start_date": "2026-09-18"},
        headers=auth_header(admin_token),
    )

    successor_after = (
        await client.get(f"/api/v1/tasks/{successor['id']}", headers=auth_header(admin_token))
    ).json()
    assert successor_after["start_date"] == "2026-09-18"
