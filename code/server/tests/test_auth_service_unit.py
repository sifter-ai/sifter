"""
Unit tests for auth_service — pure helpers and AuthService with mocked MongoDB.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId

from sifter.services.auth_service import AuthService, _slugify, _generate_api_key


# ── _slugify ──────────────────────────────────────────────────────────────────

def test_slugify_from_email():
    assert _slugify("alice@example.com") == "alice"

def test_slugify_name_with_spaces():
    assert _slugify("John Doe") == "john-doe"

def test_slugify_special_chars():
    assert _slugify("test+user@example.com") == "test-user"

def test_slugify_empty_local_part():
    assert _slugify("@example.com") == "org"

def test_slugify_numeric():
    assert _slugify("user123@example.com") == "user123"


# ── _generate_api_key ─────────────────────────────────────────────────────────

def test_generate_api_key_format():
    plaintext, key_hash, key_prefix = _generate_api_key()
    assert plaintext.startswith("sk-")
    assert len(key_prefix) == 12
    assert len(key_hash) == 64

def test_generate_api_key_unique():
    k1, _, _ = _generate_api_key()
    k2, _, _ = _generate_api_key()
    assert k1 != k2

def test_generate_api_key_hash_matches():
    import hashlib
    plaintext, key_hash, _ = _generate_api_key()
    random_part = plaintext[3:]
    assert hashlib.sha256(random_part.encode()).hexdigest() == key_hash


# ── AuthService.register ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_success(mock_motor_db):
    user_id = ObjectId()
    org_id = ObjectId()

    mock_motor_db["users"].find_one = AsyncMock(return_value=None)
    mock_motor_db["users"].insert_one = AsyncMock(return_value=MagicMock(inserted_id=user_id))
    mock_motor_db["organizations"].find_one = AsyncMock(return_value=None)
    mock_motor_db["organizations"].insert_one = AsyncMock(return_value=MagicMock(inserted_id=org_id))
    mock_motor_db["organization_members"].insert_one = AsyncMock(return_value=MagicMock())

    with patch("sifter.services.auth_service.create_access_token", return_value="jwt-token"):
        svc = AuthService(mock_motor_db)
        user, org, token = await svc.register("alice@example.com", "password123", "Alice")

    assert user.email == "alice@example.com"
    assert org.slug == "alice"
    assert token == "jwt-token"
    mock_motor_db["users"].insert_one.assert_called_once()
    mock_motor_db["organizations"].insert_one.assert_called_once()
    mock_motor_db["organization_members"].insert_one.assert_called_once()


@pytest.mark.asyncio
async def test_register_duplicate_email(mock_motor_db):
    mock_motor_db["users"].find_one = AsyncMock(return_value={"email": "alice@example.com"})

    svc = AuthService(mock_motor_db)
    with pytest.raises(ValueError, match="already registered"):
        await svc.register("alice@example.com", "password", "Alice")


@pytest.mark.asyncio
async def test_register_slug_collision(mock_motor_db):
    """If slug already exists, increments counter until unique."""
    user_id = ObjectId()
    org_id = ObjectId()

    mock_motor_db["users"].find_one = AsyncMock(return_value=None)
    mock_motor_db["users"].insert_one = AsyncMock(return_value=MagicMock(inserted_id=user_id))
    # First slug check returns existing, second returns None (unique)
    mock_motor_db["organizations"].find_one = AsyncMock(
        side_effect=[{"slug": "alice"}, None]
    )
    mock_motor_db["organizations"].insert_one = AsyncMock(return_value=MagicMock(inserted_id=org_id))
    mock_motor_db["organization_members"].insert_one = AsyncMock(return_value=MagicMock())

    with patch("sifter.services.auth_service.create_access_token", return_value="jwt"):
        svc = AuthService(mock_motor_db)
        _, org, _ = await svc.register("alice@example.com", "pass", "Alice")

    assert org.slug == "alice-1"


# ── AuthService.login ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_success(mock_motor_db):
    from sifter.auth import hash_password
    user_id = ObjectId()
    org_id = str(ObjectId())

    user_doc = {
        "_id": user_id,
        "email": "alice@example.com",
        "password_hash": hash_password("secret"),
        "full_name": "Alice",
    }
    member_doc = {"user_id": str(user_id), "org_id": org_id, "role": "owner"}

    mock_motor_db["users"].find_one = AsyncMock(return_value=user_doc)
    mock_motor_db["organization_members"].find_one = AsyncMock(return_value=member_doc)
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[member_doc])
    mock_motor_db["organization_members"].find = MagicMock(return_value=cursor)

    with patch("sifter.services.auth_service.create_access_token", return_value="jwt"):
        svc = AuthService(mock_motor_db)
        user, token = await svc.login("alice@example.com", "secret")

    assert user.email == "alice@example.com"
    assert token == "jwt"


@pytest.mark.asyncio
async def test_login_wrong_password(mock_motor_db):
    from sifter.auth import hash_password
    user_doc = {
        "_id": ObjectId(),
        "email": "alice@example.com",
        "password_hash": hash_password("correct"),
        "full_name": "Alice",
    }
    mock_motor_db["users"].find_one = AsyncMock(return_value=user_doc)

    svc = AuthService(mock_motor_db)
    with pytest.raises(ValueError, match="Invalid"):
        await svc.login("alice@example.com", "wrong")


@pytest.mark.asyncio
async def test_login_user_not_found(mock_motor_db):
    mock_motor_db["users"].find_one = AsyncMock(return_value=None)

    svc = AuthService(mock_motor_db)
    with pytest.raises(ValueError, match="Invalid"):
        await svc.login("nobody@example.com", "pass")


@pytest.mark.asyncio
async def test_login_no_org(mock_motor_db):
    from sifter.auth import hash_password
    user_doc = {
        "_id": ObjectId(),
        "email": "alice@example.com",
        "password_hash": hash_password("secret"),
        "full_name": "Alice",
    }
    mock_motor_db["users"].find_one = AsyncMock(return_value=user_doc)
    mock_motor_db["organization_members"].find_one = AsyncMock(return_value=None)

    svc = AuthService(mock_motor_db)
    with pytest.raises(ValueError, match="no organization"):
        await svc.login("alice@example.com", "secret")


# ── AuthService.create_api_key ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_api_key(mock_motor_db):
    inserted_id = ObjectId()
    mock_motor_db["api_keys"].insert_one = AsyncMock(return_value=MagicMock(inserted_id=inserted_id))

    svc = AuthService(mock_motor_db)
    api_key, plaintext = await svc.create_api_key("My Key", "org1", "user1")

    assert plaintext.startswith("sk-")
    assert api_key.id == str(inserted_id)
    mock_motor_db["api_keys"].insert_one.assert_called_once()


# ── AuthService.revoke_api_key ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_revoke_api_key_success(mock_motor_db):
    mock_motor_db["api_keys"].update_one = AsyncMock(
        return_value=MagicMock(modified_count=1)
    )
    svc = AuthService(mock_motor_db)
    result = await svc.revoke_api_key(str(ObjectId()), "org1")
    assert result is True


@pytest.mark.asyncio
async def test_revoke_api_key_not_found(mock_motor_db):
    mock_motor_db["api_keys"].update_one = AsyncMock(
        return_value=MagicMock(modified_count=0)
    )
    svc = AuthService(mock_motor_db)
    result = await svc.revoke_api_key(str(ObjectId()), "org1")
    assert result is False


# ── AuthService.list_api_keys ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_api_keys(mock_motor_db):
    from sifter.models.user import APIKey
    key = APIKey(name="Test Key", key_hash="abc", key_prefix="sk-test12", org_id="org1")
    key_doc = key.to_mongo()
    key_doc["_id"] = ObjectId()

    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[key_doc])
    mock_motor_db["api_keys"].find = MagicMock(return_value=cursor)

    svc = AuthService(mock_motor_db)
    keys = await svc.list_api_keys("org1")
    assert len(keys) == 1
    assert keys[0].name == "Test Key"


# ── AuthService.switch_org ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_switch_org_success(mock_motor_db):
    org_id = str(ObjectId())
    user_id = str(ObjectId())
    mock_motor_db["organization_members"].find_one = AsyncMock(
        return_value={"user_id": user_id, "org_id": org_id}
    )

    with patch("sifter.services.auth_service.create_access_token", return_value="new-jwt"):
        svc = AuthService(mock_motor_db)
        token = await svc.switch_org(user_id, org_id)

    assert token == "new-jwt"


@pytest.mark.asyncio
async def test_switch_org_not_member(mock_motor_db):
    mock_motor_db["organization_members"].find_one = AsyncMock(return_value=None)

    svc = AuthService(mock_motor_db)
    with pytest.raises(ValueError, match="Not a member"):
        await svc.switch_org("user1", "org1")


# ── AuthService.get_user ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_user_found(mock_motor_db):
    user_id = ObjectId()
    mock_motor_db["users"].find_one = AsyncMock(return_value={
        "_id": user_id,
        "email": "alice@example.com",
        "password_hash": "hash",
        "full_name": "Alice",
    })
    svc = AuthService(mock_motor_db)
    user = await svc.get_user(str(user_id))
    assert user.email == "alice@example.com"


@pytest.mark.asyncio
async def test_get_user_not_found(mock_motor_db):
    mock_motor_db["users"].find_one = AsyncMock(return_value=None)
    svc = AuthService(mock_motor_db)
    result = await svc.get_user(str(ObjectId()))
    assert result is None


# ── AuthService.add_member ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_add_member_success(mock_motor_db):
    from sifter.models.user import OrgRole
    user_id = ObjectId()
    mock_motor_db["users"].find_one = AsyncMock(return_value={"_id": user_id, "email": "bob@x.com"})
    mock_motor_db["organization_members"].find_one = AsyncMock(return_value=None)
    mock_motor_db["organization_members"].insert_one = AsyncMock(return_value=MagicMock())

    svc = AuthService(mock_motor_db)
    member = await svc.add_member("org1", "bob@x.com", OrgRole.MEMBER)
    assert member.org_id == "org1"


@pytest.mark.asyncio
async def test_add_member_user_not_found(mock_motor_db):
    from sifter.models.user import OrgRole
    mock_motor_db["users"].find_one = AsyncMock(return_value=None)

    svc = AuthService(mock_motor_db)
    with pytest.raises(ValueError, match="User not found"):
        await svc.add_member("org1", "nobody@x.com", OrgRole.MEMBER)


@pytest.mark.asyncio
async def test_add_member_already_member(mock_motor_db):
    from sifter.models.user import OrgRole
    user_id = ObjectId()
    mock_motor_db["users"].find_one = AsyncMock(return_value={"_id": user_id})
    mock_motor_db["organization_members"].find_one = AsyncMock(
        return_value={"org_id": "org1", "user_id": str(user_id)}
    )

    svc = AuthService(mock_motor_db)
    with pytest.raises(ValueError, match="already a member"):
        await svc.add_member("org1", "alice@x.com", OrgRole.MEMBER)


# ── AuthService.create_org ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_org_success(mock_motor_db):
    org_id = ObjectId()
    mock_motor_db["organizations"].find_one = AsyncMock(return_value=None)
    mock_motor_db["organizations"].insert_one = AsyncMock(return_value=MagicMock(inserted_id=org_id))
    mock_motor_db["organization_members"].insert_one = AsyncMock(return_value=MagicMock())

    with patch("sifter.services.auth_service.create_access_token", return_value="jwt"):
        svc = AuthService(mock_motor_db)
        org, token = await svc.create_org("My Company", "user1")

    assert org.name == "My Company"
    assert token == "jwt"
