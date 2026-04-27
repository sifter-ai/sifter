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
os.environ.setdefault("SIFTER_DEFAULT_API_KEY", "test-key")

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
    assert len(r3.json()["items"]) == 1


async def test_list_extractors(client):
    fid = await _make_folder(client, "Multi")
    e1 = await _make_extraction(client, "E1")
    e2 = await _make_extraction(client, "E2")

    await client.post(f"/api/folders/{fid}/extractors", json={"extraction_id": e1})
    await client.post(f"/api/folders/{fid}/extractors", json={"extraction_id": e2})

    r = await client.get(f"/api/folders/{fid}/extractors")
    assert r.status_code == 200
    assert len(r.json()["items"]) == 2
    ids = {e["extraction_id"] for e in r.json()["items"]}
    assert ids == {e1, e2}


async def test_unlink_extractor(client):
    fid = await _make_folder(client, "UnlinkF")
    eid = await _make_extraction(client, "UnlinkE")

    await client.post(f"/api/folders/{fid}/extractors", json={"extraction_id": eid})
    r = await client.delete(f"/api/folders/{fid}/extractors/{eid}")
    assert r.status_code == 204

    r2 = await client.get(f"/api/folders/{fid}/extractors")
    assert r2.json()["items"] == []


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


# ───────────────────────────────────────────
# Folder by-path
# ───────────────────────────────────────────

async def test_get_folder_by_path_existing(client):
    await client.post("/api/folders", json={"name": "PathTest"})
    r = await client.get("/api/folders/by-path", params={"path": "/pathtest"})
    assert r.status_code == 200
    assert r.json()["name"] == "PathTest"


async def test_get_folder_by_path_not_found(client):
    r = await client.get("/api/folders/by-path", params={"path": "/nonexistent-path-xyz"})
    assert r.status_code == 404


async def test_get_folder_by_path_create(client):
    r = await client.get("/api/folders/by-path", params={"path": "/auto/created/path", "create": "true"})
    assert r.status_code == 200
    assert "path" in r.json()


async def test_update_folder_by_path(client):
    await client.post("/api/folders", json={"name": "ToUpdateByPath"})
    r = await client.patch("/api/folders/by-path", params={"path": "/toupdatebypath"}, json={"name": "UpdatedByPath"})
    assert r.status_code == 200
    assert r.json()["name"] == "UpdatedByPath"


async def test_update_folder_by_path_not_found(client):
    r = await client.patch("/api/folders/by-path", params={"path": "/ghost"}, json={"name": "Ghost"})
    assert r.status_code == 404


async def test_delete_folder_by_path(client):
    await client.post("/api/folders", json={"name": "ToDeleteByPath"})
    r = await client.delete("/api/folders/by-path", params={"path": "/todeletebypath"})
    assert r.status_code == 204


async def test_delete_folder_by_path_not_found(client):
    r = await client.delete("/api/folders/by-path", params={"path": "/ghost-path"})
    assert r.status_code == 404


# ───────────────────────────────────────────
# Folder path (breadcrumbs)
# ───────────────────────────────────────────

async def test_get_folder_path_root(client):
    r = await client.post("/api/folders", json={"name": "AncestorTest"})
    fid = r.json()["id"]
    r2 = await client.get(f"/api/folders/{fid}/path")
    assert r2.status_code == 200
    assert isinstance(r2.json(), list)


# ───────────────────────────────────────────
# Folder ↔ Sift links via /sifts route
# ───────────────────────────────────────────

async def test_list_sifts_for_folder(client):
    fid = await _make_folder(client, "SiftList")
    eid = await _make_extraction(client, "SiftListE")
    await client.post(f"/api/folders/{fid}/extractors", json={"extraction_id": eid})

    r = await client.get(f"/api/folders/{fid}/sifts")
    assert r.status_code == 200
    assert len(r.json()["items"]) >= 1


async def test_list_sifts_for_folder_not_found(client):
    r = await client.get("/api/folders/000000000000000000000000/sifts")
    assert r.status_code == 404


async def test_link_sift_via_sifts_route(client):
    fid = await _make_folder(client, "LinkViaSifts")
    eid = await _make_extraction(client, "LinkViaSiftsE")

    r = await client.post(f"/api/folders/{fid}/sifts", json={"sift_id": eid})
    assert r.status_code == 201
    assert r.json()["sift_id"] == eid


async def test_unlink_sift_via_sifts_route(client):
    fid = await _make_folder(client, "UnlinkSift")
    eid = await _make_extraction(client, "UnlinkSiftE")
    await client.post(f"/api/folders/{fid}/sifts", json={"sift_id": eid})

    r = await client.delete(f"/api/folders/{fid}/sifts/{eid}")
    assert r.status_code == 204


