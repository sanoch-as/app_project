import pytest
from httpx import AsyncClient

from tests.fixtures.auth import auth_header, invite_member, register_admin

pytestmark = pytest.mark.asyncio


def _mention_doc(entity_type: str, entity_id: str, label: str) -> dict:
    return {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "mention",
                        "attrs": {"id": entity_id, "entityType": entity_type, "label": label},
                    }
                ],
            }
        ],
    }


async def _create_space(client: AsyncClient, admin_token: str, **overrides) -> dict:
    payload = {"name": "Test Space"}
    payload.update(overrides)
    response = await client.post("/api/v1/spaces", json=payload, headers=auth_header(admin_token))
    assert response.status_code == 201, response.text
    return response.json()


async def _create_page(client: AsyncClient, admin_token: str, space_id: str, **overrides) -> dict:
    payload = {"title": "Untitled"}
    payload.update(overrides)
    response = await client.post(
        f"/api/v1/spaces/{space_id}/pages", json=payload, headers=auth_header(admin_token)
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_creating_page_with_mention_creates_page_reference(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = (
        await client.post(
            "/api/v1/projects",
            json={"name": "Referenced Project"},
            headers=auth_header(admin_token),
        )
    ).json()
    space = await _create_space(client, admin_token)
    page = await _create_page(
        client,
        admin_token,
        space["id"],
        title="Mentions a project",
        content=_mention_doc("project", project["id"], project["name"]),
    )

    response = await client.get(
        "/api/v1/pages/references",
        params={"referenced_type": "project", "referenced_id": project["id"]},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["page_id"] == page["id"]


async def test_editing_content_to_remove_mention_removes_the_reference(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = (
        await client.post(
            "/api/v1/projects", json={"name": "Ref Target"}, headers=auth_header(admin_token)
        )
    ).json()
    space = await _create_space(client, admin_token)
    page = await _create_page(
        client,
        admin_token,
        space["id"],
        content=_mention_doc("project", project["id"], project["name"]),
    )

    await client.patch(
        f"/api/v1/pages/{page['id']}",
        json={"content": {"type": "doc", "content": []}},
        headers=auth_header(admin_token),
    )

    response = await client.get(
        "/api/v1/pages/references",
        params={"referenced_type": "project", "referenced_id": project["id"]},
        headers=auth_header(admin_token),
    )
    assert response.json()["total"] == 0


async def test_references_are_filtered_by_visibility(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    member = await invite_member(client, admin_token=admin_token)
    member_token = member["tokens"]["access_token"]

    task_project = (
        await client.post(
            "/api/v1/projects",
            json={"name": "Task Owner Project"},
            headers=auth_header(admin_token),
        )
    ).json()
    task = (
        await client.post(
            f"/api/v1/projects/{task_project['id']}/tasks",
            json={"name": "Referenced Task", "start_date": "2026-09-14", "duration_days": 1},
            headers=auth_header(admin_token),
        )
    ).json()

    # A page in a space tied to a DIFFERENT project the member has no access to.
    private_project = (
        await client.post(
            "/api/v1/projects",
            json={"name": "Private Wiki Project"},
            headers=auth_header(admin_token),
        )
    ).json()
    private_space = await _create_space(
        client, admin_token, project_id=private_project["id"], name="Private Space"
    )
    await _create_page(
        client,
        admin_token,
        private_space["id"],
        content=_mention_doc("task", task["id"], task["name"]),
    )

    admin_view = await client.get(
        "/api/v1/pages/references",
        params={"referenced_type": "task", "referenced_id": task["id"]},
        headers=auth_header(admin_token),
    )
    assert admin_view.json()["total"] == 1

    member_view = await client.get(
        "/api/v1/pages/references",
        params={"referenced_type": "task", "referenced_id": task["id"]},
        headers=auth_header(member_token),
    )
    assert member_view.json()["total"] == 0


async def test_cross_org_references_are_never_visible(client: AsyncClient):
    admin_a = await register_admin(client)
    admin_a_token = admin_a["tokens"]["access_token"]
    admin_b = await register_admin(client)
    admin_b_token = admin_b["tokens"]["access_token"]

    project = (
        await client.post(
            "/api/v1/projects", json={"name": "Org A Project"}, headers=auth_header(admin_a_token)
        )
    ).json()
    space = await _create_space(client, admin_a_token)
    await _create_page(
        client,
        admin_a_token,
        space["id"],
        content=_mention_doc("project", project["id"], project["name"]),
    )

    response = await client.get(
        "/api/v1/pages/references",
        params={"referenced_type": "project", "referenced_id": project["id"]},
        headers=auth_header(admin_b_token),
    )
    assert response.json()["total"] == 0
