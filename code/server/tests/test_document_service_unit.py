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
    mock_motor_db["document_sift_statuses"].find = MagicMock(
        return_value=MagicMock(to_list=AsyncMock(return_value=[]))
    )
    mock_motor_db["document_sift_statuses"].delete_many = AsyncMock()
    mock_motor_db["processing_queue"].delete_many = AsyncMock()
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


@pytest.mark.asyncio
async def test_delete_document_decrements_sift_counters_and_clears_queue(mock_motor_db):
    doc_id = str(ObjectId())
    folder_id = str(ObjectId())
    sift_pending_id = str(ObjectId())
    sift_done_id = str(ObjectId())
    doc_raw = {"_id": ObjectId(doc_id), "folder_id": folder_id, "storage_path": "/uploads/doc.pdf"}

    mock_motor_db["documents"].find_one = AsyncMock(return_value=doc_raw)
    mock_motor_db["documents"].delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))
    mock_motor_db["documents"].find = MagicMock(return_value=MagicMock(to_list=AsyncMock(return_value=[])))
    mock_motor_db["document_sift_statuses"].find = MagicMock(
        return_value=MagicMock(to_list=AsyncMock(return_value=[
            {"sift_id": sift_pending_id, "status": "pending"},
            {"sift_id": sift_done_id, "status": "done"},
        ]))
    )
    mock_motor_db["document_sift_statuses"].delete_many = AsyncMock()
    mock_motor_db["processing_queue"].delete_many = AsyncMock()
    mock_motor_db["folders"].update_one = AsyncMock()
    mock_motor_db["sift_results"].delete_many = AsyncMock()

    sift_after_inc = {"status": "indexing", "processed_documents": 1, "total_documents": 1}
    mock_motor_db["sifts"].find_one_and_update = AsyncMock(return_value=sift_after_inc)
    mock_motor_db["sifts"].update_one = AsyncMock()

    with patch("sifter.storage.FilesystemBackend.delete", new_callable=AsyncMock):
        svc = DocumentService(mock_motor_db)
        result = await svc.delete_document(doc_id)

    assert result is True
    # processing_queue is purged of pending/processing entries for this doc
    mock_motor_db["processing_queue"].delete_many.assert_awaited_once()
    purge_filter = mock_motor_db["processing_queue"].delete_many.await_args.args[0]
    assert purge_filter["document_id"] == doc_id
    assert "pending" in purge_filter["status"]["$in"]

    # Two sifts → two find_one_and_update calls (one per sift_id)
    assert mock_motor_db["sifts"].find_one_and_update.await_count == 2
    pending_call, done_call = mock_motor_db["sifts"].find_one_and_update.await_args_list
    # Pending status: only total_documents decrements
    assert pending_call.args[1]["$inc"] == {"total_documents": -1}
    # Done status: both counters decrement
    assert done_call.args[1]["$inc"] == {"total_documents": -1, "processed_documents": -1}


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


# ── list_folders with parent_id filter (line 98) ──────────────────────────────

@pytest.mark.asyncio
async def test_list_folders_with_parent_id_filter(mock_motor_db):
    """list_folders with parent_id != 'ALL' adds parent_id to query (line 98)."""
    mock_motor_db["folders"].count_documents = AsyncMock(return_value=0)
    cursor = MagicMock()
    cursor.skip.return_value = cursor
    cursor.limit.return_value = cursor
    cursor.to_list = AsyncMock(return_value=[])
    mock_motor_db["folders"].find = MagicMock(return_value=cursor)

    svc = DocumentService(mock_motor_db)
    folders, total = await svc.list_folders(parent_id=None)
    assert total == 0

    # Verify parent_id=None was included in the query
    call_args = mock_motor_db["folders"].find.call_args[0][0]
    assert "parent_id" in call_args


# ── get_folder_path parent not found (line 120) ───────────────────────────────

@pytest.mark.asyncio
async def test_get_folder_path_parent_not_found(mock_motor_db):
    """When parent folder is missing, path traversal stops early (line 120)."""
    from sifter.models.document import Folder
    folder_id = str(ObjectId())
    parent_id = str(ObjectId())

    child = Folder(name="Child", description="", path="/child",
                   parent_id=parent_id, org_id="default")
    child_raw = child.to_mongo()
    child_raw["_id"] = ObjectId(folder_id)

    call_count = 0

    async def find_one(q, *args, **kwargs):
        nonlocal call_count
        call_count += 1
        oid = str(q.get("_id"))
        if oid == folder_id:
            return child_raw
        return None  # parent not found

    mock_motor_db["folders"].find_one = AsyncMock(side_effect=find_one)
    svc = DocumentService(mock_motor_db)
    path = await svc.get_folder_path(folder_id)
    assert path == []  # parent missing → empty path


