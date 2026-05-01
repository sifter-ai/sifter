"""
Unit tests for document_processor — background task queue.
MongoDB, storage, SiftService, DocumentService and UsageLimiter are all mocked.
"""
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from sifter.models.document import DocumentSiftStatusEnum
from sifter.models.sift_result import SiftResult
from sifter.services import document_processor as dp

# Patch targets: these functions are imported lazily inside function bodies
_PATCH_STORAGE = "sifter.storage.get_storage_backend"
_PATCH_LIMITER = "sifter.services.limits.get_usage_limiter"
_PATCH_WEBHOOK_SVC = "sifter.services.webhook_service.WebhookService"


def _make_task_doc(
    document_id="doc1",
    sift_id="sift1",
    storage_path="/uploads/f/doc.pdf",
    status="pending",
    attempts=1,
    max_attempts=3,
):
    from bson import ObjectId
    return {
        "_id": ObjectId(),
        "document_id": document_id,
        "sift_id": sift_id,
        "storage_path": storage_path,
        "status": status,
        "attempts": attempts,
        "max_attempts": max_attempts,
        "created_at": datetime.now(timezone.utc),
    }


def _make_sift_result(sift_id="sift1"):
    return SiftResult(
        sift_id=sift_id,
        document_id="doc1",
        filename="doc.pdf",
        document_type="invoice",
        confidence=0.95,
        extracted_data={"client": "Acme"},
    )


# ── enqueue ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_enqueue_inserts_task(mock_motor_db):
    dp._db = mock_motor_db
    await dp.enqueue("doc1", "sift1", "/uploads/f/doc.pdf")
    mock_motor_db["processing_queue"].insert_one.assert_called_once()
    call_args = mock_motor_db["processing_queue"].insert_one.call_args[0][0]
    assert call_args["document_id"] == "doc1"
    assert call_args["sift_id"] == "sift1"
    assert call_args["status"] == "pending"


# ── _claim_task ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_claim_task_returns_document(mock_motor_db):
    task_doc = _make_task_doc()
    mock_motor_db["processing_queue"].find_one_and_update = AsyncMock(return_value=task_doc)
    result = await dp._claim_task(mock_motor_db)
    assert result == task_doc
    mock_motor_db["processing_queue"].find_one_and_update.assert_called_once()


@pytest.mark.asyncio
async def test_claim_task_returns_none_when_empty(mock_motor_db):
    mock_motor_db["processing_queue"].find_one_and_update = AsyncMock(return_value=None)
    result = await dp._claim_task(mock_motor_db)
    assert result is None


# ── _dispatch_webhook ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_dispatch_webhook_calls_service(mock_motor_db):
    with patch(_PATCH_WEBHOOK_SVC) as MockWH:
        mock_svc = AsyncMock()
        MockWH.return_value = mock_svc
        await dp._dispatch_webhook(
            db=mock_motor_db,
            event="sift.document.processed",
            payload={"status": "processed"},
            sift_id="sift1",
            org_id="default",
        )
        MockWH.assert_called_once_with(mock_motor_db)
        mock_svc.dispatch.assert_called_once()


@pytest.mark.asyncio
async def test_dispatch_webhook_swallows_exception(mock_motor_db):
    with patch(_PATCH_WEBHOOK_SVC) as MockWH:
        mock_svc = MagicMock()
        mock_svc.dispatch = AsyncMock(side_effect=Exception("webhook down"))
        MockWH.return_value = mock_svc
        # must not raise
        await dp._dispatch_webhook(mock_motor_db, "sift.error", {})


