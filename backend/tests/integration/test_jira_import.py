import csv
import io

import pytest
from httpx import AsyncClient

from app.services.jira_csv_parser import PROJECT_ROOT_ISSUE_KEY
from tests.fixtures.auth import auth_header, invite_member, register_admin

pytestmark = pytest.mark.asyncio

_FIELDNAMES = [
    "Clave de incidencia",
    "Resumen",
    "Categoría de estado",
    "Estado",
    "Prioridad",
    "Clave principal",
    "Campo personalizado (Fecha de inicio)",
    "Fecha de vencimiento",
]


def _csv_bytes(rows: list[dict]) -> bytes:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=_FIELDNAMES)
    writer.writeheader()
    for row in rows:
        full_row = {name: "" for name in _FIELDNAMES}
        full_row.update(row)
        writer.writerow(full_row)
    return buffer.getvalue().encode("utf-8")


def _sample_rows(*, grandchild_status_category: str = "Por hacer") -> list[dict]:
    return [
        {
            "Clave de incidencia": "BH-1",
            "Resumen": "Fase 1",
            "Categoría de estado": "Por hacer",
            "Estado": "Tareas por hacer",
            "Prioridad": "Medium",
            "Campo personalizado (Fecha de inicio)": "14/sep/26 12:00 AM",
            "Fecha de vencimiento": "18/sep/26 12:00 AM",
        },
        {
            "Clave de incidencia": "BH-2",
            "Resumen": "Tarea hija",
            "Categoría de estado": "Por hacer",
            "Estado": "Tareas por hacer",
            "Prioridad": "High",
            "Clave principal": "BH-1",
            "Campo personalizado (Fecha de inicio)": "14/sep/26 12:00 AM",
            "Fecha de vencimiento": "15/sep/26 12:00 AM",
        },
        {
            "Clave de incidencia": "BH-3",
            "Resumen": "Subtarea",
            "Categoría de estado": grandchild_status_category,
            "Estado": "Tareas por hacer",
            "Prioridad": "Low",
            "Clave principal": "BH-2",
            "Campo personalizado (Fecha de inicio)": "14/sep/26 12:00 AM",
            "Fecha de vencimiento": "14/sep/26 12:00 AM",
        },
    ]


def _sibling_phase_rows() -> list[dict]:
    """One root ("PH-1") with two leaf children whose CSV dates are in
    reverse-of-key order, to prove chaining follows dates, not key order."""
    return [
        {
            "Clave de incidencia": "PH-1",
            "Resumen": "Phase",
            "Categoría de estado": "Por hacer",
            "Estado": "Tareas por hacer",
            "Prioridad": "Medium",
        },
        {
            "Clave de incidencia": "PH-2",
            "Resumen": "Second by date",
            "Categoría de estado": "Por hacer",
            "Estado": "Tareas por hacer",
            "Prioridad": "Medium",
            "Clave principal": "PH-1",
            "Campo personalizado (Fecha de inicio)": "16/sep/26 12:00 AM",
            "Fecha de vencimiento": "17/sep/26 12:00 AM",
        },
        {
            "Clave de incidencia": "PH-3",
            "Resumen": "First by date",
            "Categoría de estado": "Por hacer",
            "Estado": "Tareas por hacer",
            "Prioridad": "Medium",
            "Clave principal": "PH-1",
            "Campo personalizado (Fecha de inicio)": "14/sep/26 12:00 AM",
            "Fecha de vencimiento": "15/sep/26 12:00 AM",
        },
    ]


