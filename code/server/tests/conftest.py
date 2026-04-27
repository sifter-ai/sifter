"""
Shared test configuration.
All async tests use a single session-scoped event loop to avoid
motor event loop conflicts.
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock

import pytest


# Force all tests in this session to use the same event loop
@pytest.fixture(scope="session")
def event_loop():
    policy = asyncio.get_event_loop_policy()
    loop = policy.new_event_loop()
    yield loop
    loop.close()


def _make_collection():
    col = MagicMock()
    col.insert_one = AsyncMock(return_value=MagicMock(inserted_id="507f1f77bcf86cd799439011"))
    col.find_one = AsyncMock(return_value=None)
    col.find_one_and_update = AsyncMock(return_value=None)
    col.update_one = AsyncMock()
    col.update_many = AsyncMock(return_value=MagicMock(modified_count=0))
    col.replace_one = AsyncMock(return_value=MagicMock(upserted_id=None, modified_count=0))
    col.delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))
    col.delete_many = AsyncMock(return_value=MagicMock(deleted_count=0))
    col.aggregate = MagicMock(return_value=MagicMock(to_list=AsyncMock(return_value=[])))
    col.count_documents = AsyncMock(return_value=0)
    col.create_index = AsyncMock()
    cursor = MagicMock()
    cursor.sort = MagicMock(return_value=cursor)
    cursor.skip = MagicMock(return_value=cursor)
    cursor.limit = MagicMock(return_value=cursor)
    cursor.to_list = AsyncMock(return_value=[])
    col.find = MagicMock(return_value=cursor)
    return col


@pytest.fixture
def mock_motor_db():
    """AsyncMock simulating AsyncIOMotorDatabase. Each collection is independent."""
    db = MagicMock()
    _collections: dict = {}

    def _get_col(name):
        if name not in _collections:
            _collections[name] = _make_collection()
        return _collections[name]

    db.__getitem__ = MagicMock(side_effect=_get_col)
    db._collections = _collections
    return db


@pytest.fixture
def mock_storage(tmp_path):
    """Real FilesystemBackend on a temporary directory."""
    from sifter.storage import FilesystemBackend
    return FilesystemBackend(base_path=str(tmp_path))


@pytest.fixture
def mock_llm_response():
    """Factory that builds a MagicMock matching litellm response shape."""
    def _make(content: str):
        resp = MagicMock()
        resp.choices = [MagicMock()]
        resp.choices[0].message.content = content
        resp.choices[0].message.tool_calls = None
        return resp
    return _make