# ── _process_task — success ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_process_task_success(mock_motor_db):
    task_doc = _make_task_doc()
    doc_svc = MagicMock()
    doc_svc.update_sift_status = AsyncMock()
    ext_svc = MagicMock()
    result = _make_sift_result()
    result.id = "result1"
    ext_svc.process_single_document = AsyncMock(return_value=[result])

    with patch(_PATCH_STORAGE) as mock_storage, \
         patch(_PATCH_LIMITER) as mock_limiter, \
         patch("sifter.services.document_processor._dispatch_webhook", new_callable=AsyncMock):

        mock_backend = MagicMock()
        mock_backend.load = AsyncMock(return_value=b"pdf bytes")
        mock_storage.return_value = mock_backend

        mock_lim = MagicMock()
        mock_lim.check_extraction = AsyncMock()
        mock_lim.record_processed = AsyncMock()
        mock_limiter.return_value = mock_lim

        discard = await dp._process_task(
            db=mock_motor_db,
            task_doc=task_doc,
            document_id="doc1",
            sift_id="sift1",
            storage_path="/uploads/f/doc.pdf",
            sift_org_id="default",
            attempts=1,
            max_attempts=3,
            doc_svc=doc_svc,
            ext_svc=ext_svc,
        )

    assert discard is False
    doc_svc.update_sift_status.assert_called()
    ext_svc.process_single_document.assert_called_once()
    mock_motor_db["processing_queue"].update_one.assert_called()


# ── _process_task — discard ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_process_task_discard(mock_motor_db):
    from sifter.services.sift_service import DocumentDiscardedError
    task_doc = _make_task_doc()
    doc_svc = MagicMock()
    doc_svc.update_sift_status = AsyncMock()
    ext_svc = MagicMock()
    ext_svc.process_single_document = AsyncMock(
        side_effect=DocumentDiscardedError("wrong type")
    )

    with patch(_PATCH_STORAGE) as mock_storage, \
         patch(_PATCH_LIMITER) as mock_limiter, \
         patch("sifter.services.document_processor._dispatch_webhook", new_callable=AsyncMock):

        mock_backend = MagicMock()
        mock_backend.load = AsyncMock(return_value=b"pdf bytes")
        mock_storage.return_value = mock_backend
        mock_lim = MagicMock()
        mock_lim.check_extraction = AsyncMock()
        mock_lim.record_processed = AsyncMock()
        mock_limiter.return_value = mock_lim

        discard = await dp._process_task(
            db=mock_motor_db,
            task_doc=task_doc,
            document_id="doc1",
            sift_id="sift1",
            storage_path="/uploads/f/doc.pdf",
            sift_org_id="default",
            attempts=1,
            max_attempts=3,
            doc_svc=doc_svc,
            ext_svc=ext_svc,
        )

    assert discard is True
    doc_svc.update_sift_status.assert_any_call(
        "doc1", "sift1", DocumentSiftStatusEnum.DISCARDED, filter_reason="wrong type"
    )


# ── _process_task — retriable error ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_process_task_error_marks_pending_on_retry(mock_motor_db):
    task_doc = _make_task_doc(attempts=1, max_attempts=3)
    doc_svc = MagicMock()
    doc_svc.update_sift_status = AsyncMock()
    ext_svc = MagicMock()
    ext_svc.process_single_document = AsyncMock(side_effect=RuntimeError("LLM timeout"))

    with patch(_PATCH_STORAGE) as mock_storage, \
         patch(_PATCH_LIMITER) as mock_limiter, \
         patch("sifter.services.document_processor._dispatch_webhook", new_callable=AsyncMock):

        mock_storage.return_value.load = AsyncMock(return_value=b"pdf")
        mock_limiter.return_value.check_extraction = AsyncMock()

        discard = await dp._process_task(
            db=mock_motor_db,
            task_doc=task_doc,
            document_id="doc1",
            sift_id="sift1",
            storage_path="/uploads/f/doc.pdf",
            sift_org_id="default",
            attempts=1,
            max_attempts=3,
            doc_svc=doc_svc,
            ext_svc=ext_svc,
        )

    assert discard is False
    call_kwargs = mock_motor_db["processing_queue"].update_one.call_args_list[-1][0][1]
    assert call_kwargs["$set"]["status"] == "pending"