# ── get_or_create_folder_by_path (lines 134, 140) ────────────────────────────

@pytest.mark.asyncio
async def test_get_or_create_folder_without_leading_slash(mock_motor_db):
    """Path without leading slash is normalized (line 134)."""
    from sifter.models.document import Folder
    folder_id = ObjectId()
    folder = Folder(name="docs", description="", path="/docs", org_id="default")
    raw = folder.to_mongo()
    raw["_id"] = folder_id

    mock_motor_db["folders"].find_one = AsyncMock(return_value=raw)

    svc = DocumentService(mock_motor_db)
    result = await svc.get_or_create_folder_by_path("docs")  # no leading slash
    assert result.path == "/docs"


@pytest.mark.asyncio
async def test_get_or_create_folder_existing_returns_early(mock_motor_db):
    """Existing folder is returned without insert (line 140)."""
    from sifter.models.document import Folder
    folder_id = ObjectId()
    folder = Folder(name="exist", description="", path="/exist", org_id="default")
    raw = folder.to_mongo()
    raw["_id"] = folder_id

    mock_motor_db["folders"].find_one = AsyncMock(return_value=raw)

    svc = DocumentService(mock_motor_db)
    result = await svc.get_or_create_folder_by_path("/exist")
    mock_motor_db["folders"].insert_one.assert_not_called()
    assert result.path == "/exist"


@pytest.mark.asyncio
async def test_get_or_create_folder_creates_new(mock_motor_db):
    """Non-existent path triggers insert (lines 148-156)."""
    inserted_id = ObjectId()
    mock_motor_db["folders"].find_one = AsyncMock(return_value=None)
    mock_motor_db["folders"].insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=inserted_id)
    )
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[])
    mock_motor_db["folder_extractors"].find = MagicMock(return_value=cursor)

    svc = DocumentService(mock_motor_db)
    result = await svc.get_or_create_folder_by_path("/newpath")
    assert result.path == "/newpath"
    mock_motor_db["folders"].insert_one.assert_called_once()


# ── _delete_document_files (lines 401, 406-407) ──────────────────────────────

@pytest.mark.asyncio
async def test_delete_document_files_no_storage_path(mock_motor_db):
    """No storage_path → returns early without calling backend (line 401)."""
    svc = DocumentService(mock_motor_db)
    await svc._delete_document_files({})  # no storage_path key


@pytest.mark.asyncio
async def test_delete_document_files_backend_exception_swallowed(mock_motor_db):
    """Backend.delete exception is swallowed (lines 406-407)."""
    svc = DocumentService(mock_motor_db)
    with patch("sifter.storage.FilesystemBackend.delete",
               new_callable=AsyncMock,
               side_effect=Exception("backend down")):
        await svc._delete_document_files({"storage_path": "/uploads/x.pdf"})


# ── reset_sift_status (line 425) ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reset_sift_status(mock_motor_db):
    mock_motor_db["document_sift_statuses"].update_one = AsyncMock()
    svc = DocumentService(mock_motor_db)
    await svc.reset_sift_status("doc1", "sift1")
    mock_motor_db["document_sift_statuses"].update_one.assert_called_once()


# ── create_extraction_status legacy alias (line 440) ─────────────────────────

@pytest.mark.asyncio
async def test_create_extraction_status_alias(mock_motor_db):
    inserted_id = ObjectId()
    mock_motor_db["document_sift_statuses"].insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=inserted_id)
    )
    svc = DocumentService(mock_motor_db)
    status = await svc.create_extraction_status("doc1", "sift1")
    assert status.document_id == "doc1"


# ── update_sift_status optional fields (lines 458, 460, 462) ─────────────────

