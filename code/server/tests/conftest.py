"""
Shared test configuration.
All async tests use a single session-scoped event loop to avoid
motor event loop conflicts.

The environment pinning below keeps the suite on a local throwaway database.
`import litellm` runs load_dotenv() at import time, so a .env sitting next to the
server that holds a remote MongoDB URI would otherwise point the whole test
process at it, and these tests write and delete freely. python-dotenv does not
override variables that are already set, so pinning here wins. pytest_configure
re-checks afterwards and aborts rather than touching a remote database.
"""

import asyncio
import json
import os
from unittest.mock import AsyncMock, MagicMock

import pytest

# Must happen at import time, before any test module pulls in litellm.
os.environ["SIFTER_MONGODB_URI"] = os.environ.get(
    "SIFTER_TEST_MONGODB_URI", "mongodb://localhost:27017"
)
os.environ["SIFTER_MONGODB_DATABASE"] = os.environ.get(
    "SIFTER_TEST_MONGODB_DATABASE", "sifter_test"
)

_LOCAL_HOSTS = ("localhost", "127.0.0.1", "0.0.0.0", "::1", "mongo", "mongodb")


def _is_local(uri: str) -> bool:
    host = uri.split("://", 1)[-1].split("/")[0].split("@")[-1]
    return any(host.startswith(h) for h in _LOCAL_HOSTS)


def pytest_configure(config):
    """Abort the run if anything repointed the suite at a remote database."""
    import litellm  # noqa: F401 — its import-time load_dotenv is the known offender
    from sifter.config import config as sifter_config

    uri = sifter_config.mongodb_uri
    if not _is_local(uri):
        pytest.exit(
            "Refusing to run: the suite resolved a non-local MongoDB "
            f"({uri.split('@')[-1][:60]}). These tests write and delete data. "
            "Point SIFTER_MONGODB_URI at a local MongoDB, or unset it.",
            returncode=3,
        )


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