# ── _process_task — permanent error ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_process_task_error_marks_error_on_max_attempts(mock_motor_db):
    task_doc = _make_task_doc(attempts=3, max_attempts=3)
    doc_svc = MagicMock()
    doc_svc.update_sift_status = AsyncMock()
    ext_svc = MagicMock()
    ext_svc.process_single_document = AsyncMock(side_effect=RuntimeError("permanent fail"))
    ext_svc.mark_document_failed = AsyncMock()

    with patch(_PATCH_STORAGE) as mock_storage, \
         patch(_PATCH_LIMITER) as mock_limiter, \
         patch("sifter.services.document_processor._dispatch_webhook", new_callable=AsyncMock):

        mock_storage.return_value.load = AsyncMock(return_value=b"pdf")
        mock_limiter.return_value.check_extraction = AsyncMock()

        await dp._process_task(
            db=mock_motor_db,
            task_doc=task_doc,
            document_id="doc1",
            sift_id="sift1",
            storage_path="/uploads/f/doc.pdf",
            sift_org_id="default",
            attempts=3,
            max_attempts=3,
            doc_svc=doc_svc,
            ext_svc=ext_svc,
        )

    call_kwargs = mock_motor_db["processing_queue"].update_one.call_args_list[0][0][1]
    assert call_kwargs["$set"]["status"] == "error"


# ── ensure_indexes ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ensure_indexes(mock_motor_db):
    await dp.ensure_indexes(mock_motor_db)
    assert mock_motor_db["processing_queue"].create_index.call_count >= 2


# ── start_workers ─────────────────────────────────────────────────────────────

def test_start_workers_creates_tasks(mock_motor_db):
    import asyncio

    async def _run():
        tasks = dp.start_workers(2, mock_motor_db)
        assert len(tasks) == 2
        for t in tasks:
            t.cancel()
            try:
                await t
            except asyncio.CancelledError:
                pass

    asyncio.run(_run())


# ── _process_task — sift not found error ──────────────────────────────────────

@pytest.mark.asyncio
async def test_process_task_sift_not_found_skips_mark_failed(mock_motor_db):
    """When sift is not found, mark_document_failed is NOT called."""
    task_doc = _make_task_doc(attempts=3, max_attempts=3)
    doc_svc = MagicMock()
    doc_svc.update_sift_status = AsyncMock()
    ext_svc = MagicMock()
    sift_id = "sift_missing"
    ext_svc.process_single_document = AsyncMock(
        side_effect=ValueError(f"Sift {sift_id} not found")
    )
    ext_svc.mark_document_failed = AsyncMock()

    with patch(_PATCH_STORAGE) as mock_storage, \
         patch(_PATCH_LIMITER) as mock_limiter, \
         patch("sifter.services.document_processor._dispatch_webhook", new_callable=AsyncMock):

        mock_storage.return_value.load = AsyncMock(return_value=b"pdf")
        mock_limiter.return_value.check_extraction = AsyncMock()

        await dp._process_task(
            db=mock_motor_db,
            task_doc=task_doc,
            document_id="doc1",
            sift_id=sift_id,
            storage_path="/uploads/f/doc.pdf",
            sift_org_id="default",
            attempts=3,
            max_attempts=3,
            doc_svc=doc_svc,
            ext_svc=ext_svc,
        )

    ext_svc.mark_document_failed.assert_not_called()


# ── _process_task — mark_document_failed raises ───────────────────────────────

@pytest.mark.asyncio
async def test_process_task_mark_failed_exception_is_swallowed(mock_motor_db):
    """mark_document_failed raising should not surface to caller."""
    task_doc = _make_task_doc(attempts=3, max_attempts=3)
    doc_svc = MagicMock()
    doc_svc.update_sift_status = AsyncMock()
    ext_svc = MagicMock()
    ext_svc.process_single_document = AsyncMock(side_effect=RuntimeError("fail"))
    ext_svc.mark_document_failed = AsyncMock(side_effect=Exception("db down"))

    with patch(_PATCH_STORAGE) as mock_storage, \
         patch(_PATCH_LIMITER) as mock_limiter, \
         patch("sifter.services.document_processor._dispatch_webhook", new_callable=AsyncMock):

        mock_storage.return_value.load = AsyncMock(return_value=b"pdf")
        mock_limiter.return_value.check_extraction = AsyncMock()

        discard = await dp._process_task(
            db=mock_motor_db,
            task_doc=task_doc,
            document_id="doc1",
            sift_id="sift1",
            storage_path="/uploads/f/doc.pdf",
            sift_org_id="default",
            attempts=3,
            max_attempts=3,
            doc_svc=doc_svc,
            ext_svc=ext_svc,
        )

    assert discard is False  # should still complete without raising