async def test_unlink_sift_not_found(client):
    fid = await _make_folder(client, "UnlinkNotFound")
    r = await client.delete(f"/api/folders/{fid}/sifts/000000000000000000000000")
    assert r.status_code == 404


# ───────────────────────────────────────────
# Folder documents list
# ───────────────────────────────────────────

async def test_list_folder_documents(client):
    fid = await _make_folder(client, "DocListF")
    r = await client.get(f"/api/folders/{fid}/documents")
    assert r.status_code == 200
    assert "items" in r.json()


async def test_list_folder_documents_not_found(client):
    r = await client.get("/api/folders/000000000000000000000000/documents")
    assert r.status_code == 404


# ── list_folders with all=false (lines 108-111) ───────────────────────────────

async def test_list_folders_all_false_root(client):
    """all=false&parent_id=root → lists root folders (line 109)."""
    r = await client.get("/api/folders", params={"all": "false", "parent_id": "root"})
    assert r.status_code == 200
    assert "items" in r.json()


async def test_list_folders_all_false_by_parent(client):
    """all=false&parent_id={id} → lists direct children (line 111)."""
    rf = await client.post("/api/folders", json={"name": "ParentForChildren", "description": ""})
    parent_id = rf.json()["id"]
    r = await client.get("/api/folders", params={"all": "false", "parent_id": parent_id})
    assert r.status_code == 200


# ── create_folder inherits parent sifts (lines 126-127) ──────────────────────

async def test_create_subfolder_inherits_parent_sifts(client):
    """Creating a subfolder propagates parent's linked sifts (lines 126-127)."""
    from unittest.mock import AsyncMock, patch

    # Create parent folder
    rf = await client.post("/api/folders", json={"name": "InheritParent", "description": ""})
    parent_id = rf.json()["id"]

    # Link a sift to the parent
    rs = await client.post("/api/sifts", json={"name": "InheritSift", "instructions": "Extract: x"})
    sift_id = rs.json()["id"]
    with patch("sifter.api.folders.enqueue", new_callable=AsyncMock):
        await client.post(f"/api/folders/{parent_id}/sifts", json={"sift_id": sift_id})

    # Create a child folder — should inherit parent's sifts
    rc = await client.post("/api/folders", json={
        "name": "InheritChild", "description": "", "parent_id": parent_id
    })
    assert rc.status_code == 201
    child_id = rc.json()["id"]

    # Verify the child got the sift link
    rl = await client.get(f"/api/folders/{child_id}/extractors")
    assert any(l["sift_id"] == sift_id for l in rl.json()["items"])


# ── _do_link_and_propagate with subfolders (lines 33, 39-47, 50) ─────────────

async def test_link_sift_propagates_to_subfolders(client):
    """Linking a sift to a folder propagates to subfolders (lines 33, 50)."""
    from unittest.mock import AsyncMock, patch

    rf_parent = await client.post("/api/folders", json={"name": "PropParent", "description": ""})
    parent_id = rf_parent.json()["id"]

    # Create a subfolder under parent
    rf_child = await client.post("/api/folders", json={
        "name": "PropChild", "description": "", "parent_id": parent_id
    })
    child_id = rf_child.json()["id"]

    rs = await client.post("/api/sifts", json={"name": "PropSift", "instructions": "Extract: y"})
    sift_id = rs.json()["id"]

    with patch("sifter.api.folders.enqueue", new_callable=AsyncMock):
        r = await client.post(f"/api/folders/{parent_id}/sifts", json={"sift_id": sift_id})
    assert r.status_code == 201
    assert r.json()["propagated_to_subfolders"] == 1

    # Child should also have the link
    rl = await client.get(f"/api/folders/{child_id}/extractors")
    assert any(l["sift_id"] == sift_id for l in rl.json()["items"])


async def test_link_enqueues_existing_docs(client):
    """Linking a sift to a folder that already has documents enqueues them (lines 39-47, 50)."""
    from unittest.mock import AsyncMock, patch
    from sifter.db import get_db
    from sifter.models.document import Document

    rf = await client.post("/api/folders", json={"name": "EnqueueDocs", "description": ""})
    folder_id = rf.json()["id"]

    # Insert a document directly into db
    db = get_db()
    doc = Document(
        folder_id=folder_id,
        filename="existing.pdf",
        original_filename="existing.pdf",
        content_type="application/pdf",
        size_bytes=512,
        storage_path="/uploads/existing.pdf",
        org_id="default",
    )
    await db["documents"].insert_one(doc.to_mongo())

    rs = await client.post("/api/sifts", json={"name": "EnqueueSift", "instructions": "Extract: z"})
    sift_id = rs.json()["id"]

    with patch("sifter.api.folders.enqueue", new_callable=AsyncMock) as mock_enqueue:
        r = await client.post(f"/api/folders/{folder_id}/sifts", json={"sift_id": sift_id})

    assert r.status_code == 201
    assert r.json()["enqueued_existing"] == 1
    mock_enqueue.assert_called_once()


