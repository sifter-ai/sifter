"""
Integration tests for /api/auth — register, login, /me, profile updates.
Uses real MongoDB (sifter_test) with mocked rate limiter.
"""
import os
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, patch

os.environ["SIFTER_MONGODB_DATABASE"] = "sifter_test"
os.environ.setdefault("SIFTER_DEFAULT_API_KEY", "test-key")

pytestmark = pytest.mark.asyncio(loop_scope="session")

from sifter.server import app
from sifter.auth import Principal, get_current_principal


@pytest_asyncio.fixture(scope="session")
async def client():
    # Remove any auth override — auth tests need real JWT validation
    app.dependency_overrides.pop(get_current_principal, None)
    # Disable rate limiting so register/login tests don't hit 429
    from sifter.limiter import limiter
    limiter.enabled = False
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    limiter.enabled = True
    # Restore mock principal for other test modules
    async def _mock_principal() -> Principal:
        return Principal(key_id="bootstrap")
    app.dependency_overrides[get_current_principal] = _mock_principal


@pytest_asyncio.fixture(autouse=True, loop_scope="session")
async def clean_users(client):
    from sifter.db import get_db
    db = get_db()
    await db["users"].delete_many({})
    yield


# ── register ──────────────────────────────────────────────────────────────────

async def test_register_success(client):
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        r = await client.post("/api/auth/register", json={
            "email": "alice@example.com",
            "password": "secret123",
            "full_name": "Alice",
            "privacy_accepted": True,
        })
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["user"]["email"] == "alice@example.com"


async def test_register_requires_privacy(client):
    r = await client.post("/api/auth/register", json={
        "email": "bob@example.com",
        "password": "pass",
        "privacy_accepted": False,
    })
    assert r.status_code == 400
    assert "Privacy" in r.json()["detail"]


async def test_register_duplicate_email(client):
    payload = {"email": "dup@example.com", "password": "x", "privacy_accepted": True}
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        await client.post("/api/auth/register", json=payload)
        r2 = await client.post("/api/auth/register", json=payload)
    assert r2.status_code == 400
    assert "already" in r2.json()["detail"]


# ── login ─────────────────────────────────────────────────────────────────────

async def test_login_success(client):
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        await client.post("/api/auth/register", json={
            "email": "login@example.com",
            "password": "mypass",
            "privacy_accepted": True,
        })
    r = await client.post("/api/auth/login", json={
        "email": "login@example.com",
        "password": "mypass",
    })
    assert r.status_code == 200
    assert "access_token" in r.json()


async def test_login_wrong_password(client):
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        await client.post("/api/auth/register", json={
            "email": "wrongpass@example.com",
            "password": "correct",
            "privacy_accepted": True,
        })
    r = await client.post("/api/auth/login", json={
        "email": "wrongpass@example.com",
        "password": "wrong",
    })
    assert r.status_code == 401


async def test_login_unknown_email(client):
    r = await client.post("/api/auth/login", json={
        "email": "nobody@example.com",
        "password": "pass",
    })
    assert r.status_code == 401


# ── /me ───────────────────────────────────────────────────────────────────────

async def _register_and_token(client, email="me@example.com", password="pass"):
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        r = await client.post("/api/auth/register", json={
            "email": email,
            "password": password,
            "privacy_accepted": True,
        })
    return r.json()["access_token"]


async def test_me_returns_user(client):
    token = await _register_and_token(client)
    r = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "me@example.com"


async def test_me_unauthenticated(client):
    r = await client.get("/api/auth/me")
    # anonymous principal → 401 or 404 depending on config
    assert r.status_code in (401, 404)


# ── update profile ────────────────────────────────────────────────────────────

