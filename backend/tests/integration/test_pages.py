import pytest
from httpx import AsyncClient

from tests.fixtures.auth import auth_header, invite_member, register_admin

pytestmark = pytest.mark.asyncio


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


async def test_create_page_defaults_to_empty_doc(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    space = await _create_space(client, admin_token)

    page = await _create_page(client, admin_token, space["id"], title="Getting Started")
    assert page["title"] == "Getting Started"
    assert page["content"] == {"type": "doc", "content": []}
    assert page["parent_page_id"] is None
    assert page["sort_order"] == 0


async def test_page_content_round_trips_through_jsonb(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    space = await _create_space(client, admin_token)
    rich_content = {
        "type": "doc",
        "content": [
            {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Hi"}]},
            {
                "type": "table",
                "content": [{"type": "tableRow", "content": [{"type": "tableCell"}]}],
            },
        ],
    }
    page = await _create_page(client, admin_token, space["id"], content=rich_content)

    fetched = await client.get(f"/api/v1/pages/{page['id']}", headers=auth_header(admin_token))
    assert fetched.status_code == 200
    assert fetched.json()["content"] == rich_content


async def test_create_subpage_and_fetch_flat_tree(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    space = await _create_space(client, admin_token)

    parent = await _create_page(client, admin_token, space["id"], title="Parent")
    child = await _create_page(
        client, admin_token, space["id"], title="Child", parent_page_id=parent["id"]
    )
    assert child["parent_page_id"] == parent["id"]
    assert child["sort_order"] == 0

    tree = await client.get(f"/api/v1/spaces/{space['id']}/pages", headers=auth_header(admin_token))
    assert tree.status_code == 200
    titles = {p["title"] for p in tree.json()}
    assert titles == {"Parent", "Child"}


async def test_create_page_with_parent_from_another_space_is_rejected(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    space_a = await _create_space(client, admin_token, name="Space A")
    space_b = await _create_space(client, admin_token, name="Space B")
    page_in_a = await _create_page(client, admin_token, space_a["id"])

    response = await client.post(
        f"/api/v1/spaces/{space_b['id']}/pages",
        json={"title": "Orphan", "parent_page_id": page_in_a["id"]},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_parent"


async def test_update_page_title_and_content(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    space = await _create_space(client, admin_token)
    page = await _create_page(client, admin_token, space["id"], title="Draft")

    response = await client.patch(
        f"/api/v1/pages/{page['id']}",
        json={"title": "Published", "content": {"type": "doc", "content": [{"type": "paragraph"}]}},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Published"
    assert body["content"] == {"type": "doc", "content": [{"type": "paragraph"}]}


async def test_delete_page_cascades_to_subpages(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    space = await _create_space(client, admin_token)
    parent = await _create_page(client, admin_token, space["id"], title="Parent")
    child = await _create_page(
        client, admin_token, space["id"], title="Child", parent_page_id=parent["id"]
    )

    deleted = await client.delete(f"/api/v1/pages/{parent['id']}", headers=auth_header(admin_token))
    assert deleted.status_code == 204

    gone = await client.get(f"/api/v1/pages/{child['id']}", headers=auth_header(admin_token))
    assert gone.status_code == 404


async def test_move_page_reorders_siblings_and_reparents(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    space = await _create_space(client, admin_token)
    old_parent = await _create_page(client, admin_token, space["id"], title="Old Parent")
    new_parent = await _create_page(client, admin_token, space["id"], title="New Parent")
    sibling = await _create_page(
        client, admin_token, space["id"], title="Sibling", parent_page_id=old_parent["id"]
    )
    moving = await _create_page(
        client, admin_token, space["id"], title="Moving", parent_page_id=old_parent["id"]
    )
    assert moving["sort_order"] == 1

    response = await client.post(
        f"/api/v1/pages/{moving['id']}/move",
        json={"parent_page_id": new_parent["id"], "position": 0},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 200
    assert response.json()["parent_page_id"] == new_parent["id"]
    assert response.json()["sort_order"] == 0

    # The old sibling group is renumbered after losing a member.
    tree = await client.get(f"/api/v1/spaces/{space['id']}/pages", headers=auth_header(admin_token))
    by_id = {p["id"]: p for p in tree.json()}
    assert by_id[sibling["id"]]["sort_order"] == 0


async def test_move_page_rejects_cycle(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    space = await _create_space(client, admin_token)
    parent = await _create_page(client, admin_token, space["id"], title="Parent")
    child = await _create_page(
        client, admin_token, space["id"], title="Child", parent_page_id=parent["id"]
    )

    response = await client.post(
        f"/api/v1/pages/{parent['id']}/move",
        json={"parent_page_id": child["id"], "position": 0},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 422
    assert response.json()["code"] == "page_move_cycle"


async def test_move_page_position_is_clamped(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    space = await _create_space(client, admin_token)
    a = await _create_page(client, admin_token, space["id"], title="A")
    await _create_page(client, admin_token, space["id"], title="B")

    response = await client.post(
        f"/api/v1/pages/{a['id']}/move",
        json={"parent_page_id": None, "position": 999},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 200
    assert response.json()["sort_order"] == 1


async def test_page_visibility_mirrors_its_space(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    member = await invite_member(client, admin_token=admin_token)
    member_token = member["tokens"]["access_token"]

    project = await client.post(
        "/api/v1/projects", json={"name": "Private Project"}, headers=auth_header(admin_token)
    )
    space = await _create_space(
        client, admin_token, project_id=project.json()["id"], name="Private Space"
    )
    page = await _create_page(client, admin_token, space["id"], title="Secret")

    response = await client.get(f"/api/v1/pages/{page['id']}", headers=auth_header(member_token))
    assert response.status_code == 404
