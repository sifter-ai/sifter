"""
Integration tests for /api/documents — get, delete, reprocess.
Uses real MongoDB (sifter_test). Documents are inserted directly.
"""
import os
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock, patch

os.environ["SIFTER_MONGODB_DATABASE"] = "sifter_test"
os.environ.setdefault("SIFTER_DEFAULT_API_KEY", "test-key")

pytestmark = pytest.mark.asyncio(loop_scope="session")

from sifter.server import app
from sifter.auth import Principal, get_current_principal


async def _mock_principal() -> Principal:
    return Principal(key_id="bootstrap")


app.dependency_overrides[get_current_principal] = _mock_principal


@pytest_asyncio.fixture(scope="session")
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture(autouse=True, loop_scope="session")
async def clean_db(client):
    from sifter.db import get_db
    db = get_db()
    for col in ("documents", "folders", "document_sift_statuses", "sifts", "processing_queue"):
        await db[col].delete_many({})
    yield


async def _create_folder_and_document(client):
    """Create a folder then upload a document via the folders API."""
    rf = await client.post("/api/folders", json={
        "name": "Test Folder",
        "description": "test",
    })
    assert rf.status_code in (200, 201), rf.text
    folder_id = rf.json()["id"]

    # Insert document directly into DB (bypasses storage/LLM)
    from sifter.db import get_db
    from sifter.models.document import Document
    from datetime import datetime, timezone
    doc = Document(
        folder_id=folder_id,
        filename="test.pdf",
        original_filename="test.pdf",
        content_type="application/pdf",
        size_bytes=1024,
        storage_path="/uploads/test.pdf",
        org_id="default",
    )
    db = get_db()
    result = await db["documents"].insert_one(doc.to_mongo())
    doc_id = str(result.inserted_id)
    return folder_id, doc_id


# ── get document ──────────────────────────────────────────────────────────────

async def test_get_document(client):
    _, doc_id = await _create_folder_and_document(client)
    r = await client.get(f"/api/documents/{doc_id}")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == doc_id
    assert data["filename"] == "test.pdf"


async def test_get_document_not_found(client):
    r = await client.get("/api/documents/000000000000000000000000")
    assert r.status_code == 404


# ── delete document ───────────────────────────────────────────────────────────

async def test_delete_document(client):
    _, doc_id = await _create_folder_and_document(client)
    with patch("sifter.storage.FilesystemBackend.delete", new_callable=AsyncMock):
        r = await client.delete(f"/api/documents/{doc_id}")
    assert r.status_code == 204


# ── reprocess document ────────────────────────────────────────────────────────

async def test_reprocess_document(client):
    sid_r = await client.post("/api/sifts", json={
        "name": "Reprocess Test",
        "instructions": "Extract: client",
    })
    sift_id = sid_r.json()["id"]

    _, doc_id = await _create_folder_and_document(client)

    with patch("sifter.services.document_processor.enqueue", new_callable=AsyncMock):
        r = await client.post(f"/api/documents/{doc_id}/reprocess", json={
            "sift_id": sift_id,
        })
    assert r.status_code == 202


# ── download document ─────────────────────────────────────────────────────────

async def test_download_document(client):
    _, doc_id = await _create_folder_and_document(client)
    with patch("sifter.storage.FilesystemBackend.load", new_callable=AsyncMock, return_value=b"pdf-content"):
        r = await client.get(f"/api/documents/{doc_id}/download")
    assert r.status_code == 200
    assert r.content == b"pdf-content"
    assert "attachment" in r.headers.get("content-disposition", "")


async def test_download_document_not_found(client):
    r = await client.get("/api/documents/000000000000000000000000/download")
    assert r.status_code == 404
