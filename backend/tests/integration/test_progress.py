from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import task_progress_snapshot_repository
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


async def test_projected_progress_without_baseline_has_null_planned_percent(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project_id = await _create_project(client, admin_token)
    await _create_task(client, admin_token, project_id)

    response = await client.get(
        f"/api/v1/projects/{project_id}/progress/projected",
        params={"status_date": "2026-09-10"},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["baseline_id"] is None
    assert body["project_planned_percent_complete"] is None
    assert body["tasks"][0]["planned_percent_complete"] == 0


async def test_projected_progress_prorates_by_status_date(client: AsyncClient):
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

    before_start = await client.get(
        f"/api/v1/projects/{project_id}/progress/projected",
        params={"status_date": "2026-08-01"},
        headers=auth_header(admin_token),
    )
    assert before_start.status_code == 200, before_start.text
    before_body = before_start.json()
    assert before_body["baseline_id"] is not None
    assert before_body["project_planned_percent_complete"] == 0
    assert before_body["tasks"][0]["planned_percent_complete"] == 0
    assert before_body["tasks"][0]["actual_percent_complete"] == 40

    after_end = await client.get(
        f"/api/v1/projects/{project_id}/progress/projected",
        params={"status_date": "2026-12-31"},
        headers=auth_header(admin_token),
    )
    assert after_end.status_code == 200
    after_body = after_end.json()
    assert after_body["project_planned_percent_complete"] == 100
    assert after_body["tasks"][0]["planned_percent_complete"] == 100
    assert after_body["tasks"][0]["actual_percent_complete"] == 40


async def test_projected_progress_requires_status_date(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project_id = await _create_project(client, admin_token)

    response = await client.get(
        f"/api/v1/projects/{project_id}/progress/projected", headers=auth_header(admin_token)
    )
    assert response.status_code == 422


async def test_progress_history_reconstructs_actual_from_snapshots(
    client: AsyncClient, db_session: AsyncSession
):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project_id = await _create_project(client, admin_token)
    task = await _create_task(client, admin_token, project_id, budgeted_cost=1000)

    today = date.today()
    four_weeks_ago = today - timedelta(weeks=4)
    three_weeks_ago = today - timedelta(weeks=3)
    two_weeks_ago = today - timedelta(weeks=2)
    one_week_ago = today - timedelta(weeks=1)
    next_week = today + timedelta(weeks=1)

    task_uuid = task["id"]
    for snapshot_date, percent in [
        (three_weeks_ago, 0.0),
        (two_weeks_ago, 50.0),
        (today, 100.0),
    ]:
        await task_progress_snapshot_repository.upsert_many(
            db_session, project_id, snapshot_date, [(task_uuid, percent)]
        )
    await db_session.commit()

    response = await client.get(
        f"/api/v1/projects/{project_id}/progress/history",
        params={"start_date": four_weeks_ago, "end_date": next_week, "interval_days": 7},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    points_by_checkpoint = {p["checkpoint"]: p for p in body["points"]}

    assert points_by_checkpoint[str(four_weeks_ago)]["actual_percent_complete"] is None
    assert points_by_checkpoint[str(three_weeks_ago)]["actual_percent_complete"] == 0.0
    assert points_by_checkpoint[str(two_weeks_ago)]["actual_percent_complete"] == 50.0
    # Between two snapshots -> carries the most recent known value forward.
    assert points_by_checkpoint[str(one_week_ago)]["actual_percent_complete"] == 50.0
    assert points_by_checkpoint[str(today)]["actual_percent_complete"] == 100.0
    # Future checkpoint -> cut off, no actual value to show yet.
    assert points_by_checkpoint[str(next_week)]["actual_percent_complete"] is None

    # No baseline saved in this test -> nothing to compare planned progress against.
    assert all(p["planned_percent_complete"] is None for p in body["points"])


async def test_progress_history_has_planned_values_with_a_baseline(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project_id = await _create_project(client, admin_token)
    await _create_task(client, admin_token, project_id, duration_days=20)
    await client.post(
        f"/api/v1/projects/{project_id}/baselines",
        json={"name": "Plan A"},
        headers=auth_header(admin_token),
    )

    today = date.today()
    response = await client.get(
        f"/api/v1/projects/{project_id}/progress/history",
        params={
            "start_date": today,
            "end_date": today + timedelta(weeks=6),
            "interval_days": 7,
        },
        headers=auth_header(admin_token),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert any(p["planned_percent_complete"] is not None for p in body["points"])


async def test_progress_history_rejects_end_before_start(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project_id = await _create_project(client, admin_token)

    today = date.today()
    response = await client.get(
        f"/api/v1/projects/{project_id}/progress/history",
        params={"start_date": today, "end_date": today - timedelta(days=1), "interval_days": 7},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 400


async def test_progress_history_rejects_invalid_interval(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project_id = await _create_project(client, admin_token)

    today = date.today()
    response = await client.get(
        f"/api/v1/projects/{project_id}/progress/history",
        params={"start_date": today, "end_date": today, "interval_days": 0},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 422


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