@pytest.mark.asyncio
async def test_update_sift_status_with_all_optional_fields(mock_motor_db):
    mock_motor_db["document_sift_statuses"].update_one = AsyncMock()
    svc = DocumentService(mock_motor_db)
    await svc.update_sift_status(
        "doc1", "sift1", DocumentSiftStatusEnum.ERROR,
        error_message="oops",
        sift_record_id="rec123",
        filter_reason="duplicate",
    )
    call_kwargs = mock_motor_db["document_sift_statuses"].update_one.call_args[0][1]
    updates = call_kwargs["$set"]
    assert updates.get("error_message") == "oops"
    assert updates.get("sift_record_id") == "rec123"
    assert updates.get("filter_reason") == "duplicate"


# ── update_extraction_status legacy alias (line 477) ─────────────────────────

@pytest.mark.asyncio
async def test_update_extraction_status_alias(mock_motor_db):
    mock_motor_db["document_sift_statuses"].update_one = AsyncMock()
    svc = DocumentService(mock_motor_db)
    await svc.update_extraction_status("doc1", "sift1", DocumentSiftStatusEnum.DONE)
    mock_motor_db["document_sift_statuses"].update_one.assert_called_once()


# ── delete_folder with org_id not found (line 175) ───────────────────────────

@pytest.mark.asyncio
async def test_delete_folder_org_id_not_found(mock_motor_db):
    """When org_id is passed and folder not found → return False (line 175)."""
    mock_motor_db["folders"].find_one = AsyncMock(return_value=None)
    svc = DocumentService(mock_motor_db)
    result = await svc.delete_folder(str(ObjectId()), org_id="default")
    assert result is False


# ── delete_folder with children (line 179) ───────────────────────────────────

@pytest.mark.asyncio
async def test_delete_folder_with_children(mock_motor_db):
    """delete_folder recursively deletes children (line 179)."""
    from unittest.mock import call as mock_call
    parent_id = ObjectId()
    child_id = ObjectId()

    child_doc = {"_id": child_id, "name": "child", "parent_id": str(parent_id)}

    def make_cursor(results):
        c = MagicMock()
        c.to_list = AsyncMock(return_value=results)
        return c

    find_call_count = {"n": 0}

    def folders_find(query):
        find_call_count["n"] += 1
        if query.get("parent_id") == str(parent_id):
            return make_cursor([child_doc])
        return make_cursor([])

    mock_motor_db["folders"].find = MagicMock(side_effect=folders_find)
    mock_motor_db["documents"].find = MagicMock(return_value=make_cursor([]))
    mock_motor_db["documents"].delete_many = AsyncMock()
    mock_motor_db["folder_extractors"].delete_many = AsyncMock()
    mock_motor_db["folders"].delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))

    svc = DocumentService(mock_motor_db)
    result = await svc.delete_folder(str(parent_id))
    assert result is True
    assert mock_motor_db["folders"].delete_one.call_count >= 2


# ── delete_folder with documents needing cleanup (lines 183-186) ─────────────

@pytest.mark.asyncio
async def test_delete_folder_with_documents(mock_motor_db):
    """delete_folder deletes docs and their statuses (lines 183-186)."""
    folder_id = ObjectId()
    doc_id = ObjectId()

    doc = {"_id": doc_id, "folder_id": str(folder_id), "storage_path": None}

    mock_motor_db["folders"].find = MagicMock(
        return_value=MagicMock(to_list=AsyncMock(return_value=[]))
    )
    mock_motor_db["documents"].find = MagicMock(
        return_value=MagicMock(to_list=AsyncMock(return_value=[doc]))
    )
    mock_motor_db["document_sift_statuses"].delete_many = AsyncMock()
    mock_motor_db["processing_queue"] = MagicMock()
    mock_motor_db["processing_queue"].delete_many = AsyncMock()
    mock_motor_db["documents"].delete_many = AsyncMock()
    mock_motor_db["folder_extractors"].delete_many = AsyncMock()
    mock_motor_db["folders"].delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))

    svc = DocumentService(mock_motor_db)
    result = await svc.delete_folder(str(folder_id))
    assert result is True
    mock_motor_db["document_sift_statuses"].delete_many.assert_called_once_with(
        {"document_id": str(doc_id)}
    )


# ── list_inherited_extractors with parent (lines 227, 231-239) ───────────────

