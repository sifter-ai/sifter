"""
Unit tests for document_service — _normalize_segment (pure) and DocumentService
CRUD with mocked MongoDB.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock
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
