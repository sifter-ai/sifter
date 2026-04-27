"""
Unit tests for document_service — _normalize_segment (pure) and DocumentService
CRUD with mocked MongoDB.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId

from sifter.services.document_service import DocumentService
from sifter.models.document import DocumentSiftStatusEnum


# ── _normalize_segment ────────────────────────────────────────────────────────

def test_normalize_segment_lowercase():
    assert DocumentService._normalize_segment("Invoices") == "invoices"


def test_normalize_segment_spaces_to_underscores():
    assert DocumentService._normalize_segment("My Folder") == "my_folder"


def test_normalize_segment_strips_whitespace():
    assert DocumentService._normalize_segment("  docs  ") == "docs"


def test_normalize_segment_mixed():
    assert DocumentService._normalize_segment("  My Invoices  ") == "my_invoices"


# ── create_folder ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_folder_root(mock_motor_db):
    inserted_id = ObjectId()
    mock_motor_db["folders"].insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=inserted_id)
    )

    svc = DocumentService(mock_motor_db)
    folder = await svc.create_folder("Invoices", "All invoices", parent_id=None)

    assert folder.path == "/invoices"
    assert folder.id == str(inserted_id)
    mock_motor_db["folders"].insert_one.assert_called_once()


@pytest.mark.asyncio
async def test_create_folder_with_parent(mock_motor_db):
    from sifter.models.document import Folder
    parent_id = str(ObjectId())
    parent = Folder(name="Root", description="root folder", path="/root", org_id="default")
    parent.id = parent_id

    inserted_id = ObjectId()
    mock_motor_db["folders"].find_one = AsyncMock(
        return_value=parent.to_mongo() | {"_id": ObjectId(parent_id)}
    )
    mock_motor_db["folders"].insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=inserted_id)
    )

    svc = DocumentService(mock_motor_db)
    folder = await svc.create_folder("Sub", "sub folder", parent_id=parent_id)

    assert folder.path == "/root/sub"


# ── list_folders ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_folders_all(mock_motor_db):
    from sifter.models.document import Folder
    f = Folder(name="Invoices", description="", path="/invoices", org_id="default")
    raw = f.to_mongo()
    raw["_id"] = ObjectId()

    mock_motor_db["folders"].count_documents = AsyncMock(return_value=1)
    cursor = MagicMock()
    cursor.skip.return_value = cursor
    cursor.limit.return_value = cursor
    cursor.to_list = AsyncMock(return_value=[raw])
    mock_motor_db["folders"].find = MagicMock(return_value=cursor)

    svc = DocumentService(mock_motor_db)
    folders, total = await svc.list_folders()
    assert total == 1
    assert len(folders) == 1
    assert folders[0].name == "Invoices"


# ── get_folder ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_folder_found(mock_motor_db):
    from sifter.models.document import Folder
    folder_id = str(ObjectId())
    f = Folder(name="Invoices", description="", path="/invoices", org_id="default")
    raw = f.to_mongo()
    raw["_id"] = ObjectId(folder_id)

    mock_motor_db["folders"].find_one = AsyncMock(return_value=raw)
    svc = DocumentService(mock_motor_db)
    folder = await svc.get_folder(folder_id)

    assert folder is not None
    assert folder.name == "Invoices"


@pytest.mark.asyncio
async def test_get_folder_not_found(mock_motor_db):
    mock_motor_db["folders"].find_one = AsyncMock(return_value=None)
    svc = DocumentService(mock_motor_db)
    folder = await svc.get_folder(str(ObjectId()))
    assert folder is None


# ── update_sift_status ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_sift_status_processing(mock_motor_db):
    mock_motor_db["document_sift_statuses"].update_one = AsyncMock(
        return_value=MagicMock(modified_count=1)
    )

    svc = DocumentService(mock_motor_db)
    await svc.update_sift_status("doc1", "sift1", DocumentSiftStatusEnum.PROCESSING)
    mock_motor_db["document_sift_statuses"].update_one.assert_called_once()


@pytest.mark.asyncio
async def test_update_sift_status_done(mock_motor_db):
    mock_motor_db["document_sift_statuses"].update_one = AsyncMock(
        return_value=MagicMock(modified_count=1)
    )

    svc = DocumentService(mock_motor_db)
    await svc.update_sift_status("doc1", "sift1", DocumentSiftStatusEnum.DONE)
    call_kwargs = mock_motor_db["document_sift_statuses"].update_one.call_args[0][1]
    assert "completed_at" in call_kwargs["$set"]


# ── save_document ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_save_document_on_conflict_fail(mock_motor_db):
    inserted_id = ObjectId()
    folder_id = str(ObjectId())
    mock_motor_db["documents"].insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=inserted_id)
    )
    mock_motor_db["folders"].update_one = AsyncMock()

    svc = DocumentService(mock_motor_db)
    doc = await svc.save_document(
        folder_id=folder_id,
        filename="invoice.pdf",
        content_type="application/pdf",
        size_bytes=1024,
        storage_path="/uploads/invoice.pdf",
        on_conflict="fail",
    )

    assert doc.filename == "invoice.pdf"
    assert doc.id == str(inserted_id)


# ── list_documents ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_documents_by_folder(mock_motor_db):
    doc_id = ObjectId()
    raw = {
        "_id": doc_id,
        "folder_id": "folder1",
        "filename": "inv.pdf",
        "original_filename": "inv.pdf",
        "content_type": "application/pdf",
        "size_bytes": 512,
        "storage_path": "/uploads/inv.pdf",
        "uploaded_at": None,
    }

    mock_motor_db["documents"].count_documents = AsyncMock(return_value=1)
    cursor = MagicMock()
    cursor.skip.return_value = cursor
    cursor.limit.return_value = cursor
    cursor.to_list = AsyncMock(return_value=[raw])
    mock_motor_db["documents"].find = MagicMock(return_value=cursor)

    statuses_cursor = MagicMock()
    statuses_cursor.to_list = AsyncMock(return_value=[])
    mock_motor_db["document_sift_statuses"].find = MagicMock(return_value=statuses_cursor)

    svc = DocumentService(mock_motor_db)
    docs, total = await svc.list_documents(folder_id="folder1")
    assert total == 1
    assert docs[0]["filename"] == "inv.pdf"


# ── get_folder_path ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_folder_path_root_folder(mock_motor_db):
    """Root folder (no parent) returns empty path."""
    from sifter.models.document import Folder
    folder_id = str(ObjectId())
    f = Folder(name="Root", description="", path="/root", parent_id=None, org_id="default")
    raw = f.to_mongo()
    raw["_id"] = ObjectId(folder_id)

    mock_motor_db["folders"].find_one = AsyncMock(return_value=raw)
    svc = DocumentService(mock_motor_db)
    path = await svc.get_folder_path(folder_id)
    assert path == []


@pytest.mark.asyncio
async def test_get_folder_path_with_parent(mock_motor_db):
    from sifter.models.document import Folder
    parent_id = str(ObjectId())
    child_id = str(ObjectId())

    parent = Folder(name="Parent", description="", path="/parent", parent_id=None, org_id="default")
    parent_raw = parent.to_mongo()
    parent_raw["_id"] = ObjectId(parent_id)

    child = Folder(name="Child", description="", path="/parent/child", parent_id=parent_id, org_id="default")
    child_raw = child.to_mongo()
    child_raw["_id"] = ObjectId(child_id)

    async def find_one(q, *args, **kwargs):
        oid = q.get("_id")
        if str(oid) == child_id:
            return child_raw
        if str(oid) == parent_id:
            return parent_raw
        return None

    mock_motor_db["folders"].find_one = AsyncMock(side_effect=find_one)
    svc = DocumentService(mock_motor_db)
    path = await svc.get_folder_path(child_id)
    assert len(path) == 1
    assert path[0].name == "Parent"


# ── get_folder_by_path ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_folder_by_path_found(mock_motor_db):
    from sifter.models.document import Folder
    folder_id = ObjectId()
    f = Folder(name="Invoices", description="", path="/invoices", org_id="default")
    raw = f.to_mongo()
    raw["_id"] = folder_id

    mock_motor_db["folders"].find_one = AsyncMock(return_value=raw)
    svc = DocumentService(mock_motor_db)
    folder = await svc.get_folder_by_path("/invoices")
    assert folder is not None
    assert folder.name == "Invoices"


@pytest.mark.asyncio
async def test_get_folder_by_path_not_found(mock_motor_db):
    mock_motor_db["folders"].find_one = AsyncMock(return_value=None)
    svc = DocumentService(mock_motor_db)
    folder = await svc.get_folder_by_path("/nonexistent")
    assert folder is None


# ── save_document on_conflict=replace ────────────────────────────────────────

@pytest.mark.asyncio
async def test_save_document_on_conflict_replace(mock_motor_db):
    from datetime import datetime, timezone
    folder_id = str(ObjectId())
    doc_id = ObjectId()
    raw_doc = {
        "_id": doc_id,
        "folder_id": folder_id,
        "filename": "invoice.pdf",
        "original_filename": "invoice.pdf",
        "content_type": "application/pdf",
        "size_bytes": 2048,
        "storage_path": "/uploads/invoice.pdf",
        "uploaded_at": datetime.now(timezone.utc),
        "org_id": "default",
    }

    mock_motor_db["documents"].update_one = AsyncMock(
        return_value=MagicMock(upserted_id=doc_id, modified_count=0)
    )
    mock_motor_db["documents"].find_one = AsyncMock(return_value=raw_doc)
    mock_motor_db["folders"].update_one = AsyncMock()

    svc = DocumentService(mock_motor_db)
    doc = await svc.save_document(
        folder_id=folder_id,
        filename="invoice.pdf",
        content_type="application/pdf",
        size_bytes=2048,
        storage_path="/uploads/invoice.pdf",
        on_conflict="replace",
    )

    assert doc.filename == "invoice.pdf"
    mock_motor_db["documents"].update_one.assert_called_once()


# ── delete_document ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_document_success(mock_motor_db):
    doc_id = str(ObjectId())
    folder_id = str(ObjectId())
    doc_raw = {
        "_id": ObjectId(doc_id),
        "folder_id": folder_id,
        "storage_path": "/uploads/doc.pdf",
    }

    mock_motor_db["documents"].find_one = AsyncMock(return_value=doc_raw)
    mock_motor_db["documents"].delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))
    mock_motor_db["documents"].find = MagicMock(return_value=MagicMock(to_list=AsyncMock(return_value=[])))
    mock_motor_db["document_sift_statuses"].delete_many = AsyncMock()
    mock_motor_db["folders"].update_one = AsyncMock()

    mock_motor_db["sift_results"].delete_many = AsyncMock()
    with patch("sifter.storage.FilesystemBackend.delete", new_callable=AsyncMock):
        svc = DocumentService(mock_motor_db)
        result = await svc.delete_document(doc_id)

    assert result is True


@pytest.mark.asyncio
async def test_delete_document_not_found(mock_motor_db):
    mock_motor_db["documents"].find_one = AsyncMock(return_value=None)
    svc = DocumentService(mock_motor_db)
    result = await svc.delete_document(str(ObjectId()))
    assert result is False


# ── create_sift_status ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_sift_status(mock_motor_db):
    inserted_id = ObjectId()
    mock_motor_db["document_sift_statuses"].insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=inserted_id)
    )

    svc = DocumentService(mock_motor_db)
    status = await svc.create_sift_status("doc1", "sift1")
    assert status.document_id == "doc1"
    assert status.sift_id == "sift1"
    assert status.id == str(inserted_id)


# ── get_subfolder_ids ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_subfolder_ids_empty(mock_motor_db):
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[])
    mock_motor_db["folders"].find = MagicMock(return_value=cursor)

    svc = DocumentService(mock_motor_db)
    ids = await svc.get_subfolder_ids(str(ObjectId()))
    assert ids == []


@pytest.mark.asyncio
async def test_get_subfolder_ids_with_children(mock_motor_db):
    child_id = ObjectId()
    child = {"_id": child_id, "parent_id": "parent_id"}

    call_count = 0

    async def to_list_side_effect(length=None):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return [child]  # first call: children of parent
        return []  # second call: children of child (none)

    cursor = MagicMock()
    cursor.to_list = AsyncMock(side_effect=to_list_side_effect)
    mock_motor_db["folders"].find = MagicMock(return_value=cursor)

    svc = DocumentService(mock_motor_db)
    ids = await svc.get_subfolder_ids("parent_id")
    assert str(child_id) in ids
