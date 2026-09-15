import uuid

import pytest

from app.core.enums import UserRole
from app.core.exceptions import UnauthorizedError
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)


def test_hash_password_is_not_plaintext_and_verifies():
    hashed = hash_password("correct horse battery staple")
    assert hashed != "correct horse battery staple"
    assert verify_password("correct horse battery staple", hashed)
    assert not verify_password("wrong password", hashed)


def test_access_token_roundtrip():
    user_id = uuid.uuid4()
    org_id = uuid.uuid4()
    token = create_access_token(user_id=user_id, organization_id=org_id, role=UserRole.ADMIN)
    payload = decode_access_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["org_id"] == str(org_id)
    assert payload["role"] == "admin"


def test_decode_invalid_token_raises_unauthorized():
    with pytest.raises(UnauthorizedError):
        decode_access_token("not-a-real-token")


def test_hash_refresh_token_is_deterministic_and_one_way():
    raw = "some-refresh-token-value"
    h1 = hash_refresh_token(raw)
    h2 = hash_refresh_token(raw)
    assert h1 == h2
    assert h1 != raw