async def _import_as_new_project(client: AsyncClient, admin_token: str, rows: list[dict]) -> dict:
    response = await client.post(
        "/api/v1/projects/import/jira-csv",
        data={"project_name": "Imported Project"},
        files={"file": ("jira.csv", _csv_bytes(rows), "text/csv")},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_first_import_creates_project_and_hierarchy(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]

    body = await _import_as_new_project(client, admin_token, _sample_rows())
    # 3 real rows + the synthetic project-summary root (ADR-036).
    assert body["created_count"] == 4
    assert body["updated_count"] == 0
    # BH-1 -> BH-2 -> BH-3 is a straight line of single-child parents (no
    # sibling group has more than one leaf), so no dependency is generated.
    assert body["dependency_count"] == 0
    project_id = body["project_id"]

    tasks_response = await client.get(
        f"/api/v1/projects/{project_id}/tasks?limit=100", headers=auth_header(admin_token)
    )
    tasks_by_key = {t["external_key"]: t for t in tasks_response.json()["items"]}
    assert set(tasks_by_key) == {"BH-1", "BH-2", "BH-3", PROJECT_ROOT_ISSUE_KEY}

    project_root = tasks_by_key[PROJECT_ROOT_ISSUE_KEY]
    root, child, grandchild = tasks_by_key["BH-1"], tasks_by_key["BH-2"], tasks_by_key["BH-3"]
    assert project_root["parent_task_id"] is None
    assert project_root["wbs_code"] == "0"
    assert project_root["name"] == "Imported Project"  # the form's project_name
    assert root["parent_task_id"] == project_root["id"]
    assert child["parent_task_id"] == root["id"]
    assert grandchild["parent_task_id"] == child["id"]
    assert root["wbs_code"] == "0.1"
    assert child["wbs_code"] == "0.1.1"
    assert grandchild["wbs_code"] == "0.1.1.1"
    assert child["priority"] == "high"
    assert grandchild["priority"] == "low"
    # No assignees are ever imported.
    assert root["assignees"] == []
    assert child["assignees"] == []


async def test_reimport_updates_in_place_without_duplicating(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]

    first = await _import_as_new_project(client, admin_token, _sample_rows())
    project_id = first["project_id"]

    reimport = await client.post(
        f"/api/v1/projects/{project_id}/tasks/import/jira-csv",
        files={"file": ("jira.csv", _csv_bytes(_sample_rows()), "text/csv")},
        headers=auth_header(admin_token),
    )
    assert reimport.status_code == 200, reimport.text
    body = reimport.json()
    assert body["created_count"] == 0
    assert body["updated_count"] == 4  # 3 real tasks + the project-summary root

    tasks_response = await client.get(
        f"/api/v1/projects/{project_id}/tasks?limit=100", headers=auth_header(admin_token)
    )
    assert tasks_response.json()["total"] == 4


async def test_reimport_with_changed_status_updates_only_that_task(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]

    first = await _import_as_new_project(client, admin_token, _sample_rows())
    project_id = first["project_id"]

    await client.post(
        f"/api/v1/projects/{project_id}/tasks/import/jira-csv",
        files={
            "file": (
                "jira.csv",
                _csv_bytes(_sample_rows(grandchild_status_category="Listo")),
                "text/csv",
            )
        },
        headers=auth_header(admin_token),
    )

    tasks_response = await client.get(
        f"/api/v1/projects/{project_id}/tasks?limit=100", headers=auth_header(admin_token)
    )
    tasks_by_key = {t["external_key"]: t for t in tasks_response.json()["items"]}
    # BH-3 is a true leaf — its own status drives its own percent directly.
    assert tasks_by_key["BH-3"]["status"] == "completed"
    assert tasks_by_key["BH-3"]["percent_complete"] == 100
    # BH-2/BH-1 have children, so their roll-up should reflect BH-3's new
    # progress rather than their own (unchanged) status.
    assert tasks_by_key["BH-2"]["percent_complete"] > 0
    assert tasks_by_key["BH-1"]["percent_complete"] > 0


async def test_dangling_parent_key_is_a_warning_not_a_failure(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]

    rows = [
        {
            "Clave de incidencia": "BH-9",
            "Resumen": "Orphaned task",
            "Categoría de estado": "Por hacer",
            "Estado": "Tareas por hacer",
            "Prioridad": "Medium",
            "Clave principal": "BH-999",
        }
    ]
    body = await _import_as_new_project(client, admin_token, rows)
    assert body["created_count"] == 2  # BH-9 + the project-summary root
    assert any("BH-999" in w for w in body["warnings"])


async def test_member_can_sync_existing_project_but_not_create_new_one(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    member = await invite_member(client, admin_token=admin_token)
    member_token = member["tokens"]["access_token"]

    first = await _import_as_new_project(client, admin_token, _sample_rows())
    project_id = first["project_id"]
    await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"user_id": member["user"]["id"]},
        headers=auth_header(admin_token),
    )

    forbidden = await client.post(
        "/api/v1/projects/import/jira-csv",
        data={"project_name": "Should be blocked"},
        files={"file": ("jira.csv", _csv_bytes(_sample_rows()), "text/csv")},
        headers=auth_header(member_token),
    )
    assert forbidden.status_code == 403

    allowed = await client.post(
        f"/api/v1/projects/{project_id}/tasks/import/jira-csv",
        files={"file": ("jira.csv", _csv_bytes(_sample_rows()), "text/csv")},
        headers=auth_header(member_token),
    )
    assert allowed.status_code == 200, allowed.text