# ── _do_unlink_and_propagate with subfolders (line 62) ───────────────────────

async def test_unlink_sift_propagates_to_subfolders(client):
    """Unlinking a sift also removes it from subfolders (line 62)."""
    from unittest.mock import AsyncMock, patch

    rf_p = await client.post("/api/folders", json={"name": "UnlinkParent", "description": ""})
    parent_id = rf_p.json()["id"]
    rf_c = await client.post("/api/folders", json={
        "name": "UnlinkChild", "description": "", "parent_id": parent_id
    })

    rs = await client.post("/api/sifts", json={"name": "UnlinkSift", "instructions": "Extract: w"})
    sift_id = rs.json()["id"]

    with patch("sifter.api.folders.enqueue", new_callable=AsyncMock):
        await client.post(f"/api/folders/{parent_id}/sifts", json={"sift_id": sift_id})

    r = await client.delete(f"/api/folders/{parent_id}/sifts/{sift_id}")
    assert r.status_code == 204


# ── link_sift folder not found (line 274) ────────────────────────────────────

async def test_link_sift_folder_not_found(client):
    r = await client.post("/api/folders/000000000000000000000000/sifts",
                          json={"sift_id": "s1"})
    assert r.status_code == 404


# ── list_extractors folder not found (line 312) ───────────────────────────────

async def test_list_extractors_folder_not_found(client):
    r = await client.get("/api/folders/000000000000000000000000/extractors")
    assert r.status_code == 404


# ── link_extractor legacy: missing sift_id, folder not found (lines 330, 333) ─

async def test_link_extractor_missing_sift_id(client):
    rf = await client.post("/api/folders", json={"name": "ExtractorMissID", "description": ""})
    folder_id = rf.json()["id"]
    r = await client.post(f"/api/folders/{folder_id}/extractors", json={})
    assert r.status_code == 422


async def test_link_extractor_legacy_folder_not_found(client):
    r = await client.post("/api/folders/000000000000000000000000/extractors",
                          json={"sift_id": "s1"})
    assert r.status_code == 404


# ── upload_document error paths (lines 395-397, 402, 408-412, 435-438) ───────

async def test_upload_unsupported_file_type(client):
    """Unsupported extension → 415 (lines 395-397)."""
    rf = await client.post("/api/folders", json={"name": "UnsupFolder", "description": ""})
    folder_id = rf.json()["id"]
    r = await client.post(
        f"/api/folders/{folder_id}/documents",
        files={"file": ("malware.exe", b"binary", "application/octet-stream")},
    )
    assert r.status_code == 415


async def test_upload_file_too_large(client):
    """File exceeds max size → 413 (line 402)."""
    from unittest.mock import patch
    from sifter.config import config as sifter_config

    rf = await client.post("/api/folders", json={"name": "BigFileFolder", "description": ""})
    folder_id = rf.json()["id"]

    with patch.object(sifter_config, "max_file_size_mb", 0):
        r = await client.post(
            f"/api/folders/{folder_id}/documents",
            files={"file": ("doc.txt", b"x" * 10, "text/plain")},
        )
    assert r.status_code == 413


# ── upload_document replace mode (lines 446, 457) ────────────────────────────

async def test_upload_document_replace_mode(client):
    """Re-uploading with on_conflict=replace resets sift status (lines 446, 457)."""
    from unittest.mock import AsyncMock, patch

    rf = await client.post("/api/folders", json={"name": "ReplaceFolder", "description": ""})
    folder_id = rf.json()["id"]

    rs = await client.post("/api/sifts", json={"name": "ReplaceSift", "instructions": "Extract: a"})
    sift_id = rs.json()["id"]
    with patch("sifter.api.folders.enqueue", new_callable=AsyncMock):
        await client.post(f"/api/folders/{folder_id}/sifts", json={"sift_id": sift_id})

    with patch("sifter.storage.FilesystemBackend.save", new_callable=AsyncMock,
               return_value=f"{folder_id}/doc.txt"), \
         patch("sifter.api.folders.enqueue", new_callable=AsyncMock):
        # First upload
        r1 = await client.post(
            f"/api/folders/{folder_id}/documents",
            data={"on_conflict": "replace"},
            files={"file": ("doc.txt", b"hello world", "text/plain")},
        )
    assert r1.status_code == 202

    with patch("sifter.storage.FilesystemBackend.save", new_callable=AsyncMock,
               return_value=f"{folder_id}/doc.txt"), \
         patch("sifter.api.folders.enqueue", new_callable=AsyncMock):
        # Replace upload
        r2 = await client.post(
            f"/api/folders/{folder_id}/documents",
            data={"on_conflict": "replace"},
            files={"file": ("doc.txt", b"updated content", "text/plain")},
        )
    assert r2.status_code == 202


