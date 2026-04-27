"""
Unit tests for api_key_service — create, list, revoke, ensure_indexes.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock
from bson import ObjectId

from sifter.services.api_key_service import ApiKeyService, _generate_api_key


# ── _generate_api_key ─────────────────────────────────────────────────────────

def test_generate_key_starts_with_sk():
    plaintext, _, _ = _generate_api_key()
    assert plaintext.startswith("sk-")

def test_generate_key_prefix_length():
    _, _, prefix = _generate_api_key()
    assert len(prefix) == 12

def test_generate_key_unique():
    k1, _, _ = _generate_api_key()
    k2, _, _ = _generate_api_key()
    assert k1 != k2


# ── ensure_indexes ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ensure_indexes_happy_path(mock_motor_db):
    mock_motor_db["api_keys"].create_index = AsyncMock()
    svc = ApiKeyService(mock_motor_db)
    await svc.ensure_indexes()
    assert mock_motor_db["api_keys"].create_index.call_count == 2


@pytest.mark.asyncio
async def test_ensure_indexes_drops_and_recreates_on_error(mock_motor_db):
    """When create_index fails (e.g. index option conflict), drops and recreates."""
    call_count = {"n": 0}

    async def create_index_side_effect(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise Exception("index option conflict")

    mock_motor_db["api_keys"].create_index = AsyncMock(side_effect=create_index_side_effect)
    mock_motor_db["api_keys"].drop_index = AsyncMock()

    svc = ApiKeyService(mock_motor_db)
    await svc.ensure_indexes()

    mock_motor_db["api_keys"].drop_index.assert_called_once_with("key_hash_1")
    assert mock_motor_db["api_keys"].create_index.call_count == 3  # fail + retry + is_active


# ── create_api_key ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_api_key_format(mock_motor_db):
    inserted_id = ObjectId()
    mock_motor_db["api_keys"].insert_one = AsyncMock(return_value=MagicMock(inserted_id=inserted_id))

    svc = ApiKeyService(mock_motor_db)
    api_key, plaintext = await svc.create_api_key("CI key")

    assert plaintext.startswith("sk-")
    assert api_key.id == str(inserted_id)
    mock_motor_db["api_keys"].insert_one.assert_called_once()


@pytest.mark.asyncio
async def test_create_api_key_custom_org(mock_motor_db):
    mock_motor_db["api_keys"].insert_one = AsyncMock(return_value=MagicMock(inserted_id=ObjectId()))

    svc = ApiKeyService(mock_motor_db)
    api_key, _ = await svc.create_api_key("Key", org_id="myorg")
    assert api_key.org_id == "myorg"


# ── list_api_keys ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_api_keys_returns_active(mock_motor_db):
    from sifter.models.user import APIKey
    key = APIKey(name="K", key_hash="h", key_prefix="sk-prefix1", org_id="default")
    doc = key.to_mongo()
    doc["_id"] = ObjectId()

    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[doc])
    mock_motor_db["api_keys"].find = MagicMock(return_value=cursor)

    svc = ApiKeyService(mock_motor_db)
    keys = await svc.list_api_keys()
    assert len(keys) == 1
    assert keys[0].name == "K"


@pytest.mark.asyncio
async def test_list_api_keys_empty(mock_motor_db):
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[])
    mock_motor_db["api_keys"].find = MagicMock(return_value=cursor)

    svc = ApiKeyService(mock_motor_db)
    keys = await svc.list_api_keys()
    assert keys == []


# ── revoke_api_key ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_revoke_api_key_success(mock_motor_db):
    mock_motor_db["api_keys"].update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    svc = ApiKeyService(mock_motor_db)
    assert await svc.revoke_api_key(str(ObjectId())) is True


@pytest.mark.asyncio
async def test_revoke_api_key_not_found(mock_motor_db):
    mock_motor_db["api_keys"].update_one = AsyncMock(return_value=MagicMock(modified_count=0))
    svc = ApiKeyService(mock_motor_db)
    assert await svc.revoke_api_key(str(ObjectId())) is False
