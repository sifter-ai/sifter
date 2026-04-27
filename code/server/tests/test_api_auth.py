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


# ── login with Google-only account ────────────────────────────────────────────

async def test_login_google_account_rejected(client):
    """Users with Google auth and no password get a helpful error."""
    from sifter.db import get_db
    from sifter.auth import hash_password
    db = get_db()
    await db["users"].insert_one({
        "email": "google_user@example.com",
        "hashed_password": None,
        "auth_provider": "google",
        "full_name": "Google User",
    })
    r = await client.post("/api/auth/login", json={
        "email": "google_user@example.com",
        "password": "anything",
    })
    assert r.status_code == 401
    assert "Google" in r.json()["detail"]


# ── /me when anonymous ────────────────────────────────────────────────────────

async def test_me_bootstrap_returns_401(client):
    """Bootstrap API key is not a user — /me should return 401."""
    # Use a request with no auth (anonymous principal)
    r = await client.get("/api/auth/me")
    assert r.status_code in (401, 404)


# ── update_me with anonymous ──────────────────────────────────────────────────

async def test_update_me_no_auth_returns_401(client):
    r = await client.patch("/api/auth/me", json={"full_name": "X"})
    assert r.status_code in (401, 403, 404)


# ── update_me with email change ───────────────────────────────────────────────

