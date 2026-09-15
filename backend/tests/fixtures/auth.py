"""Shared test setup helpers: registering an org+admin and inviting members,
reused across integration test modules instead of repeating raw HTTP calls."""

import uuid

from httpx import AsyncClient


def unique_email(prefix: str = "user") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"


async def register_admin(
    client: AsyncClient, *, org_name: str = "Acme Corp", password: str = "supersecret1"
) -> dict:
    email = unique_email("admin")
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": org_name,
            "full_name": "Ada Admin",
            "email": email,
            "password": password,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    body["email"] = email
    body["password"] = password
    return body


async def invite_member(
    client: AsyncClient, *, admin_token: str, password: str = "membersecret1"
) -> dict:
    email = unique_email("member")
    response = await client.post(
        "/api/v1/users/invite",
        json={"email": email, "full_name": "Mia Member", "role": "member", "password": password},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 201, response.text
    user = response.json()

    login_response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    assert login_response.status_code == 200, login_response.text
    return {"user": user, "tokens": login_response.json(), "email": email, "password": password}


def auth_header(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}