# ── link_sift: doc has no storage_path (line 42) ─────────────────────────────

async def test_link_sift_skips_doc_without_storage_path(client):
    """Docs without storage_path are skipped during link_sift (line 42)."""
    from sifter.db import get_db
    from sifter.models.document import Document

    rf = await client.post("/api/folders", json={"name": "NoPathFolder", "description": ""})
    folder_id = rf.json()["id"]

    db = get_db()
    # Insert raw doc dict directly — storage_path is absent (not set)
    from bson import ObjectId as _ObjId
    await db["documents"].insert_one({
        "_id": _ObjId(),
        "folder_id": folder_id,
        "filename": "no_path.pdf",
        "original_filename": "no_path.pdf",
        "content_type": "application/pdf",
        "size_bytes": 100,
        "org_id": "default",
        # storage_path intentionally omitted
    })

    rs = await client.post("/api/sifts", json={"name": "SkipNoPathSift", "instructions": "Extract: x"})
    sift_id = rs.json()["id"]

    from unittest.mock import AsyncMock, patch
    with patch("sifter.api.folders.enqueue", new_callable=AsyncMock) as mock_enqueue:
        r = await client.post(f"/api/folders/{folder_id}/sifts", json={"sift_id": sift_id})

    assert r.status_code == 201
    assert r.json()["enqueued_existing"] == 0
    mock_enqueue.assert_not_called()


# ── link_sift: doc already has sift status (line 44) ─────────────────────────

async def test_link_sift_skips_already_queued_doc(client):
    """Docs already with sift status are skipped during link_sift (line 44)."""
    from sifter.db import get_db
    from sifter.models.document import Document
    from sifter.services.document_service import DocumentService

    rf = await client.post("/api/folders", json={"name": "AlreadyQueuedFolder", "description": ""})
    folder_id = rf.json()["id"]

    rs = await client.post("/api/sifts", json={"name": "AlreadyQueuedSift", "instructions": "Extract: y"})
    sift_id = rs.json()["id"]

    db = get_db()
    doc = Document(
        folder_id=folder_id,
        filename="queued.pdf",
        original_filename="queued.pdf",
        content_type="application/pdf",
        size_bytes=512,
        storage_path="/uploads/queued.pdf",
        org_id="default",
    )
    insert_result = await db["documents"].insert_one(doc.to_mongo())
    doc_id = str(insert_result.inserted_id)

    # Pre-create sift status so the doc is already queued
    svc = DocumentService(db)
    await svc.create_sift_status(doc_id, sift_id)

    from unittest.mock import AsyncMock, patch
    with patch("sifter.api.folders.enqueue", new_callable=AsyncMock) as mock_enqueue:
        r = await client.post(f"/api/folders/{folder_id}/sifts", json={"sift_id": sift_id})

    assert r.status_code == 201
    assert r.json()["enqueued_existing"] == 0
    mock_enqueue.assert_not_called()


# ── upload PDF with too many pages (lines 408-412) ───────────────────────────

async def test_upload_pdf_too_many_pages(client):
    """PDF with too many pages → 413 (lines 408-412)."""
    from unittest.mock import patch

    rf = await client.post("/api/folders", json={"name": "PDFPagesFolder", "description": ""})
    folder_id = rf.json()["id"]

    with patch("sifter.services.file_processor.count_pdf_pages", return_value=10000):
        r = await client.post(
            f"/api/folders/{folder_id}/documents",
            files={"file": ("big.pdf", b"%PDF-1.4 fake", "application/pdf")},
        )
    assert r.status_code == 413


# ── upload document DuplicateKeyError (lines 435-438) ────────────────────────

async def test_upload_duplicate_key_error(client):
    """DuplicateKeyError during save_document → 409 (lines 435-438)."""
    from unittest.mock import AsyncMock, patch, MagicMock

    rf = await client.post("/api/folders", json={"name": "DupKeyFolder", "description": ""})
    folder_id = rf.json()["id"]

    class DuplicateKeyError(Exception):
        pass

    with patch("sifter.services.document_service.DocumentService.save_document",
               new_callable=AsyncMock,
               side_effect=DuplicateKeyError("E11000 duplicate key")), \
         patch("sifter.storage.FilesystemBackend.save",
               new_callable=AsyncMock,
               return_value=f"{folder_id}/dup.txt"):
        r = await client.post(
            f"/api/folders/{folder_id}/documents",
            files={"file": ("dup.txt", b"content", "text/plain")},
        )
    assert r.status_code == 409
