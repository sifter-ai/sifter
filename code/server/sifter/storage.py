"""
Storage backends for document files.

Select via SIFTER_STORAGE_BACKEND:
  filesystem (default) — saves to SIFTER_STORAGE_PATH
  s3                   — AWS S3 or S3-compatible (MinIO, R2); requires aioboto3
  gcs                  — Google Cloud Storage; requires google-cloud-storage

The cloud layer can override get_storage_backend() via dependency injection
or by calling reset_storage_backend() at startup.
"""
import asyncio
import os
from pathlib import Path
from typing import Optional, Protocol, runtime_checkable

import aiofiles
import structlog

from .config import config

logger = structlog.get_logger()


@runtime_checkable
class StorageBackend(Protocol):
    async def save(self, folder_id: str, filename: str, data: bytes) -> str:
        """Save file bytes and return an opaque storage path / key."""
        ...

    async def load(self, path: str) -> bytes:
        """Load file by the path / key returned from save()."""
        ...

    async def delete(self, path: str) -> None:
        """Delete file. Silently ignore if not found."""
        ...


# ─────────────────────────────────────────────────────────────
# Filesystem
# ─────────────────────────────────────────────────────────────

class FilesystemBackend:
    """Default backend. Stores files under base_path/folder_id/filename."""

    def __init__(self, base_path: str):
        self.base_path = Path(base_path)

    async def save(self, folder_id: str, filename: str, data: bytes) -> str:
        dest_dir = self.base_path / folder_id
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / filename
        async with aiofiles.open(dest, "wb") as f:
            await f.write(data)
        return str(dest)

    async def load(self, path: str) -> bytes:
        async with aiofiles.open(path, "rb") as f:
            return await f.read()

    async def delete(self, path: str) -> None:
        try:
            os.remove(path)
        except FileNotFoundError:
            pass


# ─────────────────────────────────────────────────────────────
# S3 (aioboto3)
# ─────────────────────────────────────────────────────────────

class S3Backend:
    """S3-compatible backend. Requires: pip install 'sifter-ai[s3]'"""

    def __init__(
        self,
        bucket: str,
        region: str = "us-east-1",
        access_key_id: str = "",
        secret_access_key: str = "",
        endpoint_url: Optional[str] = None,
    ):
        self.bucket = bucket
        self.region = region
        self.access_key_id = access_key_id
        self.secret_access_key = secret_access_key
        self.endpoint_url = endpoint_url

    def _session(self):
        try:
            import aioboto3  # type: ignore
        except ImportError:
            raise RuntimeError(
                "aioboto3 is required for S3 storage. "
                "Install with: pip install 'sifter-ai[s3]'"
            )
        kwargs: dict = {"region_name": self.region}
        if self.access_key_id:
            kwargs["aws_access_key_id"] = self.access_key_id
        if self.secret_access_key:
            kwargs["aws_secret_access_key"] = self.secret_access_key
        return aioboto3.Session(**kwargs)

    async def save(self, folder_id: str, filename: str, data: bytes) -> str:
        key = f"{folder_id}/{filename}"
        session = self._session()
        async with session.client("s3", endpoint_url=self.endpoint_url) as s3:
            await s3.put_object(Bucket=self.bucket, Key=key, Body=data)
        logger.info("s3_saved", bucket=self.bucket, key=key)
        return key

    async def load(self, path: str) -> bytes:
        session = self._session()
        async with session.client("s3", endpoint_url=self.endpoint_url) as s3:
            response = await s3.get_object(Bucket=self.bucket, Key=path)
            return await response["Body"].read()

    async def delete(self, path: str) -> None:
        session = self._session()
        async with session.client("s3", endpoint_url=self.endpoint_url) as s3:
            await s3.delete_object(Bucket=self.bucket, Key=path)


# ─────────────────────────────────────────────────────────────
# GCS (google-cloud-storage, sync wrapped in executor)
# ─────────────────────────────────────────────────────────────

