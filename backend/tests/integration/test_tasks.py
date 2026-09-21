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


async def _create_task(client: AsyncClient, admin_token: str, project_id: str, **overrides) -> dict:
    payload = {"name": "Task", "start_date": "2026-09-14", "duration_days": 1}
    payload.update(overrides)
    response = await client.post(
        f"/api/v1/projects/{project_id}/tasks", json=payload, headers=auth_header(admin_token)
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_parent_task_is_excluded_from_critical_path(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = await _create_project(client, admin_token)

    parent = await _create_task(client, admin_token, project["id"], name="Parent", duration_days=5)
    assert parent["is_critical"] is True  # a lone leaf task is trivially critical

    await _create_task(
        client, admin_token, project["id"], name="Child", parent_task_id=parent["id"]
    )

    parent_after = await client.get(
        f"/api/v1/tasks/{parent['id']}", headers=auth_header(admin_token)
    )
    body = parent_after.json()
    assert body["is_critical"] is False
    assert body["total_float"] is None
    assert body["early_start"] is None
    assert body["early_finish"] is None
    assert body["late_start"] is None
    assert body["late_finish"] is None


async def test_creating_children_rolls_up_dates_and_cost_through_grandparent(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = await _create_project(client, admin_token)

    grandparent = await _create_task(client, admin_token, project["id"], name="Grandparent")
    parent = await _create_task(
        client,
        admin_token,
        project["id"],
        name="Parent",
        parent_task_id=grandparent["id"],
    )
    child_one = await _create_task(
        client,
        admin_token,
        project["id"],
        name="Child 1",
        parent_task_id=parent["id"],
        start_date="2026-09-14",
        duration_days=1,
        budgeted_cost=800,
    )
    await _create_task(
        client,
        admin_token,
        project["id"],
        name="Child 2",
        parent_task_id=parent["id"],
        start_date="2026-09-16",
        duration_days=3,
        budgeted_cost=200,
    )

    for task_id in (parent["id"], grandparent["id"]):
        rolled_up = (
            await client.get(f"/api/v1/tasks/{task_id}", headers=auth_header(admin_token))
        ).json()
        assert rolled_up["start_date"] == "2026-09-14"
        assert rolled_up["end_date"] == "2026-09-18"
        assert rolled_up["duration_days"] == 5
        assert rolled_up["budgeted_cost"] == 1000
        assert rolled_up["percent_complete"] == 0

    # Completing child 1 (duration 1 of the group's 4 total, MS Project-style
    # duration-weighted) should bubble a weighted 25% up through parent and
    # grandparent — (100*1 + 0*3) / 4 = 25%, not 80% (that would be
    # cost-weighted: 800 of the group's 1000 total cost).
    await client.patch(
        f"/api/v1/tasks/{child_one['id']}",
        json={"percent_complete": 100},
        headers=auth_header(admin_token),
    )
    for task_id in (parent["id"], grandparent["id"]):
        rolled_up = (
            await client.get(f"/api/v1/tasks/{task_id}", headers=auth_header(admin_token))
        ).json()
        assert rolled_up["percent_complete"] == 25


async def test_rollup_percent_complete_updates_even_without_any_budgeted_cost(
    client: AsyncClient,
):
    # Regression test: a parent's percent_complete used to freeze at 0%
    # forever whenever none of its children had a budgeted_cost set (the
    # cost-weighted formula divides by zero total cost) — it should instead
    # fall back to a plain average across children.
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = await _create_project(client, admin_token)

    parent = await _create_task(client, admin_token, project["id"], name="Parent")
    child = await _create_task(
        client, admin_token, project["id"], name="Child", parent_task_id=parent["id"]
    )
    assert child["budgeted_cost"] == 0

    rolled_up_before = (
        await client.get(f"/api/v1/tasks/{parent['id']}", headers=auth_header(admin_token))
    ).json()
    assert rolled_up_before["percent_complete"] == 0

    await client.patch(
        f"/api/v1/tasks/{child['id']}",
        json={"percent_complete": 60},
        headers=auth_header(admin_token),
    )

    rolled_up_after = (
        await client.get(f"/api/v1/tasks/{parent['id']}", headers=auth_header(admin_token))
    ).json()
    assert rolled_up_after["percent_complete"] == 60


async def test_update_task_with_children_rejects_direct_rollup_field_edits(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = await _create_project(client, admin_token)

    parent = await _create_task(client, admin_token, project["id"], name="Parent")
    await _create_task(
        client, admin_token, project["id"], name="Child", parent_task_id=parent["id"]
    )

    blocked = await client.patch(
        f"/api/v1/tasks/{parent['id']}",
        json={"budgeted_cost": 500},
        headers=auth_header(admin_token),
    )
    assert blocked.status_code == 422
    assert blocked.json()["code"] == "parent_task_readonly_fields"

    allowed = await client.patch(
        f"/api/v1/tasks/{parent['id']}",
        json={"name": "Renamed parent"},
        headers=auth_header(admin_token),
    )
    assert allowed.status_code == 200
    assert allowed.json()["name"] == "Renamed parent"


async def test_update_task_end_date_only_derives_duration_days(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = await _create_project(client, admin_token)

    task = await _create_task(
        client, admin_token, project["id"], start_date="2026-09-14", duration_days=1
    )
    assert task["end_date"] == "2026-09-14"

    updated = await client.patch(
        f"/api/v1/tasks/{task['id']}",
        json={"end_date": "2026-09-18"},
        headers=auth_header(admin_token),
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["end_date"] == "2026-09-18"
    assert body["duration_days"] == 5


async def test_update_task_end_date_before_start_date_is_rejected(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = await _create_project(client, admin_token)

    task = await _create_task(
        client, admin_token, project["id"], start_date="2026-09-14", duration_days=5
    )

    response = await client.patch(
        f"/api/v1/tasks/{task['id']}",
        json={"end_date": "2026-09-10"},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_end_date"


async def test_move_task_reparents_and_renumbers_siblings(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = await _create_project(client, admin_token)

    task_a = await _create_task(client, admin_token, project["id"], name="A")
    task_b = await _create_task(client, admin_token, project["id"], name="B")
    child_of_b = await _create_task(
        client, admin_token, project["id"], name="B child", parent_task_id=task_b["id"]
    )
    assert task_a["wbs_code"] == "1"
    assert task_b["wbs_code"] == "2"
    assert child_of_b["wbs_code"] == "2.1"

    moved = await client.post(
        f"/api/v1/tasks/{task_a['id']}/move",
        json={"parent_task_id": task_b["id"], "position": 0},
        headers=auth_header(admin_token),
    )
    assert moved.status_code == 200, moved.text
    moved_body = moved.json()
    assert moved_body["parent_task_id"] == task_b["id"]
    assert moved_body["wbs_code"] == "2.1"

    sibling_after = await client.get(
        f"/api/v1/tasks/{child_of_b['id']}", headers=auth_header(admin_token)
    )
    assert sibling_after.json()["wbs_code"] == "2.2"


async def test_move_task_cascades_wbs_code_to_its_own_descendants(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = await _create_project(client, admin_token)

    root = await _create_task(client, admin_token, project["id"], name="Root")
    other_root = await _create_task(client, admin_token, project["id"], name="Other root")
    moved_subtree = await _create_task(
        client, admin_token, project["id"], name="Subtree head", parent_task_id=root["id"]
    )
    grandchild = await _create_task(
        client,
        admin_token,
        project["id"],
        name="Grandchild",
        parent_task_id=moved_subtree["id"],
    )
    assert moved_subtree["wbs_code"] == "1.1"
    assert grandchild["wbs_code"] == "1.1.1"

    moved = await client.post(
        f"/api/v1/tasks/{moved_subtree['id']}/move",
        json={"parent_task_id": other_root["id"], "position": 0},
        headers=auth_header(admin_token),
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["wbs_code"] == "2.1"

    grandchild_after = await client.get(
        f"/api/v1/tasks/{grandchild['id']}", headers=auth_header(admin_token)
    )
    assert grandchild_after.json()["wbs_code"] == "2.1.1"
    assert grandchild_after.json()["parent_task_id"] == moved_subtree["id"]


async def test_move_task_rejects_cycle(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = await _create_project(client, admin_token)

    parent = await _create_task(client, admin_token, project["id"], name="Parent")
    child = await _create_task(
        client, admin_token, project["id"], name="Child", parent_task_id=parent["id"]
    )

    response = await client.post(
        f"/api/v1/tasks/{parent['id']}/move",
        json={"parent_task_id": child["id"], "position": 0},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 422
    assert response.json()["code"] == "task_move_cycle"


async def test_absurd_duration_days_is_rejected(client: AsyncClient):
    # services/working_calendar.py walks one calendar day at a time, so an
    # unbounded duration would let a single request hang indefinitely.
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = await _create_project(client, admin_token)

    response = await client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={"name": "Runaway task", "start_date": "2026-09-14", "duration_days": 10_000_000},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 422