@pytest.mark.asyncio
async def test_list_inherited_extractors_with_parent(mock_motor_db):
    """folder has a parent with linked sifts → returns inherited (lines 227, 231-239)."""
    child_id = str(ObjectId())
    parent_id = str(ObjectId())

    child_folder_raw = {
        "_id": ObjectId(child_id),
        "name": "child",
        "description": "",
        "parent_id": parent_id,
        "path": "/parent/child",
    }
    parent_folder_raw = {
        "_id": ObjectId(parent_id),
        "name": "parent",
        "description": "",
        "parent_id": None,
        "path": "/parent",
    }
    parent_link_raw = {
        "_id": ObjectId(),
        "folder_id": parent_id,
        "sift_id": "sift-from-parent",
    }

    def find_one_side_effect(query):
        fid = query.get("_id")
        if fid == ObjectId(child_id):
            return child_folder_raw
        if fid == ObjectId(parent_id):
            return parent_folder_raw
        return None

    def find_side_effect(query):
        fid = query.get("folder_id")
        if fid == parent_id:
            return MagicMock(to_list=AsyncMock(return_value=[parent_link_raw]))
        return MagicMock(to_list=AsyncMock(return_value=[]))

    mock_motor_db["folders"].find_one = AsyncMock(side_effect=find_one_side_effect)
    mock_motor_db["folder_extractors"].find = MagicMock(side_effect=find_side_effect)

    svc = DocumentService(mock_motor_db)
    inherited = await svc.list_inherited_extractors(child_id)
    assert len(inherited) == 1
    assert inherited[0].sift_id == "sift-from-parent"


# ── collect_effective_sift_ids traverses ancestors (lines 207-217) ───────────

@pytest.mark.asyncio
async def test_collect_effective_sift_ids_with_ancestor(mock_motor_db):
    """folder has parent with sifts → ancestor sifts collected (lines 207-217)."""
    child_id = str(ObjectId())
    parent_id = str(ObjectId())

    child_folder_raw = {
        "_id": ObjectId(child_id),
        "name": "child",
        "description": "",
        "parent_id": parent_id,
        "path": "/parent/child",
    }
    parent_folder_raw = {
        "_id": ObjectId(parent_id),
        "name": "parent",
        "description": "",
        "parent_id": None,
        "path": "/parent",
    }
    parent_link_raw = {
        "_id": ObjectId(),
        "folder_id": parent_id,
        "sift_id": "ancestor-sift",
    }

    def find_one_side_effect(query):
        fid = query.get("_id")
        if fid == ObjectId(child_id):
            return child_folder_raw
        if fid == ObjectId(parent_id):
            return parent_folder_raw
        return None

    def find_side_effect(query):
        fid = query.get("folder_id")
        if fid == parent_id:
            return MagicMock(to_list=AsyncMock(return_value=[parent_link_raw]))
        return MagicMock(to_list=AsyncMock(return_value=[]))

    mock_motor_db["folders"].find_one = AsyncMock(side_effect=find_one_side_effect)
    mock_motor_db["folder_extractors"].find = MagicMock(side_effect=find_side_effect)

    svc = DocumentService(mock_motor_db)
    sift_ids = await svc.collect_effective_sift_ids(child_id)
    assert "ancestor-sift" in sift_ids


# ── get_or_create_folder propagates parent sifts to subfolder (line 155) ──────

@pytest.mark.asyncio
async def test_get_or_create_folder_propagates_parent_sifts(mock_motor_db):
    """Creating subfolder with parent that has sifts → link_extractor called (line 155)."""
    parent_id = ObjectId()
    child_id = ObjectId()
    sift_link_raw = {"_id": ObjectId(), "folder_id": str(parent_id), "sift_id": "sift-parent"}

    call_count = {"find_one": 0, "insert": 0, "fe_find": 0, "fe_insert": 0}

    async def find_one_side_effect(query):
        call_count["find_one"] += 1
        if query.get("path") == "/parent":
            raw = {
                "_id": parent_id,
                "name": "parent",
                "description": "",
                "parent_id": None,
                "path": "/parent",
            }
            return raw if call_count["find_one"] == 1 else raw
        return None  # /parent/child doesn't exist

    def fe_find_side_effect(query):
        call_count["fe_find"] += 1
        if query.get("folder_id") == str(parent_id):
            return MagicMock(to_list=AsyncMock(return_value=[sift_link_raw]))
        return MagicMock(to_list=AsyncMock(return_value=[]))

    mock_motor_db["folders"].find_one = AsyncMock(side_effect=find_one_side_effect)
    mock_motor_db["folders"].insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=child_id)
    )
    mock_motor_db["folder_extractors"].find = MagicMock(side_effect=fe_find_side_effect)
    mock_motor_db["folder_extractors"].find_one = AsyncMock(return_value=None)
    mock_motor_db["folder_extractors"].insert_one = AsyncMock(
        return_value=MagicMock(inserted_id=ObjectId())
    )

    svc = DocumentService(mock_motor_db)
    result = await svc.get_or_create_folder_by_path("/parent/child")
    assert result is not None
    # link_extractor should have been called for the child folder
    mock_motor_db["folder_extractors"].insert_one.assert_called()


