"""
Integration tests for auth, API key management, and principal resolution.
Tests run against a real MongoDB test database (sifter_test).
Requires MongoDB running at localhost:27017.

NOTE: This module does NOT override get_current_principal — it tests
the real auth flow (JWT, API key, anonymous).
"""

import os
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

os.environ["SIFTER_MONGODB_DATABASE"] = "sifter_test"
os.environ.setdefault("SIFTER_LLM_API_KEY", "test-key")

pytestmark = pytest.mark.asyncio(loop_scope="session")

# Import app after env vars are set
from sifter.server import app
from sifter.config import config


@pytest_asyncio.fixture(scope="session", autouse=True)
async def disable_rate_limits():
    """Disable slowapi rate limiting for the test session (all requests share 127.0.0.1)."""
    from sifter.limiter import limiter
    original = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = original


@pytest_asyncio.fixture(scope="session")
async def client():
    """Client with real auth — no dependency_overrides for get_current_principal."""
    from sifter.auth import get_current_principal
    # Remove any override installed by other test modules (test_api.py, etc.)
    app.dependency_overrides.pop(get_current_principal, None)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    # Restore the bootstrap override so other modules continue to work if
    # pytest runs this module before them (order isn't guaranteed).
    from sifter.auth import Principal
    async def _mock_principal() -> Principal:
        return Principal(key_id="bootstrap")
    app.dependency_overrides[get_current_principal] = _mock_principal


@pytest_asyncio.fixture(autouse=True, loop_scope="session")
async def clean_db(client):
    """Wipe auth-related collections before each test."""
    from sifter.db import get_db
    db = get_db()
    for col in ("users", "api_keys", "sifts", "folders"):
        await db[col].delete_many({})
    yield


# ─────────────────────────────────────────────────────────────
# Register
# ─────────────────────────────────────────────────────────────

async def test_register_success(client):
    r = await client.post("/api/auth/register", json={
        "email": "alice@example.com",
        "password": "s3cret!",
        "full_name": "Alice",
    })
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "alice@example.com"
    assert data["user"]["full_name"] == "Alice"
    assert "id" in data["user"]


async def test_register_duplicate_email(client):
    payload = {"email": "bob@example.com", "password": "pass123"}
    await client.post("/api/auth/register", json=payload)
    r = await client.post("/api/auth/register", json=payload)
    assert r.status_code == 400
    assert "already registered" in r.json()["detail"].lower()


async def test_register_missing_password(client):
    r = await client.post("/api/auth/register", json={"email": "x@x.com"})
    assert r.status_code == 422


# ─────────────────────────────────────────────────────────────
# Login
# ─────────────────────────────────────────────────────────────

async def test_login_success(client):
    await client.post("/api/auth/register", json={
        "email": "carol@example.com",
        "password": "mypassword",
    })
    r = await client.post("/api/auth/login", json={
        "email": "carol@example.com",
        "password": "mypassword",
    })
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["user"]["email"] == "carol@example.com"


async def test_login_wrong_password(client):
    await client.post("/api/auth/register", json={
        "email": "dave@example.com",
        "password": "correctpass",
    })
    r = await client.post("/api/auth/login", json={
        "email": "dave@example.com",
        "password": "wrongpass",
    })
    assert r.status_code == 401


async def test_login_unknown_email(client):
    r = await client.post("/api/auth/login", json={
        "email": "nobody@example.com",
        "password": "whatever",
    })
    assert r.status_code == 401


# ─────────────────────────────────────────────────────────────
# Me
# ─────────────────────────────────────────────────────────────

async def test_me_with_valid_jwt(client):
    r = await client.post("/api/auth/register", json={
        "email": "eve@example.com",
        "password": "evepass",
        "full_name": "Eve",
    })
    token = r.json()["access_token"]

    r2 = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert r2.json()["email"] == "eve@example.com"
    assert r2.json()["full_name"] == "Eve"


async def test_me_without_token(client):
    r = await client.get("/api/auth/me")
    # Anonymous principal → 401 from the me endpoint
    assert r.status_code == 401


async def test_me_with_invalid_token(client):
    r = await client.get("/api/auth/me", headers={"Authorization": "Bearer notavalidtoken"})
    assert r.status_code == 401


# ─────────────────────────────────────────────────────────────
# Principal resolution
# ─────────────────────────────────────────────────────────────

async def test_bootstrap_api_key(client):
    """Config bootstrap key grants access."""
    r = await client.get("/api/sifts", headers={"X-API-Key": config.api_key})
    assert r.status_code == 200


async def test_invalid_api_key_rejected(client):
    """An unknown API key always returns 401."""
    r = await client.get("/api/sifts", headers={"X-API-Key": "sk-thisisnotathing"})
    assert r.status_code == 401


async def test_anonymous_allowed_by_default(client):
    """Without require_api_key, unauthenticated requests are allowed."""
    original = config.require_api_key
    try:
        config.require_api_key = False
        r = await client.get("/api/sifts")
        assert r.status_code == 200
    finally:
        config.require_api_key = original


async def test_require_api_key_blocks_anonymous(client):
    """With require_api_key=True, unauthenticated requests get 401."""
    original = config.require_api_key
    try:
        config.require_api_key = True
        r = await client.get("/api/sifts")
        assert r.status_code == 401
    finally:
        config.require_api_key = original


