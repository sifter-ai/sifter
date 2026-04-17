"""
Integration tests for Folders, Webhooks, and Extraction PATCH endpoints.
Runs against a real MongoDB test database (sifter_test).
Requires MongoDB running at localhost:27017.
"""

import io
import os
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

os.environ["SIFTER_MONGODB_DATABASE"] = "sifter_test"
os.environ.setdefault("SIFTER_LLM_API_KEY", "test-key")

pytestmark = pytest.mark.asyncio(loop_scope="session")

from sifter.server import app
from sifter.auth import Principal, get_current_principal

# Same org as test_api.py — single shared principal override avoids conflicts
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
    for col in ("sifts", "sift_results", "aggregations",
                "folders", "documents", "folder_extractors",
                "document_sift_statuses", "webhooks"):
        await db[col].delete_many({})
    yield


# ───────────────────────────────────────────
# Extraction PATCH
# ───────────────────────────────────────────

async def test_patch_extraction_name(client):
    r = await client.post("/api/sifts", json={
        "name": "Old Name",
        "instructions": "Extract: x",
    })
    assert r.status_code == 200
    eid = r.json()["id"]

    r2 = await client.patch(f"/api/sifts/{eid}", json={"name": "New Name"})
    assert r2.status_code == 200
    assert r2.json()["name"] == "New Name"
    assert r2.json()["instructions"] == "Extract: x"  # unchanged


async def test_patch_extraction_instructions(client):
    r = await client.post("/api/sifts", json={
        "name": "Patchy",
        "instructions": "Extract: a",
    })
    eid = r.json()["id"]

    r2 = await client.patch(f"/api/sifts/{eid}", json={
        "instructions": "Extract: a, b, c"
    })
    assert r2.status_code == 200
    assert r2.json()["instructions"] == "Extract: a, b, c"


async def test_patch_extraction_not_found(client):
    r = await client.patch(
        "/api/sifts/000000000000000000000000",
        json={"name": "Ghost"},
    )
    assert r.status_code == 404


# ───────────────────────────────────────────
# Folders CRUD
# ───────────────────────────────────────────

async def test_create_folder(client):
    r = await client.post("/api/folders", json={"name": "Invoices 2024"})
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Invoices 2024"
    assert "id" in data
    assert data["document_count"] == 0


async def test_list_folders_empty(client):
    r = await client.get("/api/folders")
    assert r.status_code == 200
    assert r.json()["items"] == []


async def test_list_folders(client):
    for name in ("A", "B", "C"):
        await client.post("/api/folders", json={"name": name})
    r = await client.get("/api/folders")
    assert r.status_code == 200
    assert len(r.json()["items"]) == 3


async def test_get_folder(client):
    r = await client.post("/api/folders", json={"name": "Contracts"})
    fid = r.json()["id"]

    r2 = await client.get(f"/api/folders/{fid}")
    assert r2.status_code == 200
    assert r2.json()["id"] == fid
    assert r2.json()["name"] == "Contracts"


async def test_get_folder_not_found(client):
    r = await client.get("/api/folders/000000000000000000000000")
    assert r.status_code == 404


async def test_patch_folder_name(client):
    r = await client.post("/api/folders", json={"name": "Draft"})
    fid = r.json()["id"]

    r2 = await client.patch(f"/api/folders/{fid}", json={"name": "Final"})
    assert r2.status_code == 200
    assert r2.json()["name"] == "Final"


async def test_patch_folder_not_found(client):
    r = await client.patch(
        "/api/folders/000000000000000000000000",
        json={"name": "Ghost"},
    )
    assert r.status_code == 404


async def test_delete_folder(client):
    r = await client.post("/api/folders", json={"name": "To Delete"})
    fid = r.json()["id"]

    r2 = await client.delete(f"/api/folders/{fid}")
    assert r2.status_code == 204

    r3 = await client.get(f"/api/folders/{fid}")
    assert r3.status_code == 404


async def test_delete_folder_not_found(client):
    r = await client.delete("/api/folders/000000000000000000000000")
    assert r.status_code == 404


# ───────────────────────────────────────────
# Folder ↔ Extractor links
# ───────────────────────────────────────────

async def _make_folder(client, name="F"):
    r = await client.post("/api/folders", json={"name": name})
    return r.json()["id"]


async def _make_extraction(client, name="E"):
    r = await client.post("/api/sifts", json={
        "name": name,
        "instructions": "Extract: x",
    })
    return r.json()["id"]


async def test_link_extractor(client):
    fid = await _make_folder(client, "LinkTest")
    eid = await _make_extraction(client, "LinkExt")

    r = await client.post(f"/api/folders/{fid}/extractors", json={"extraction_id": eid})
    assert r.status_code == 201
    assert r.json()["extraction_id"] == eid
    assert r.json()["folder_id"] == fid