async def test_update_profile_full_name(client):
    token = await _register_and_token(client, "profile@example.com")
    r = await client.patch(
        "/api/auth/me",
        json={"full_name": "Updated Name"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert r.json()["full_name"] == "Updated Name"


# ── change password ───────────────────────────────────────────────────────────

async def test_change_password_success(client):
    with patch("sifter.services.email.NoopEmailSender.send_password_changed", new_callable=AsyncMock):
        token = await _register_and_token(client, "changepw@example.com", "oldpass")
        r = await client.post(
            "/api/auth/change-password",
            json={"current_password": "oldpass", "new_password": "newpass123"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == 200


async def test_change_password_wrong_current(client):
    token = await _register_and_token(client, "changepw2@example.com", "realpass")
    r = await client.post(
        "/api/auth/change-password",
        json={"current_password": "wrongpass", "new_password": "new"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 400


# ── forgot / reset password ───────────────────────────────────────────────────

async def test_forgot_password_sends_email(client):
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        await client.post("/api/auth/register", json={
            "email": "forgot@example.com",
            "password": "mypass",
            "privacy_accepted": True,
        })
    with patch("sifter.services.email.NoopEmailSender.send_password_reset", new_callable=AsyncMock) as mock_send:
        r = await client.post("/api/auth/forgot-password", json={"email": "forgot@example.com"})
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    mock_send.assert_called_once()


async def test_forgot_password_unknown_email_returns_ok(client):
    r = await client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert r.status_code == 200
    assert r.json() == {"ok": True}


async def test_reset_password_invalid_token(client):
    r = await client.post("/api/auth/reset-password", json={
        "token": "not-a-valid-token",
        "new_password": "newpassword123",
    })
    assert r.status_code == 400


async def test_reset_password_success(client):
    from sifter.auth import create_access_token
    from datetime import datetime, timezone, timedelta
    import jose.jwt as jose_jwt

    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        r = await client.post("/api/auth/register", json={
            "email": "resetpw@example.com",
            "password": "oldpassword",
            "privacy_accepted": True,
        })
    user_id = r.json()["user"]["id"]

    from sifter.config import config as sifter_config
    payload = {
        "sub": user_id,
        "type": "password_reset",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
    }
    token = jose_jwt.encode(payload, sifter_config.jwt_secret, algorithm="HS256")

    r2 = await client.post("/api/auth/reset-password", json={
        "token": token,
        "new_password": "newpassword123",
    })
    assert r2.status_code == 200
    assert r2.json() == {"ok": True}

    # Verify can now login with new password
    r3 = await client.post("/api/auth/login", json={
        "email": "resetpw@example.com",
        "password": "newpassword123",
    })
    assert r3.status_code == 200


# ── verify email ──────────────────────────────────────────────────────────────

async def test_verify_email_invalid_token(client):
    r = await client.get("/api/auth/verify-email", params={"token": "invalid"})
    assert r.status_code == 400


async def test_verify_email_success(client):
    from datetime import datetime, timezone, timedelta
    import jose.jwt as jose_jwt

    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        r = await client.post("/api/auth/register", json={
            "email": "verifyemail@example.com",
            "password": "password123",
            "privacy_accepted": True,
        })
    user_id = r.json()["user"]["id"]

    from sifter.config import config as sifter_config
    payload = {
        "sub": user_id,
        "type": "email_change",
        "new_email": "newemail@example.com",
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
    }
    token = jose_jwt.encode(payload, sifter_config.jwt_secret, algorithm="HS256")

    r2 = await client.get("/api/auth/verify-email", params={"token": token})
    assert r2.status_code == 200
    assert r2.json() == {"ok": True}


# ── delete account ────────────────────────────────────────────────────────────

async def test_delete_account(client):
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        r = await client.post("/api/auth/register", json={
            "email": "todelete@example.com",
            "password": "password123",
            "privacy_accepted": True,
        })
    token = r.json()["access_token"]

    with patch("sifter.services.email.NoopEmailSender.send_account_deleted", new_callable=AsyncMock):
        r2 = await client.delete(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r2.status_code == 204

    # Verify account is gone — login should fail
    r3 = await client.post("/api/auth/login", json={
        "email": "todelete@example.com",
        "password": "password123",
    })
    assert r3.status_code == 401