async def test_db_api_key_grants_access(client):
    """A key created via /api/keys can authenticate requests."""
    # Create a key using the bootstrap token
    r = await client.post(
        "/api/keys",
        json={"name": "test-key"},
        headers={"X-API-Key": config.api_key},
    )
    assert r.status_code == 201
    plaintext = r.json()["plaintext"]

    # Use the new key to access a protected endpoint
    r2 = await client.get("/api/sifts", headers={"X-API-Key": plaintext})
    assert r2.status_code == 200


async def test_jwt_grants_access(client):
    """A JWT from login/register authenticates requests."""
    r = await client.post("/api/auth/register", json={
        "email": "frank@example.com",
        "password": "frankpass",
    })
    token = r.json()["access_token"]

    r2 = await client.get("/api/sifts", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200


# ─────────────────────────────────────────────────────────────
# API Keys CRUD
# ─────────────────────────────────────────────────────────────

async def test_create_api_key(client):
    r = await client.post(
        "/api/keys",
        json={"name": "My CI Key"},
        headers={"X-API-Key": config.api_key},
    )
    assert r.status_code == 201
    data = r.json()
    assert "plaintext" in data
    assert data["plaintext"].startswith("sk-")
    assert data["key"]["name"] == "My CI Key"
    assert "key_prefix" in data["key"]
    assert data["key"]["is_active"] is True


async def test_list_api_keys(client):
    # Start clean
    from sifter.db import get_db
    db = get_db()
    await db["api_keys"].delete_many({})

    headers = {"X-API-Key": config.api_key}
    await client.post("/api/keys", json={"name": "Key A"}, headers=headers)
    await client.post("/api/keys", json={"name": "Key B"}, headers=headers)

    r = await client.get("/api/keys", headers=headers)
    assert r.status_code == 200
    names = {k["name"] for k in r.json()}
    assert "Key A" in names
    assert "Key B" in names


async def test_revoke_api_key(client):
    headers = {"X-API-Key": config.api_key}
    r = await client.post("/api/keys", json={"name": "Revoke Me"}, headers=headers)
    key_id = r.json()["key"]["id"]
    plaintext = r.json()["plaintext"]

    # Key works before revocation
    r2 = await client.get("/api/sifts", headers={"X-API-Key": plaintext})
    assert r2.status_code == 200

    # Revoke it
    r3 = await client.delete(f"/api/keys/{key_id}", headers=headers)
    assert r3.status_code == 204

    # Key no longer works
    r4 = await client.get("/api/sifts", headers={"X-API-Key": plaintext})
    assert r4.status_code == 401


async def test_revoke_nonexistent_key(client):
    headers = {"X-API-Key": config.api_key}
    r = await client.delete("/api/keys/000000000000000000000000", headers=headers)
    assert r.status_code == 404


async def test_revoked_key_not_in_list(client):
    from sifter.db import get_db
    db = get_db()
    await db["api_keys"].delete_many({})

    headers = {"X-API-Key": config.api_key}
    r = await client.post("/api/keys", json={"name": "Will Be Revoked"}, headers=headers)
    key_id = r.json()["key"]["id"]

    await client.delete(f"/api/keys/{key_id}", headers=headers)

    r2 = await client.get("/api/keys", headers=headers)
    assert r2.status_code == 200
    assert all(k["id"] != key_id for k in r2.json())


# ─────────────────────────────────────────────────────────────
# Pagination
# ─────────────────────────────────────────────────────────────

async def test_sifts_pagination(client):
    headers = {"X-API-Key": config.api_key}
    for i in range(5):
        await client.post("/api/sifts", json={
            "name": f"Sift {i}",
            "instructions": "Extract: x",
        }, headers=headers)

    r = await client.get("/api/sifts?limit=2&offset=0", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["limit"] == 2
    assert data["offset"] == 0
    assert len(data["items"]) == 2
    assert data["total"] >= 5

    r2 = await client.get("/api/sifts?limit=2&offset=2", headers=headers)
    assert r2.status_code == 200
    page2 = r2.json()
    assert len(page2["items"]) == 2
    # Pages must not overlap
    ids_page1 = {s["id"] for s in data["items"]}
    ids_page2 = {s["id"] for s in page2["items"]}
    assert ids_page1.isdisjoint(ids_page2)


async def test_folders_pagination(client):
    headers = {"X-API-Key": config.api_key}
    for i in range(4):
        await client.post("/api/folders", json={"name": f"Folder {i}"}, headers=headers)

    r = await client.get("/api/folders?limit=2&offset=0", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["limit"] == 2
    assert len(data["items"]) == 2

    r2 = await client.get("/api/folders?limit=2&offset=2", headers=headers)
    ids1 = {f["id"] for f in data["items"]}
    ids2 = {f["id"] for f in r2.json()["items"]}
    assert ids1.isdisjoint(ids2)


async def test_aggregations_pagination(client):
    headers = {"X-API-Key": config.api_key}

    # Create a sift to link aggregations to
    r = await client.post("/api/sifts", json={
        "name": "Pag Test Sift",
        "instructions": "Extract: x",
    }, headers=headers)
    sift_id = r.json()["id"]

    from unittest.mock import AsyncMock, MagicMock, patch
    pipeline_json = '[{"$count": "total"}]'
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = pipeline_json

    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        for i in range(3):
            await client.post("/api/aggregations", json={
                "name": f"Agg {i}",
                "sift_id": sift_id,
                "aggregation_query": "count",
            }, headers=headers)

    r2 = await client.get(
        f"/api/aggregations?sift_id={sift_id}&limit=2&offset=0",
        headers=headers,
    )
    assert r2.status_code == 200
    data = r2.json()
    assert data["limit"] == 2
    assert len(data["items"]) == 2
    assert data["total"] == 3
