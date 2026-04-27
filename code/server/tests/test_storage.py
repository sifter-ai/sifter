"""
Unit tests for storage backends.
FilesystemBackend uses a real tmp directory.
S3/GCS backends are tested with mocks.
"""
import os
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from sifter.storage import (
    FilesystemBackend,
    GCSBackend,
    S3Backend,
    get_storage_backend,
    local_path,
    reset_storage_backend,
)


# ── FilesystemBackend ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_filesystem_save_and_load(tmp_path):
    backend = FilesystemBackend(base_path=str(tmp_path))
    path = await backend.save("folder1", "test.pdf", b"hello bytes")
    assert os.path.exists(path)
    data = await backend.load(path)
    assert data == b"hello bytes"


@pytest.mark.asyncio
async def test_filesystem_save_creates_subdirs(tmp_path):
    backend = FilesystemBackend(base_path=str(tmp_path))
    path = await backend.save("nested/folder", "file.txt", b"data")
    assert os.path.exists(path)


@pytest.mark.asyncio
async def test_filesystem_delete(tmp_path):
    backend = FilesystemBackend(base_path=str(tmp_path))
    path = await backend.save("f", "doc.pdf", b"content")
    await backend.delete(path)
    assert not os.path.exists(path)


@pytest.mark.asyncio
async def test_filesystem_delete_missing_is_silent(tmp_path):
    backend = FilesystemBackend(base_path=str(tmp_path))
    await backend.delete(str(tmp_path / "nonexistent.pdf"))  # must not raise


@pytest.mark.asyncio
async def test_filesystem_overwrite(tmp_path):
    backend = FilesystemBackend(base_path=str(tmp_path))
    path = await backend.save("f", "doc.pdf", b"v1")
    await backend.save("f", "doc.pdf", b"v2")
    data = await backend.load(path)
    assert data == b"v2"


# ── local_path helper ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_local_path_filesystem_yields_directly(tmp_path, monkeypatch):
    """For FilesystemBackend, local_path should yield the path as-is without I/O."""
    backend = FilesystemBackend(base_path=str(tmp_path))
    path = await backend.save("f", "doc.pdf", b"content")

    monkeypatch.setattr("sifter.storage._backend", backend)
    async with local_path(path) as p:
        assert p == path
        assert os.path.exists(p)


@pytest.mark.asyncio
async def test_local_path_non_filesystem_downloads_to_tmp(monkeypatch):
    """For non-FilesystemBackend, local_path downloads and cleans up."""
    from unittest.mock import AsyncMock, MagicMock

    mock_backend = MagicMock(spec=[])  # not a FilesystemBackend instance
    mock_backend.load = AsyncMock(return_value=b"pdf content")

    monkeypatch.setattr("sifter.storage._backend", mock_backend)

    yielded_path = None
    async with local_path("remote/doc.pdf") as p:
        yielded_path = p
        assert os.path.exists(p)
        with open(p, "rb") as f:
            assert f.read() == b"pdf content"

    assert not os.path.exists(yielded_path)


# ── Factory ───────────────────────────────────────────────────────────────────

def test_get_storage_backend_filesystem(monkeypatch, tmp_path):
    reset_storage_backend()
    monkeypatch.setenv("SIFTER_STORAGE_BACKEND", "filesystem")
    monkeypatch.setenv("SIFTER_STORAGE_PATH", str(tmp_path))

    # Reload config so env vars are picked up
    import importlib
    import sifter.config as cfg_mod
    importlib.reload(cfg_mod)
    import sifter.storage as storage_mod
    storage_mod.config = cfg_mod.config
    storage_mod._backend = None

    backend = storage_mod.get_storage_backend()
    assert isinstance(backend, FilesystemBackend)
    storage_mod._backend = None  # clean up


def test_reset_storage_backend(monkeypatch, tmp_path):
    import sifter.storage as storage_mod
    storage_mod._backend = FilesystemBackend(str(tmp_path))
    reset_storage_backend()
    assert storage_mod._backend is None


# ── S3Backend constructor ─────────────────────────────────────────────────────

def test_s3_backend_session_missing_aioboto3(monkeypatch):
    """S3Backend._session() raises RuntimeError when aioboto3 is not installed."""
    import builtins
    real_import = builtins.__import__

    def mock_import(name, *args, **kwargs):
        if name == "aioboto3":
            raise ImportError("no aioboto3")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", mock_import)
    backend = S3Backend(bucket="my-bucket")
    with pytest.raises(RuntimeError, match="aioboto3"):
        backend._session()


# ── GCSBackend constructor ────────────────────────────────────────────────────

