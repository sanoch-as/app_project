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


async def test_search_finds_matching_project_by_partial_name(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    await client.post(
        "/api/v1/projects", json={"name": "Migración a la Nube"}, headers=auth_header(admin_token)
    )

    response = await client.get(
        "/api/v1/mentions/search",
        params={"q": "nube", "types": "project"},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["type"] == "project"
    assert results[0]["label"] == "Migración a la Nube"


async def test_search_finds_matching_task_with_wbs_sublabel(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    project = (
        await client.post(
            "/api/v1/projects",
            json={"name": "Task Search Project"},
            headers=auth_header(admin_token),
        )
    ).json()
    await client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={"name": "Diseñar arquitectura", "start_date": "2026-09-14", "duration_days": 1},
        headers=auth_header(admin_token),
    )

    response = await client.get(
        "/api/v1/mentions/search",
        params={"q": "arquitectura", "types": "task"},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["type"] == "task"
    assert results[0]["sublabel"] == "1"


async def test_search_finds_pages_and_excludes_current_page(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    space = await _create_space(client, admin_token)
    match = await _create_page(client, admin_token, space["id"], title="Guía de Onboarding")
    other_match = await _create_page(
        client, admin_token, space["id"], title="Onboarding para managers"
    )

    response = await client.get(
        "/api/v1/mentions/search",
        params={"q": "onboarding", "types": "page", "exclude_page_id": match["id"]},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 200
    results = response.json()
    assert [r["id"] for r in results] == [other_match["id"]]


async def test_search_respects_multiple_types_at_once(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    await client.post(
        "/api/v1/projects", json={"name": "Alpha Rollout"}, headers=auth_header(admin_token)
    )
    space = await _create_space(client, admin_token)
    await _create_page(client, admin_token, space["id"], title="Alpha Rollout Notes")

    response = await client.get(
        "/api/v1/mentions/search",
        params={"q": "alpha", "types": "project,page"},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 200
    types = {r["type"] for r in response.json()}
    assert types == {"project", "page"}


async def test_search_respects_project_visibility_for_members(client: AsyncClient):
    admin = await register_admin(client)
    admin_token = admin["tokens"]["access_token"]
    member = await invite_member(client, admin_token=admin_token)
    member_token = member["tokens"]["access_token"]
    await client.post(
        "/api/v1/projects", json={"name": "Confidential Launch"}, headers=auth_header(admin_token)
    )

    admin_results = await client.get(
        "/api/v1/mentions/search",
        params={"q": "confidential", "types": "project"},
        headers=auth_header(admin_token),
    )
    assert len(admin_results.json()) == 1

    member_results = await client.get(
        "/api/v1/mentions/search",
        params={"q": "confidential", "types": "project"},
        headers=auth_header(member_token),
    )
    assert member_results.json() == []