async def test_link_extractor_idempotent(client):
    fid = await _make_folder(client, "Idem")
    eid = await _make_extraction(client, "IdemExt")

    await client.post(f"/api/folders/{fid}/extractors", json={"extraction_id": eid})
    r2 = await client.post(f"/api/folders/{fid}/extractors", json={"extraction_id": eid})
    assert r2.status_code == 201  # returns existing link, no duplicate

    r3 = await client.get(f"/api/folders/{fid}/extractors")
    assert len(r3.json()) == 1


async def test_list_extractors(client):
    fid = await _make_folder(client, "Multi")
    e1 = await _make_extraction(client, "E1")
    e2 = await _make_extraction(client, "E2")

    await client.post(f"/api/folders/{fid}/extractors", json={"extraction_id": e1})
    await client.post(f"/api/folders/{fid}/extractors", json={"extraction_id": e2})

    r = await client.get(f"/api/folders/{fid}/extractors")
    assert r.status_code == 200
    assert len(r.json()) == 2
    ids = {e["extraction_id"] for e in r.json()}
    assert ids == {e1, e2}


async def test_unlink_extractor(client):
    fid = await _make_folder(client, "UnlinkF")
    eid = await _make_extraction(client, "UnlinkE")

    await client.post(f"/api/folders/{fid}/extractors", json={"extraction_id": eid})
    r = await client.delete(f"/api/folders/{fid}/extractors/{eid}")
    assert r.status_code == 204

    r2 = await client.get(f"/api/folders/{fid}/extractors")
    assert r2.json() == []


async def test_unlink_extractor_not_found(client):
    fid = await _make_folder(client, "GhostF")
    r = await client.delete(f"/api/folders/{fid}/extractors/000000000000000000000000")
    assert r.status_code == 404


# ───────────────────────────────────────────
# Document upload to folder
# ───────────────────────────────────────────

async def test_upload_document_to_folder(client):
    fid = await _make_folder(client, "UploadF")
    content = b"invoice content here"
    r = await client.post(
        f"/api/folders/{fid}/documents",
        files={"file": ("invoice.txt", io.BytesIO(content), "text/plain")},
    )
    assert r.status_code == 202
    data = r.json()
    assert data["filename"] == "invoice.txt"
    assert "id" in data
    assert data["enqueued_for"] == []  # no linked extractors yet


async def test_upload_document_enqueues_for_linked_extractor(client):
    fid = await _make_folder(client, "EnqueueF")
    eid = await _make_extraction(client, "EnqueueE")
    await client.post(f"/api/folders/{fid}/extractors", json={"extraction_id": eid})

    content = b"some pdf bytes"
    r = await client.post(
        f"/api/folders/{fid}/documents",
        files={"file": ("doc.txt", io.BytesIO(content), "text/plain")},
    )
    assert r.status_code == 202
    assert eid in r.json()["enqueued_for"]


async def test_list_documents(client):
    fid = await _make_folder(client, "ListDocsF")
    for i in range(2):
        await client.post(
            f"/api/folders/{fid}/documents",
            files={"file": (f"doc{i}.txt", io.BytesIO(b"x"), "text/plain")},
        )

    r = await client.get(f"/api/folders/{fid}/documents")
    assert r.status_code == 200
    assert len(r.json()["items"]) == 2


async def test_upload_folder_not_found(client):
    r = await client.post(
        "/api/folders/000000000000000000000000/documents",
        files={"file": ("x.txt", io.BytesIO(b"x"), "text/plain")},
    )
    assert r.status_code == 404


# ───────────────────────────────────────────
# Webhooks CRUD
# ───────────────────────────────────────────

async def test_create_webhook(client):
    r = await client.post("/api/webhooks", json={
        "events": ["sift.document.processed", "sift.completed"],
        "url": "https://example.com/hook",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["url"] == "https://example.com/hook"
    assert "sift.document.processed" in data["events"]
    assert "id" in data
    assert data["sift_id"] is None


async def test_create_webhook_with_sift_filter(client):
    eid = await _make_extraction(client, "HookExt")
    r = await client.post("/api/webhooks", json={
        "events": ["sift.*"],
        "url": "https://example.com/filtered",
        "sift_id": eid,
    })
    assert r.status_code == 201
    assert r.json()["sift_id"] == eid


async def test_list_webhooks_empty(client):
    r = await client.get("/api/webhooks")
    assert r.status_code == 200
    assert r.json()["items"] == []


async def test_list_webhooks(client):
    for i in range(3):
        await client.post("/api/webhooks", json={
            "events": ["sift.*"],
            "url": f"https://example.com/hook{i}",
        })
    r = await client.get("/api/webhooks")
    assert r.status_code == 200
    assert len(r.json()["items"]) == 3


async def test_delete_webhook(client):
    r = await client.post("/api/webhooks", json={
        "events": ["**"],
        "url": "https://example.com/del",
    })
    hook_id = r.json()["id"]

    r2 = await client.delete(f"/api/webhooks/{hook_id}")
    assert r2.status_code == 204

    r3 = await client.get("/api/webhooks")
    ids = [h["id"] for h in r3.json()["items"]]
    assert hook_id not in ids


async def test_delete_webhook_not_found(client):
    r = await client.delete("/api/webhooks/000000000000000000000000")
    assert r.status_code == 404