async def test_sync_into_existing_project_names_root_after_the_project_not_a_form_field(
    client: AsyncClient,
):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]

    project_response = await client.post(
        "/api/v1/projects",
        json={"name": "Hand-Made Project Name"},
        headers=auth_header(admin_token),
    )
    assert project_response.status_code == 201, project_response.text
    project_id = project_response.json()["id"]

    # This endpoint (sync into an existing project) has no `project_name`
    # field at all — the synthetic root must take the project's own name.
    sync = await client.post(
        f"/api/v1/projects/{project_id}/tasks/import/jira-csv",
        files={"file": ("jira.csv", _csv_bytes(_sample_rows()), "text/csv")},
        headers=auth_header(admin_token),
    )
    assert sync.status_code == 200, sync.text

    tasks_response = await client.get(
        f"/api/v1/projects/{project_id}/tasks?limit=100", headers=auth_header(admin_token)
    )
    tasks_by_key = {t["external_key"]: t for t in tasks_response.json()["items"]}
    assert tasks_by_key[PROJECT_ROOT_ISSUE_KEY]["name"] == "Hand-Made Project Name"

    # Re-syncing must update that same row, never duplicate it.
    again = await client.post(
        f"/api/v1/projects/{project_id}/tasks/import/jira-csv",
        files={"file": ("jira.csv", _csv_bytes(_sample_rows()), "text/csv")},
        headers=auth_header(admin_token),
    )
    assert again.status_code == 200, again.text
    assert again.json()["created_count"] == 0
    assert again.json()["updated_count"] == 4

    tasks_response2 = await client.get(
        f"/api/v1/projects/{project_id}/tasks?limit=100", headers=auth_header(admin_token)
    )
    root_rows = [
        t for t in tasks_response2.json()["items"] if t["external_key"] == PROJECT_ROOT_ISSUE_KEY
    ]
    assert len(root_rows) == 1


async def test_project_root_cannot_be_deleted_directly(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]

    body = await _import_as_new_project(client, admin_token, _sample_rows())
    project_id = body["project_id"]

    tasks_response = await client.get(
        f"/api/v1/projects/{project_id}/tasks?limit=100", headers=auth_header(admin_token)
    )
    tasks_by_key = {t["external_key"]: t for t in tasks_response.json()["items"]}
    project_root_id = tasks_by_key[PROJECT_ROOT_ISSUE_KEY]["id"]

    response = await client.delete(
        f"/api/v1/tasks/{project_root_id}", headers=auth_header(admin_token)
    )
    assert response.status_code == 409, response.text

    # Untouched: still there, and none of its subtree was cascaded away.
    after = await client.get(
        f"/api/v1/projects/{project_id}/tasks?limit=100", headers=auth_header(admin_token)
    )
    assert after.json()["total"] == 4


async def test_oversized_file_is_rejected_before_writing_anything(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]

    huge_rows = [
        {
            "Clave de incidencia": f"BH-{i}",
            "Resumen": "x" * 10,
            "Categoría de estado": "Por hacer",
            "Estado": "Tareas por hacer",
            "Prioridad": "Medium",
        }
        for i in range(201)
    ]
    response = await client.post(
        "/api/v1/projects/import/jira-csv",
        data={"project_name": "Too Big"},
        files={"file": ("jira.csv", _csv_bytes(huge_rows), "text/csv")},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 422

    projects_response = await client.get("/api/v1/projects", headers=auth_header(admin_token))
    assert projects_response.json()["total"] == 0


async def test_import_creates_sequential_dependency_for_sibling_leaves(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]

    body = await _import_as_new_project(client, admin_token, _sibling_phase_rows())
    assert body["dependency_count"] == 1
    project_id = body["project_id"]

    gantt = await client.get(
        f"/api/v1/projects/{project_id}/gantt", headers=auth_header(admin_token)
    )
    tasks_by_key = {t["external_key"]: t for t in gantt.json()["tasks"]}
    dependencies = gantt.json()["dependencies"]
    assert len(dependencies) == 1
    dep = dependencies[0]
    # PH-3 starts on the 14th, PH-2 on the 16th — chained earliest-first
    # regardless of their Jira key order.
    assert dep["predecessor_id"] == tasks_by_key["PH-3"]["id"]
    assert dep["successor_id"] == tasks_by_key["PH-2"]["id"]
    assert dep["dependency_type"] == "FS"
    assert dep["lag_days"] == 0


async def test_reimport_unchanged_file_leaves_the_same_auto_dependency_row_in_place(
    client: AsyncClient,
):
    # Regression check (ADR-039): an unchanged resync used to delete every
    # auto-generated dependency and recreate it from scratch, including ones
    # whose (predecessor_id, successor_id) pair hadn't changed at all — a
    # delete-then-insert of the *same* pair in one flush risks tripping the
    # unique constraint on that pair depending on statement ordering. The
    # importer now leaves an unchanged edge alone instead of churning it.
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]

    first = await _import_as_new_project(client, admin_token, _sibling_phase_rows())
    project_id = first["project_id"]
    assert first["dependency_count"] == 1

    gantt = await client.get(
        f"/api/v1/projects/{project_id}/gantt", headers=auth_header(admin_token)
    )
    original_dependency_id = gantt.json()["dependencies"][0]["id"]

    reimport = await client.post(
        f"/api/v1/projects/{project_id}/tasks/import/jira-csv",
        files={"file": ("jira.csv", _csv_bytes(_sibling_phase_rows()), "text/csv")},
        headers=auth_header(admin_token),
    )
    assert reimport.status_code == 200, reimport.text
    assert reimport.json()["dependency_count"] == 1

    gantt2 = await client.get(
        f"/api/v1/projects/{project_id}/gantt", headers=auth_header(admin_token)
    )
    dependencies = gantt2.json()["dependencies"]
    assert len(dependencies) == 1
    assert dependencies[0]["id"] == original_dependency_id