class GCSBackend:
    """Google Cloud Storage backend. Requires: pip install 'sifter-ai[gcs]'"""

    def __init__(
        self,
        bucket: str,
        project: str = "",
        credentials_file: Optional[str] = None,
    ):
        self.bucket_name = bucket
        self.project = project
        self.credentials_file = credentials_file

    def _client(self):
        try:
            from google.cloud import storage as gcs  # type: ignore
        except ImportError:
            raise RuntimeError(
                "google-cloud-storage is required for GCS storage. "
                "Install with: pip install 'sifter-ai[gcs]'"
            )
        kwargs: dict = {}
        if self.project:
            kwargs["project"] = self.project
        if self.credentials_file:
            return gcs.Client.from_service_account_json(
                self.credentials_file, **kwargs
            )
        return gcs.Client(**kwargs)

    async def save(self, folder_id: str, filename: str, data: bytes) -> str:
        key = f"{folder_id}/{filename}"
        client = self._client()

        def _upload() -> None:
            bucket = client.bucket(self.bucket_name)
            blob = bucket.blob(key)
            blob.upload_from_string(data)

        await asyncio.get_event_loop().run_in_executor(None, _upload)
        logger.info("gcs_saved", bucket=self.bucket_name, key=key)
        return key

    async def load(self, path: str) -> bytes:
        client = self._client()

        def _download() -> bytes:
            bucket = client.bucket(self.bucket_name)
            blob = bucket.blob(path)
            return blob.download_as_bytes()

        return await asyncio.get_event_loop().run_in_executor(None, _download)

    async def delete(self, path: str) -> None:
        client = self._client()

        def _delete() -> None:
            bucket = client.bucket(self.bucket_name)
            blob = bucket.blob(path)
            try:
                blob.delete()
            except Exception:
                pass

        await asyncio.get_event_loop().run_in_executor(None, _delete)


# ─────────────────────────────────────────────────────────────
# Factory
# ─────────────────────────────────────────────────────────────

_backend: Optional[StorageBackend] = None


def get_storage_backend() -> StorageBackend:
    """Return the configured storage backend (singleton per process)."""
    global _backend
    if _backend is not None:
        return _backend

    backend_type = config.storage_backend.lower()

    if backend_type == "s3":
        _backend = S3Backend(
            bucket=config.s3_bucket,
            region=config.s3_region,
            access_key_id=config.s3_access_key_id,
            secret_access_key=config.s3_secret_access_key,
            endpoint_url=config.s3_endpoint_url or None,
        )
    elif backend_type == "gcs":
        _backend = GCSBackend(
            bucket=config.gcs_bucket,
            project=config.gcs_project,
            credentials_file=config.gcs_credentials_file or None,
        )
    else:
        _backend = FilesystemBackend(config.storage_path)

    logger.info("storage_backend_initialized", backend=backend_type)
    return _backend


def reset_storage_backend() -> None:
    """Reset the cached backend (useful for testing or runtime reconfiguration)."""
    global _backend
    _backend = None


# ─────────────────────────────────────────────────────────────
# Local-path helper
# ─────────────────────────────────────────────────────────────

from contextlib import asynccontextmanager
from pathlib import Path
import tempfile


@asynccontextmanager
async def local_path(storage_path: str):
    """
    Async context manager that yields a local filesystem path for any storage key.

    - FilesystemBackend: yields the path unchanged (no I/O).
    - S3/GCS backends: downloads to a temp file, yields the temp path,
      then deletes the temp file on exit.

    Usage:
        async with local_path(doc.storage_path) as path:
            result = extract(path)
    """
    backend = get_storage_backend()
    if isinstance(backend, FilesystemBackend):
        yield storage_path
        return

    data = await backend.load(storage_path)
    suffix = Path(storage_path).suffix or ".bin"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(data)
        tmp.flush()
        tmp.close()
        yield tmp.name
    finally:
        try:
            os.remove(tmp.name)
        except FileNotFoundError:
            pass