def test_gcs_backend_client_missing_google_cloud(monkeypatch):
    """GCSBackend._client() raises RuntimeError when google-cloud-storage is not installed."""
    import builtins
    real_import = builtins.__import__

    def mock_import(name, *args, **kwargs):
        if name == "google.cloud":
            raise ImportError("no google.cloud")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", mock_import)
    backend = GCSBackend(bucket="my-bucket")
    with pytest.raises((RuntimeError, ImportError)):
        backend._client()


# ── S3Backend operations ──────────────────────────────────────────────────────

def _make_s3_session_mock():
    """Build a layered async context-manager mock for aioboto3 session.client()."""
    mock_s3 = AsyncMock()
    mock_s3.put_object = AsyncMock()
    mock_s3.get_object = AsyncMock(
        return_value={"Body": AsyncMock(read=AsyncMock(return_value=b"file-data"))}
    )
    mock_s3.delete_object = AsyncMock()

    cm = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=mock_s3)
    cm.__aexit__ = AsyncMock(return_value=False)

    mock_session = MagicMock()
    mock_session.client = MagicMock(return_value=cm)

    return mock_session, mock_s3


@pytest.mark.asyncio
async def test_s3_save(monkeypatch):
    mock_session, mock_s3 = _make_s3_session_mock()
    backend = S3Backend(bucket="test-bucket")
    with patch.object(backend, "_session", return_value=mock_session):
        key = await backend.save("folder1", "doc.pdf", b"hello")
    assert key == "folder1/doc.pdf"
    mock_s3.put_object.assert_called_once_with(Bucket="test-bucket", Key="folder1/doc.pdf", Body=b"hello")


@pytest.mark.asyncio
async def test_s3_load(monkeypatch):
    mock_session, mock_s3 = _make_s3_session_mock()
    backend = S3Backend(bucket="test-bucket")
    with patch.object(backend, "_session", return_value=mock_session):
        data = await backend.load("folder1/doc.pdf")
    assert data == b"file-data"
    mock_s3.get_object.assert_called_once_with(Bucket="test-bucket", Key="folder1/doc.pdf")


@pytest.mark.asyncio
async def test_s3_delete(monkeypatch):
    mock_session, mock_s3 = _make_s3_session_mock()
    backend = S3Backend(bucket="test-bucket")
    with patch.object(backend, "_session", return_value=mock_session):
        await backend.delete("folder1/doc.pdf")
    mock_s3.delete_object.assert_called_once_with(Bucket="test-bucket", Key="folder1/doc.pdf")


def test_s3_session_with_credentials():
    backend = S3Backend(
        bucket="b", access_key_id="AKID", secret_access_key="SECRET", endpoint_url="http://localhost:9000"
    )
    mock_aioboto3 = MagicMock()
    mock_aioboto3.Session.return_value = MagicMock()
    with patch.dict("sys.modules", {"aioboto3": mock_aioboto3}):
        backend._session()
    call_kwargs = mock_aioboto3.Session.call_args[1]
    assert call_kwargs["aws_access_key_id"] == "AKID"
    assert call_kwargs["aws_secret_access_key"] == "SECRET"


# ── GCSBackend operations ─────────────────────────────────────────────────────

def _make_gcs_mock():
    mock_blob = MagicMock()
    mock_blob.download_as_bytes.return_value = b"gcs-data"
    mock_bucket = MagicMock()
    mock_bucket.blob.return_value = mock_blob
    mock_client = MagicMock()
    mock_client.bucket.return_value = mock_bucket
    return mock_client, mock_bucket, mock_blob


@pytest.mark.asyncio
async def test_gcs_save(monkeypatch):
    mock_client, mock_bucket, mock_blob = _make_gcs_mock()
    backend = GCSBackend(bucket="my-bucket")
    with patch.object(backend, "_client", return_value=mock_client):
        key = await backend.save("folder1", "doc.pdf", b"data")
    assert key == "folder1/doc.pdf"
    mock_blob.upload_from_string.assert_called_once_with(b"data")


@pytest.mark.asyncio
async def test_gcs_load(monkeypatch):
    mock_client, mock_bucket, mock_blob = _make_gcs_mock()
    backend = GCSBackend(bucket="my-bucket")
    with patch.object(backend, "_client", return_value=mock_client):
        data = await backend.load("folder1/doc.pdf")
    assert data == b"gcs-data"


@pytest.mark.asyncio
async def test_gcs_delete(monkeypatch):
    mock_client, mock_bucket, mock_blob = _make_gcs_mock()
    backend = GCSBackend(bucket="my-bucket")
    with patch.object(backend, "_client", return_value=mock_client):
        await backend.delete("folder1/doc.pdf")
    mock_blob.delete.assert_called_once()


@pytest.mark.asyncio
async def test_gcs_delete_ignores_error(monkeypatch):
    mock_client, mock_bucket, mock_blob = _make_gcs_mock()
    mock_blob.delete.side_effect = Exception("not found")
    backend = GCSBackend(bucket="my-bucket")
    with patch.object(backend, "_client", return_value=mock_client):
        await backend.delete("missing.pdf")  # must not raise


