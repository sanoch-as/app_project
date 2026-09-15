import pytest
from httpx import AsyncClient

from tests.fixtures.auth import auth_header, register_admin

pytestmark = pytest.mark.asyncio


async def _create_project(client: AsyncClient, admin_token: str) -> str:
    response = await client.post(
        "/api/v1/projects", json={"name": "Progress Test"}, headers=auth_header(admin_token)
    )
    return response.json()["id"]


async def _create_task(client: AsyncClient, admin_token: str, project_id: str, **overrides) -> dict:
    payload = {
        "name": "Task",
        "start_date": "2026-09-01",
        "duration_days": 5,
        "budgeted_cost": 1000,
    }
    payload.update(overrides)
    response = await client.post(
        f"/api/v1/projects/{project_id}/tasks", json=payload, headers=auth_header(admin_token)
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_progress_with_no_baseline_has_zero_pv_and_null_spi(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project_id = await _create_project(client, admin_token)
    await _create_task(client, admin_token, project_id)

    response = await client.get(
        f"/api/v1/projects/{project_id}/progress", headers=auth_header(admin_token)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["current"]["pv"] == 0
    assert body["current"]["spi"] is None
    assert body["s_curve"] == []


async def test_progress_reflects_baseline_and_percent_complete(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project_id = await _create_project(client, admin_token)
    task = await _create_task(client, admin_token, project_id)

    await client.post(
        f"/api/v1/projects/{project_id}/baselines",
        json={"name": "Plan A"},
        headers=auth_header(admin_token),
    )
    await client.patch(
        f"/api/v1/tasks/{task['id']}",
        json={"percent_complete": 40},
        headers=auth_header(admin_token),
    )

    response = await client.get(
        f"/api/v1/projects/{project_id}/progress", headers=auth_header(admin_token)
    )
    assert response.status_code == 200
    body = response.json()
    assert body["current"]["ev"] == 400.0
    assert len(body["s_curve"]) > 0
    assert body["s_curve"][-1]["pv"] == 1000.0


async def test_worklog_hours_increase_ac_and_cpi_reacts(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project_id = await _create_project(client, admin_token)
    task = await _create_task(client, admin_token, project_id)

    await client.patch(
        f"/api/v1/users/{admin['user']['id']}",
        json={"cost_per_hour": 50},
        headers=auth_header(admin_token),
    )
    await client.patch(
        f"/api/v1/tasks/{task['id']}",
        json={"percent_complete": 50},
        headers=auth_header(admin_token),
    )
    await client.post(
        f"/api/v1/tasks/{task['id']}/worklogs",
        json={"work_date": "2026-09-02", "hours": 10},
        headers=auth_header(admin_token),
    )

    response = await client.get(
        f"/api/v1/projects/{project_id}/progress", headers=auth_header(admin_token)
    )
    body = response.json()
    assert body["current"]["ac"] == 500.0  # 10h * $50/h
    assert body["current"]["ev"] == 500.0  # 50% of 1000
    assert body["current"]["cpi"] == 1.0


async def test_recalculate_persists_a_progress_snapshot(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project_id = await _create_project(client, admin_token)
    await _create_task(client, admin_token, project_id)
    await client.post(
        f"/api/v1/projects/{project_id}/baselines",
        json={"name": "Plan A"},
        headers=auth_header(admin_token),
    )

    response = await client.post(
        f"/api/v1/projects/{project_id}/progress/recalculate", headers=auth_header(admin_token)
    )
    assert response.status_code == 200, response.text
    assert "status_date" in response.json()


async def test_recalculate_all_requires_cron_secret(client: AsyncClient):
    unauthorized = await client.post("/api/v1/progress/recalculate-all")
    assert unauthorized.status_code == 401

    wrong_secret = await client.post(
        "/api/v1/progress/recalculate-all", headers={"Authorization": "Bearer wrong-secret"}
    )
    assert wrong_secret.status_code == 401

    authorized = await client.post(
        "/api/v1/progress/recalculate-all",
        headers={"Authorization": "Bearer test-cron"},
    )
    assert authorized.status_code == 200
    assert "projects_recalculated" in authorized.json()