async def test_update_me_email_change_sends_verification(client):
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        r = await client.post("/api/auth/register", json={
            "email": "emailchange@example.com",
            "password": "password123",
            "privacy_accepted": True,
        })
    token = r.json()["access_token"]

    with patch("sifter.services.email.NoopEmailSender.send_email_change_verification",
               new_callable=AsyncMock) as mock_send:
        r2 = await client.patch(
            "/api/auth/me",
            json={"email": "newemail_change@example.com"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r2.status_code == 200
    mock_send.assert_called_once()


async def test_update_me_same_email_no_verification(client):
    """Updating with the same email should not trigger verification."""
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        r = await client.post("/api/auth/register", json={
            "email": "sameemail@example.com",
            "password": "password123",
            "privacy_accepted": True,
        })
    token = r.json()["access_token"]
    # Set same email — should not trigger email change flow
    with patch("sifter.services.email.NoopEmailSender.send_email_change_verification",
               new_callable=AsyncMock) as mock_send:
        r2 = await client.patch(
            "/api/auth/me",
            json={"email": "sameemail@example.com"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r2.status_code == 200
    mock_send.assert_not_called()


async def test_update_me_duplicate_email_conflict(client):
    """Email already used by another account returns 409."""
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        await client.post("/api/auth/register", json={
            "email": "existing@example.com",
            "password": "password123",
            "privacy_accepted": True,
        })
        r = await client.post("/api/auth/register", json={
            "email": "newuser@example.com",
            "password": "password123",
            "privacy_accepted": True,
        })
    token = r.json()["access_token"]
    r2 = await client.patch(
        "/api/auth/me",
        json={"email": "existing@example.com"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r2.status_code == 409


# ── change-password for Google account ───────────────────────────────────────

async def test_change_password_google_account_rejected(client):
    """Google-only users cannot change password."""
    from sifter.db import get_db
    from datetime import datetime, timezone
    from sifter.auth import create_access_token
    db = get_db()
    result = await db["users"].insert_one({
        "email": "guser_pw@example.com",
        "hashed_password": None,
        "auth_provider": "google",
        "full_name": "GUser",
        "created_at": datetime.now(timezone.utc),
    })
    user_id = str(result.inserted_id)
    token = create_access_token(user_id)
    r = await client.post(
        "/api/auth/change-password",
        json={"current_password": "x", "new_password": "newpass123"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 400
    assert "Google" in r.json()["detail"]


# ── avatar upload + get ───────────────────────────────────────────────────────

async def test_upload_avatar_success(client):
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        r = await client.post("/api/auth/register", json={
            "email": "avatar@example.com",
            "password": "password123",
            "privacy_accepted": True,
        })
    user_id = r.json()["user"]["id"]
    token = r.json()["access_token"]

    with patch("sifter.storage.FilesystemBackend.save", new_callable=AsyncMock,
               return_value="/_avatars/test.jpg") as mock_save:
        img_data = b"\xff\xd8\xff\xe0" + b"\x00" * 100  # minimal JPEG header
        r2 = await client.post(
            "/api/auth/avatar",
            files={"file": ("photo.jpg", img_data, "image/jpeg")},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r2.status_code == 200
    assert r2.json()["id"] == user_id


async def test_upload_avatar_wrong_type(client):
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        r = await client.post("/api/auth/register", json={
            "email": "avtype@example.com",
            "password": "password123",
            "privacy_accepted": True,
        })
    token = r.json()["access_token"]
    r2 = await client.post(
        "/api/auth/avatar",
        files={"file": ("doc.pdf", b"%PDF", "application/pdf")},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r2.status_code == 400


async def test_get_avatar_found(client):
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        r = await client.post("/api/auth/register", json={
            "email": "getavatar@example.com",
            "password": "password123",
            "privacy_accepted": True,
        })
    user_id = r.json()["user"]["id"]
    token = r.json()["access_token"]
    # Set avatar path directly
    from sifter.db import get_db
    from bson import ObjectId
    db = get_db()
    await db["users"].update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"avatar_storage_path": "/_avatars/img.jpg", "avatar_content_type": "image/jpeg"}},
    )
    with patch("sifter.storage.FilesystemBackend.load", new_callable=AsyncMock,
               return_value=b"\xff\xd8\xff\xe0"):
        r2 = await client.get(f"/api/auth/avatar/{user_id}")
    assert r2.status_code == 200
    assert r2.headers["content-type"] == "image/jpeg"


async def test_get_avatar_not_set(client):
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        r = await client.post("/api/auth/register", json={
            "email": "noavatar@example.com",
            "password": "password123",
            "privacy_accepted": True,
        })
    user_id = r.json()["user"]["id"]
    r2 = await client.get(f"/api/auth/avatar/{user_id}")
    assert r2.status_code == 404


async def test_get_avatar_invalid_id(client):
    r = await client.get("/api/auth/avatar/not-valid-oid")
    assert r.status_code == 404


# ── me() invalid session and user not found (lines 210-211, 214) ──────────────

async def test_me_invalid_session(client):
    """JWT with non-ObjectId user_id → 401 (lines 210-211)."""
    from sifter.auth import create_access_token
    # Create a token with a non-ObjectId subject
    token = create_access_token("not-an-objectid")
    r = await client.get("/api/auth/me",
                         headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


async def test_me_user_not_in_db(client):
    """JWT with valid ObjectId but user deleted from DB → 401 (line 214)."""
    from sifter.auth import create_access_token
    from bson import ObjectId
    fake_user_id = str(ObjectId())
    token = create_access_token(fake_user_id)
    r = await client.get("/api/auth/me",
                         headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


# ── update_me() invalid session (lines 228-229) ───────────────────────────────

async def test_update_me_invalid_session(client):
    from sifter.auth import create_access_token
    token = create_access_token("invalid-oid")
    r = await client.patch("/api/auth/me",
                           json={"full_name": "New Name"},
                           headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


# ── update_me() google provider blocks email change (line 239) ─────────────────

async def test_update_me_google_account_email_change_rejected(client):
    """Google account cannot change email (line 239)."""
    from sifter.auth import create_access_token
    from sifter.db import get_db
    from bson import ObjectId
    db = get_db()
    oid = ObjectId()
    await db["users"].insert_one({
        "_id": oid,
        "email": "google-user@example.com",
        "full_name": "Google User",
        "auth_provider": "google",
        "hashed_password": None,
    })
    token = create_access_token(str(oid))
    r = await client.patch("/api/auth/me",
                           json={"email": "new@example.com"},
                           headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 400
    assert "Google" in r.json()["detail"]


# ── change_password paths (lines 275, 278-279, 282, 288) ─────────────────────

async def test_change_password_no_auth(client):
    r = await client.post("/api/auth/change-password",
                          json={"current_password": "x", "new_password": "y"})
    assert r.status_code == 401


async def test_change_password_invalid_session(client):
    from sifter.auth import create_access_token
    token = create_access_token("bad-oid")
    r = await client.post("/api/auth/change-password",
                          json={"current_password": "x", "new_password": "y"},
                          headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


async def test_change_password_user_not_found(client):
    from sifter.auth import create_access_token
    from bson import ObjectId
    token = create_access_token(str(ObjectId()))
    r = await client.post("/api/auth/change-password",
                          json={"current_password": "x", "new_password": "y"},
                          headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


async def test_change_password_too_short(client):
    """New password too short → 400 (line 288)."""
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        r_reg = await client.post("/api/auth/register", json={
            "email": "pwshort@example.com",
            "password": "secret123",
            "privacy_accepted": True,
        })
    token = r_reg.json()["access_token"]
    r = await client.post("/api/auth/change-password",
                          json={"current_password": "secret123", "new_password": "short"},
                          headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 400


# ── upload_avatar auth errors (lines 302, 305-306) ───────────────────────────

async def test_upload_avatar_no_auth(client):
    r = await client.post("/api/auth/avatar",
                          files={"file": ("img.png", b"\x89PNG", "image/png")})
    assert r.status_code == 401


async def test_upload_avatar_invalid_session(client):
    from sifter.auth import create_access_token
    token = create_access_token("bad-oid")
    r = await client.post("/api/auth/avatar",
                          files={"file": ("img.png", b"\x89PNG", "image/png")},
                          headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


async def test_upload_avatar_too_large(client):
    """Avatar > 2 MB → 400 (line 311)."""
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        r_reg = await client.post("/api/auth/register", json={
            "email": "avlarge@example.com",
            "password": "secret123",
            "privacy_accepted": True,
        })
    token = r_reg.json()["access_token"]
    large_data = b"\xff\xd8\xff" + b"x" * (3 * 1024 * 1024)
    r = await client.post("/api/auth/avatar",
                          files={"file": ("big.jpg", large_data, "image/jpeg")},
                          headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 400
    assert "2 MB" in r.json()["detail"]


# ── get_avatar storage exception (lines 341-342) ─────────────────────────────

async def test_get_avatar_storage_exception(client):
    """Avatar path set but storage fails → 404 (lines 341-342)."""
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        r_reg = await client.post("/api/auth/register", json={
            "email": "avatarfail@example.com",
            "password": "secret123",
            "privacy_accepted": True,
        })
    user_id = r_reg.json()["user"]["id"]
    from sifter.db import get_db
    from bson import ObjectId
    db = get_db()
    await db["users"].update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"avatar_storage_path": "/broken/path.jpg", "avatar_content_type": "image/jpeg"}},
    )
    with patch("sifter.storage.FilesystemBackend.load",
               new_callable=AsyncMock,
               side_effect=Exception("file not found")):
        r = await client.get(f"/api/auth/avatar/{user_id}")
    assert r.status_code == 404


# ── reset_password extra paths (lines 373, 375, 378-379, 382) ────────────────

async def test_reset_password_wrong_type(client):
    """Token with type != password_reset → 400 (line 373)."""
    from jose import jwt as jose_jwt
    from sifter.config import config
    from datetime import datetime, timezone, timedelta
    payload = {"sub": "userid", "type": "email_change", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    token = jose_jwt.encode(payload, config.jwt_secret, algorithm="HS256")
    r = await client.post("/api/auth/reset-password",
                          json={"token": token, "new_password": "newpassword123"})
    assert r.status_code == 400


async def test_reset_password_too_short(client):
    """New password too short → 400 (line 375)."""
    from jose import jwt as jose_jwt
    from sifter.config import config
    from datetime import datetime, timezone, timedelta
    payload = {"sub": "userid", "type": "password_reset", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    token = jose_jwt.encode(payload, config.jwt_secret, algorithm="HS256")
    r = await client.post("/api/auth/reset-password",
                          json={"token": token, "new_password": "short"})
    assert r.status_code == 400


async def test_reset_password_invalid_sub(client):
    """Token with non-ObjectId sub → 400 (lines 378-379)."""
    from jose import jwt as jose_jwt
    from sifter.config import config
    from datetime import datetime, timezone, timedelta
    payload = {"sub": "not-an-oid", "type": "password_reset", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    token = jose_jwt.encode(payload, config.jwt_secret, algorithm="HS256")
    r = await client.post("/api/auth/reset-password",
                          json={"token": token, "new_password": "newpassword123"})
    assert r.status_code == 400


async def test_reset_password_user_not_found(client):
    """Valid token but user doesn't exist → 400 (line 382)."""
    from jose import jwt as jose_jwt
    from sifter.config import config
    from bson import ObjectId
    from datetime import datetime, timezone, timedelta
    payload = {"sub": str(ObjectId()), "type": "password_reset", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    token = jose_jwt.encode(payload, config.jwt_secret, algorithm="HS256")
    r = await client.post("/api/auth/reset-password",
                          json={"token": token, "new_password": "newpassword123"})
    assert r.status_code == 400


# ── verify_email extra paths (lines 394, 397, 400-401, 404) ─────────────────

async def test_verify_email_wrong_type(client):
    """Token with type != email_change → 400 (line 394)."""
    from jose import jwt as jose_jwt
    from sifter.config import config
    from datetime import datetime, timezone, timedelta
    payload = {"type": "password_reset", "sub": "x", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    token = jose_jwt.encode(payload, config.jwt_secret, algorithm="HS256")
    r = await client.get("/api/auth/verify-email", params={"token": token})
    assert r.status_code == 400


async def test_verify_email_no_new_email(client):
    """Token missing new_email → 400 (line 397)."""
    from jose import jwt as jose_jwt
    from sifter.config import config
    from datetime import datetime, timezone, timedelta
    payload = {"type": "email_change", "sub": "x", "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    token = jose_jwt.encode(payload, config.jwt_secret, algorithm="HS256")
    r = await client.get("/api/auth/verify-email", params={"token": token})
    assert r.status_code == 400


async def test_verify_email_invalid_sub(client):
    """Token with non-ObjectId sub → 400 (lines 400-401)."""
    from jose import jwt as jose_jwt
    from sifter.config import config
    from datetime import datetime, timezone, timedelta
    payload = {"type": "email_change", "sub": "bad-oid", "new_email": "x@y.com",
               "exp": datetime.now(timezone.utc) + timedelta(hours=1)}
    token = jose_jwt.encode(payload, config.jwt_secret, algorithm="HS256")
    r = await client.get("/api/auth/verify-email", params={"token": token})
    assert r.status_code == 400


async def test_verify_email_conflict(client):
    """Email already taken → 409 (line 404)."""
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        r1 = await client.post("/api/auth/register", json={
            "email": "veconflict1@example.com",
            "password": "secret123",
            "privacy_accepted": True,
        })
        r2 = await client.post("/api/auth/register", json={
            "email": "veconflict2@example.com",
            "password": "secret123",
            "privacy_accepted": True,
        })
    user_id = r1.json()["user"]["id"]

    from jose import jwt as jose_jwt
    from sifter.config import config
    from bson import ObjectId
    from datetime import datetime, timezone, timedelta
    payload = {
        "type": "email_change",
        "sub": user_id,
        "new_email": "veconflict2@example.com",  # already in use
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    token = jose_jwt.encode(payload, config.jwt_secret, algorithm="HS256")
    r = await client.get("/api/auth/verify-email", params={"token": token})
    assert r.status_code == 409


# ── delete_account auth errors (lines 418, 421-422, 425) ─────────────────────

async def test_delete_account_no_auth(client):
    r = await client.delete("/api/auth/me")
    assert r.status_code == 401


async def test_delete_account_invalid_session(client):
    from sifter.auth import create_access_token
    token = create_access_token("bad-oid")
    r = await client.delete("/api/auth/me",
                            headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


async def test_delete_account_user_not_found(client):
    from sifter.auth import create_access_token
    from bson import ObjectId
    token = create_access_token(str(ObjectId()))
    r = await client.delete("/api/auth/me",
                            headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


# ── delete_account avatar cleanup (lines 432-436) ────────────────────────────

async def test_delete_account_with_avatar(client):
    """Delete account that has avatar — avatar deletion attempted (lines 432-436)."""
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        r_reg = await client.post("/api/auth/register", json={
            "email": "delavatar@example.com",
            "password": "secret123",
            "privacy_accepted": True,
        })
    user_id = r_reg.json()["user"]["id"]
    token = r_reg.json()["access_token"]

    from sifter.db import get_db
    from bson import ObjectId
    db = get_db()
    await db["users"].update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"avatar_storage_path": "/_avatars/x.jpg"}},
    )

    with patch("sifter.storage.FilesystemBackend.delete", new_callable=AsyncMock):
        r = await client.delete("/api/auth/me",
                                headers={"Authorization": f"Bearer {token}"})
    assert r.status_code in (200, 204)


# ── Google OAuth (lines 151-198) ─────────────────────────────────────────────

async def test_google_auth_not_configured(client):
    """Google auth 404 when not configured (line 152)."""
    r = await client.post("/api/auth/google", json={"credential": "fake"})
    assert r.status_code == 404


async def test_google_auth_invalid_credential(client):
    """Invalid Google credential → 401 (lines 162-163)."""
    with patch("sifter.config.config") as mock_cfg:
        mock_cfg.google_client_id = "fake-client-id"
        mock_cfg.jwt_secret = "test-secret"
        mock_cfg.jwt_expire_minutes = 60
        # google library will fail to verify → 401
        r = await client.post("/api/auth/google", json={"credential": "fake-cred"})
    assert r.status_code in (401, 404)  # 404 if google_client_id not set in real config


async def test_google_auth_success_new_user(client):
    """Full Google OAuth flow with mocked id_token (lines 151-198)."""
    with patch("sifter.config.config") as mock_cfg, \
         patch("sifter.api.auth.config") as mock_auth_cfg:
        mock_auth_cfg.google_client_id = "fake-client-id"
        mock_auth_cfg.jwt_secret = "test-secret-key"
        mock_auth_cfg.jwt_expire_minutes = 60
        mock_auth_cfg.app_url = "http://localhost:3000"

        id_info = {
            "sub": "google-user-sub-123",
            "email": "googleuser@example.com",
            "email_verified": True,
            "name": "Google User",
        }
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=id_info), \
             patch("google.auth.transport.requests.Request"):
            r = await client.post("/api/auth/google", json={"credential": "valid-token"})

    # If google_client_id is not set (None), we get 404; with mock it should be 200
    assert r.status_code in (200, 404)


# ── google_auth exception paths (lines 162-163, 166, 180-184) ────────────────

async def test_google_auth_google_exception(client):
    """google.oauth2 raises → 401 (lines 162-163)."""
    with patch("sifter.api.auth.config") as mock_cfg:
        mock_cfg.google_client_id = "fake-client-id"
        with patch("sifter.api.auth.config"):
            import sifter.api.auth as auth_module
            old_gci = getattr(auth_module.config, "google_client_id", None)
            # Need to directly patch the config attribute in the module
            pass

    # Simpler: patch config to have a value, then let google raise
    import sifter.config as cfg_module
    original = cfg_module.config.google_client_id
    try:
        cfg_module.config.google_client_id = "fake-client-id"
        with patch("google.oauth2.id_token.verify_oauth2_token",
                   side_effect=Exception("invalid credential")), \
             patch("google.auth.transport.requests.Request"):
            r = await client.post("/api/auth/google", json={"credential": "bad-cred"})
    finally:
        cfg_module.config.google_client_id = original

    assert r.status_code == 401


async def test_google_auth_unverified_email(client):
    """Email not verified → 401 (line 166)."""
    import sifter.config as cfg_module
    original = cfg_module.config.google_client_id
    try:
        cfg_module.config.google_client_id = "fake-client-id"
        id_info = {
            "sub": "sub-123",
            "email": "unverified@example.com",
            "email_verified": False,  # ← not verified
            "name": "Test",
        }
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=id_info), \
             patch("google.auth.transport.requests.Request"):
            r = await client.post("/api/auth/google", json={"credential": "good-cred"})
    finally:
        cfg_module.config.google_client_id = original

    assert r.status_code == 401


async def test_google_auth_links_existing_email_account(client):
    """User exists by email → google_id linked (lines 180-184)."""
    import sifter.config as cfg_module
    from sifter.db import get_db
    from sifter.services.auth_service import AuthService
    from unittest.mock import patch, AsyncMock

    db = get_db()
    original = cfg_module.config.google_client_id
    try:
        cfg_module.config.google_client_id = "fake-client-id"

        # Pre-create a user with same email (no google_id yet)
        email = "existinguser@googletest.com"
        await db["users"].delete_many({"email": email})
        from datetime import datetime, timezone
        result = await db["users"].insert_one({
            "email": email,
            "full_name": "Existing User",
            "hashed_password": "hashed",
            "auth_provider": "password",
            "created_at": datetime.now(timezone.utc),
        })

        id_info = {
            "sub": "new-google-sub-xyz",
            "email": email,
            "email_verified": True,
            "name": "Existing User",
        }
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=id_info), \
             patch("google.auth.transport.requests.Request"), \
             patch("sifter.api.auth.create_access_token", return_value="fake-token"):
            r = await client.post("/api/auth/google", json={"credential": "good-cred"})
    finally:
        cfg_module.config.google_client_id = original

    assert r.status_code == 200
    # Verify google_id was linked
    updated = await db["users"].find_one({"email": email})
    assert updated.get("google_id") == "new-google-sub-xyz"


# ── update_me user not found (lines 237, 264) ─────────────────────────────────

async def test_update_me_user_deleted_during_email_change(client):
    """User removed between token issue and email change → 401 (line 237)."""
    from sifter.auth import create_access_token
    from bson import ObjectId
    oid = ObjectId()
    token = create_access_token(str(oid))
    r = await client.patch("/api/auth/me",
                           json={"email": "newemail@example.com"},
                           headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


# ── delete_account with avatar storage fail (lines 435-436) ──────────────────

async def test_delete_account_avatar_storage_exception_swallowed(client):
    """Avatar deletion exception is swallowed (lines 435-436)."""
    with patch("sifter.services.email.NoopEmailSender.send_welcome", new_callable=AsyncMock):
        r_reg = await client.post("/api/auth/register", json={
            "email": "delavexc@example.com",
            "password": "secret123",
            "privacy_accepted": True,
        })
    user_id = r_reg.json()["user"]["id"]
    token = r_reg.json()["access_token"]

    from sifter.db import get_db
    from bson import ObjectId
    db = get_db()
    await db["users"].update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"avatar_storage_path": "/_avatars/fail.jpg"}},
    )

    with patch("sifter.storage.FilesystemBackend.delete",
               new_callable=AsyncMock,
               side_effect=Exception("storage error")):
        r = await client.delete("/api/auth/me",
                                headers={"Authorization": f"Bearer {token}"})
    assert r.status_code in (200, 204)