# ── list_inherited_extractors with grandparent (line 239) ────────────────────

@pytest.mark.asyncio
async def test_list_inherited_extractors_with_grandparent(mock_motor_db):
    """3-level hierarchy: grandparent has sifts → continues loop (line 239)."""
    child_id = str(ObjectId())
    parent_id = str(ObjectId())
    grandparent_id = str(ObjectId())

    child_raw = {
        "_id": ObjectId(child_id), "name": "child", "description": "",
        "parent_id": parent_id, "path": "/gp/parent/child",
    }
    parent_raw = {
        "_id": ObjectId(parent_id), "name": "parent", "description": "",
        "parent_id": grandparent_id, "path": "/gp/parent",
    }
    grandparent_raw = {
        "_id": ObjectId(grandparent_id), "name": "gp", "description": "",
        "parent_id": None, "path": "/gp",
    }
    gp_link = {"_id": ObjectId(), "folder_id": grandparent_id, "sift_id": "gp-sift"}

    def find_one_side_effect(query):
        fid = query.get("_id")
        if fid == ObjectId(child_id): return child_raw
        if fid == ObjectId(parent_id): return parent_raw
        if fid == ObjectId(grandparent_id): return grandparent_raw
        return None

    def find_side_effect(query):
        fid = query.get("folder_id")
        if fid == grandparent_id:
            return MagicMock(to_list=AsyncMock(return_value=[gp_link]))
        return MagicMock(to_list=AsyncMock(return_value=[]))

    mock_motor_db["folders"].find_one = AsyncMock(side_effect=find_one_side_effect)
    mock_motor_db["folder_extractors"].find = MagicMock(side_effect=find_side_effect)

    svc = DocumentService(mock_motor_db)
    inherited = await svc.list_inherited_extractors(child_id)
    assert any(i.sift_id == "gp-sift" for i in inherited)


# ── collect_effective_sift_ids — empty folder_id break (line 208) ─────────────

@pytest.mark.asyncio
async def test_collect_effective_sift_ids_empty_folder_id(mock_motor_db):
    """When folder_id is empty string, loop breaks immediately on line 208."""
    svc = DocumentService(mock_motor_db)
    result = await svc.collect_effective_sift_ids("")
    assert result == []


# ── delete_document — status without sift_id skipped (line 415) ──────────────

@pytest.mark.asyncio
async def test_delete_document_status_missing_sift_id_skipped(mock_motor_db):
    """Status entry with no sift_id is skipped via continue (line 415)."""
    doc_id = str(ObjectId())
    folder_id = str(ObjectId())
    doc_raw = {"_id": ObjectId(doc_id), "folder_id": folder_id, "storage_path": "/uploads/doc.pdf"}

    mock_motor_db["documents"].find_one = AsyncMock(return_value=doc_raw)
    mock_motor_db["documents"].delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))
    mock_motor_db["documents"].find = MagicMock(return_value=MagicMock(to_list=AsyncMock(return_value=[])))
    mock_motor_db["document_sift_statuses"].find = MagicMock(
        return_value=MagicMock(to_list=AsyncMock(return_value=[
            {"sift_id": None, "status": "done"},
            {"sift_id": "", "status": "pending"},
        ]))
    )
    mock_motor_db["document_sift_statuses"].delete_many = AsyncMock()
    mock_motor_db["processing_queue"].delete_many = AsyncMock()
    mock_motor_db["folders"].update_one = AsyncMock()
    mock_motor_db["sift_results"].delete_many = AsyncMock()

    with patch("sifter.storage.FilesystemBackend.delete", new_callable=AsyncMock):
        svc = DocumentService(mock_motor_db)
        result = await svc.delete_document(doc_id)

    assert result is True
    # No sifts updated since all statuses have no sift_id
    mock_motor_db["sifts"].find_one_and_update.assert_not_awaited()