async def test_reimport_recalculates_auto_dependencies_but_preserves_manual_ones(
    client: AsyncClient,
):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]

    first = await _import_as_new_project(client, admin_token, _sibling_phase_rows())
    project_id = first["project_id"]

    gantt = await client.get(
        f"/api/v1/projects/{project_id}/gantt", headers=auth_header(admin_token)
    )
    tasks_by_key = {t["external_key"]: t for t in gantt.json()["tasks"]}

    # A manual dependency between the phase and one of its own children is
    # semantically odd, but it's a real, independent pair (PH-1 -> PH-2) that
    # the importer's own chain (PH-3 -> PH-2) never touches — good enough to
    # prove "manual survives a resync" without colliding with the unique
    # constraint on the auto-generated pair.
    manual = await client.post(
        f"/api/v1/tasks/{tasks_by_key['PH-1']['id']}/dependencies",
        json={"successor_id": tasks_by_key["PH-2"]["id"], "dependency_type": "SS", "lag_days": 1},
        headers=auth_header(admin_token),
    )
    assert manual.status_code == 201, manual.text

    # Re-import with PH-2/PH-3's dates swapped: the auto-generated edge
    # should flip direction, while the manual edge must survive untouched.
    swapped_rows = _sibling_phase_rows()
    for row in swapped_rows:
        if row["Clave de incidencia"] == "PH-2":
            row["Campo personalizado (Fecha de inicio)"] = "14/sep/26 12:00 AM"
        elif row["Clave de incidencia"] == "PH-3":
            row["Campo personalizado (Fecha de inicio)"] = "16/sep/26 12:00 AM"

    reimport = await client.post(
        f"/api/v1/projects/{project_id}/tasks/import/jira-csv",
        files={"file": ("jira.csv", _csv_bytes(swapped_rows), "text/csv")},
        headers=auth_header(admin_token),
    )
    assert reimport.status_code == 200, reimport.text
    assert reimport.json()["dependency_count"] == 1

    gantt2 = await client.get(
        f"/api/v1/projects/{project_id}/gantt", headers=auth_header(admin_token)
    )
    dependencies = gantt2.json()["dependencies"]
    assert len(dependencies) == 2  # the flipped auto edge + the untouched manual one

    auto_edges = [d for d in dependencies if d["dependency_type"] == "FS" and d["lag_days"] == 0]
    assert len(auto_edges) == 1
    assert auto_edges[0]["predecessor_id"] == tasks_by_key["PH-2"]["id"]
    assert auto_edges[0]["successor_id"] == tasks_by_key["PH-3"]["id"]

    manual_edges = [d for d in dependencies if d["dependency_type"] == "SS"]
    assert len(manual_edges) == 1
    assert manual_edges[0]["predecessor_id"] == tasks_by_key["PH-1"]["id"]
    assert manual_edges[0]["successor_id"] == tasks_by_key["PH-2"]["id"]
    assert manual_edges[0]["lag_days"] == 1