def test_gcs_client_with_credentials_file(monkeypatch, tmp_path):
    cred_file = str(tmp_path / "creds.json")
    backend = GCSBackend(bucket="b", project="my-project", credentials_file=cred_file)
    mock_gcs = MagicMock()
    mock_gcs.Client.from_service_account_json.return_value = MagicMock()
    with patch.dict("sys.modules", {"google.cloud": MagicMock(), "google.cloud.storage": mock_gcs, "google": MagicMock()}):
        import importlib
        import sifter.storage as storage_mod
        with patch.object(backend, "_client", wraps=lambda: mock_gcs.Client.from_service_account_json(cred_file, project="my-project")):
            result = backend._client()
    assert result is not None


# ── Factory: S3 and GCS variants ─────────────────────────────────────────────

def test_get_storage_backend_s3(monkeypatch):
    import sifter.storage as storage_mod
    storage_mod._backend = None
    monkeypatch.setenv("SIFTER_STORAGE_BACKEND", "s3")
    monkeypatch.setenv("SIFTER_S3_BUCKET", "my-bucket")

    import importlib
    import sifter.config as cfg_mod
    importlib.reload(cfg_mod)
    storage_mod.config = cfg_mod.config
    storage_mod._backend = None

    backend = storage_mod.get_storage_backend()
    assert isinstance(backend, S3Backend)
    storage_mod._backend = None


def test_get_storage_backend_gcs(monkeypatch):
    import sifter.storage as storage_mod
    storage_mod._backend = None
    monkeypatch.setenv("SIFTER_STORAGE_BACKEND", "gcs")
    monkeypatch.setenv("SIFTER_GCS_BUCKET", "my-gcs-bucket")

    import importlib
    import sifter.config as cfg_mod
    importlib.reload(cfg_mod)
    storage_mod.config = cfg_mod.config
    storage_mod._backend = None

    backend = storage_mod.get_storage_backend()
    assert isinstance(backend, GCSBackend)
    storage_mod._backend = None


# ── GCS _client with project kwarg (lines 150-157) ───────────────────────────

def _make_gcs_import_mock(mock_gcs_module):
    """Return a __import__ that returns mock_gcs_module for google.cloud imports."""
    import builtins
    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "google.cloud":
            import types
            mod = types.ModuleType("google.cloud")
            mod.storage = mock_gcs_module
            return mod
        return real_import(name, *args, **kwargs)

    return fake_import


def test_gcs_client_with_project(monkeypatch):
    """GCS client with project set (line 152) and without credentials_file (line 157)."""
    import builtins
    backend = GCSBackend(bucket="my-bucket", project="my-project")
    mock_gcs_module = MagicMock()
    mock_client_instance = MagicMock()
    mock_gcs_module.Client.return_value = mock_client_instance

    monkeypatch.setattr(builtins, "__import__", _make_gcs_import_mock(mock_gcs_module))
    client = backend._client()
    mock_gcs_module.Client.assert_called_once_with(project="my-project")


def test_gcs_client_with_credentials_file_directly(monkeypatch, tmp_path):
    """GCS client calls from_service_account_json when credentials_file set (lines 153-156)."""
    import builtins
    cred_file = str(tmp_path / "creds.json")
    backend = GCSBackend(bucket="my-bucket", credentials_file=cred_file)
    mock_gcs_module = MagicMock()
    mock_client_instance = MagicMock()
    mock_gcs_module.Client.from_service_account_json.return_value = mock_client_instance

    monkeypatch.setattr(builtins, "__import__", _make_gcs_import_mock(mock_gcs_module))
    client = backend._client()
    mock_gcs_module.Client.from_service_account_json.assert_called_once_with(cred_file)


# ── local_path FileNotFoundError in finally (lines 276-277) ──────────────────

@pytest.mark.asyncio
async def test_local_path_file_not_found_in_finally(tmp_path, monkeypatch):
    """FileNotFoundError during os.remove in finally is silenced (lines 276-277)."""
    import os
    import sifter.storage as storage_mod

    # Use an S3-like backend (non-FilesystemBackend) so it downloads to a temp file
    mock_backend = AsyncMock()
    mock_backend.load = AsyncMock(return_value=b"content")

    # Make isinstance(backend, FilesystemBackend) return False
    monkeypatch.setattr(storage_mod, "get_storage_backend", lambda: mock_backend)

    call_count = {"n": 0}

    def mock_remove(path):
        call_count["n"] += 1
        raise FileNotFoundError("already gone")

    monkeypatch.setattr(os, "remove", mock_remove)

    from sifter.storage import local_path
    async with local_path("folder/doc.txt") as path:
        assert path.endswith(".txt")
    # FileNotFoundError was swallowed, no exception propagated
    assert call_count["n"] == 1
