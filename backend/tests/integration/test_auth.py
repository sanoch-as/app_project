import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def _register(client: AsyncClient, email: str, password: str = "supersecret1") -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Acme Corp",
            "full_name": "Ada Lovelace",
            "email": email,
            "password": password,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_register_creates_org_and_admin_user(client: AsyncClient, unique_email: str):
    body = await _register(client, unique_email)
    assert body["organization"]["name"] == "Acme Corp"
    assert body["user"]["email"] == unique_email
    assert body["user"]["role"] == "admin"
    assert body["tokens"]["access_token"]
    assert body["tokens"]["refresh_token"]


async def test_register_duplicate_email_conflicts(client: AsyncClient, unique_email: str):
    await _register(client, unique_email)
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Other Org",
            "full_name": "Someone Else",
            "email": unique_email,
            "password": "anotherpassword1",
        },
    )
    assert response.status_code == 409
    assert response.json()["code"] == "email_taken"


async def test_login_success_returns_tokens(client: AsyncClient, unique_email: str):
    await _register(client, unique_email, password="mypassword123")
    response = await client.post(
        "/api/v1/auth/login", json={"email": unique_email, "password": "mypassword123"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["access_token"]


async def test_login_wrong_password_rejected(client: AsyncClient, unique_email: str):
    await _register(client, unique_email, password="mypassword123")
    response = await client.post(
        "/api/v1/auth/login", json={"email": unique_email, "password": "wrongpassword"}
    )
    assert response.status_code == 401


async def test_login_locks_account_after_max_failed_attempts(
    client: AsyncClient, unique_email: str
):
    await _register(client, unique_email, password="mypassword123")
    for _ in range(5):
        response = await client.post(
            "/api/v1/auth/login", json={"email": unique_email, "password": "wrongpassword"}
        )
        assert response.status_code == 401

    response = await client.post(
        "/api/v1/auth/login", json={"email": unique_email, "password": "mypassword123"}
    )
    assert response.status_code == 423
    assert response.json()["code"] == "account_locked"


async def test_refresh_rotates_token_and_old_one_is_invalid(client: AsyncClient, unique_email: str):
    body = await _register(client, unique_email)
    old_refresh = body["tokens"]["refresh_token"]

    response = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert response.status_code == 200
    new_tokens = response.json()
    assert new_tokens["refresh_token"] != old_refresh

    reuse_response = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert reuse_response.status_code == 401


async def test_logout_revokes_refresh_token(client: AsyncClient, unique_email: str):
    body = await _register(client, unique_email)
    refresh_token = body["tokens"]["refresh_token"]

    logout_response = await client.post(
        "/api/v1/auth/logout", json={"refresh_token": refresh_token}
    )
    assert logout_response.status_code == 204

    refresh_response = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": refresh_token}
    )
    assert refresh_response.status_code == 401


async def test_protected_route_requires_bearer_token(client: AsyncClient):
    response = await client.get("/api/v1/users")
    assert response.status_code in (401, 403)


async def test_protected_route_with_valid_token_succeeds(client: AsyncClient, unique_email: str):
    body = await _register(client, unique_email)
    access_token = body["tokens"]["access_token"]
    response = await client.get(
        "/api/v1/users", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert response.status_code == 200
    assert response.json()["total"] == 1
