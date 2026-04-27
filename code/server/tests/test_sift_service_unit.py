"""
Unit tests for SiftService — MongoDB and sift_agent are mocked.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId

from sifter.models.sift import Sift, SiftStatus
from sifter.models.sift_result import SiftResult
from sifter.services.sift_service import SiftService, DocumentDiscardedError, _snake, _infer_schema


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_sift(sift_id="507f1f77bcf86cd799439011", schema=None, schema_fields=None, schema_version=1):
    return Sift(
        _id=sift_id,
        name="Invoices",
        instructions="Extract: client, amount",
        schema=schema,
        schema_fields=schema_fields or [],
        schema_version=schema_version,
        status=SiftStatus.ACTIVE,
        org_id="default",
        total_documents=1,
        processed_documents=0,
    )


def _make_result(sift_id="sift1"):
    r = SiftResult(
        sift_id=sift_id,
        document_id="doc1",
        filename="invoice.pdf",
        document_type="invoice",
        confidence=0.95,
        extracted_data={"client": "Acme", "amount": 100.0},
    )
    r.id = str(ObjectId())
    return r


# ── _snake / _infer_schema helpers ────────────────────────────────────────────

def test_snake_converts_spaces():
    assert _snake("Total Amount") == "total_amount"

def test_snake_camel_case():
    assert _snake("clientName") == "client_name"

def test_snake_hyphens():
    assert _snake("vat-number") == "vat_number"

def test_snake_empty():
    assert _snake("") == "field"

def test_infer_schema_basic():
    schema = _infer_schema({"client": "Acme", "amount": 99.5, "count": 3})
    assert "client (string)" in schema
    assert "amount (number)" in schema
    assert "count (number)" in schema

def test_infer_schema_null_is_string():
    schema = _infer_schema({"x": None})
    assert "x (string)" in schema

def test_infer_schema_bool():
    schema = _infer_schema({"paid": True})
    assert "paid (boolean)" in schema

def test_infer_schema_array_object():
    schema = _infer_schema({"items": [], "meta": {}})
    assert "items (array)" in schema
    assert "meta (object)" in schema


# ── process_single_document — success ────────────────────────────────────────

@pytest.mark.asyncio
async def test_process_single_document_success(mock_motor_db):
    from sifter.services.sift_agent import ExtractionAgentResult

    sift = _make_sift()
    mock_motor_db["sifts"].find_one = AsyncMock(return_value=sift.to_mongo() | {"_id": ObjectId(sift.id)})

    updated_doc = sift.to_mongo() | {"_id": ObjectId(sift.id), "processed_documents": 1, "total_documents": 1}
    mock_motor_db["sifts"].find_one_and_update = AsyncMock(return_value=updated_doc)

    agent_result = ExtractionAgentResult(
        document_type="invoice",
        matches_filter=True,
        filter_reason="",
        confidence=0.95,
        extracted_data=[{"client": "Acme", "amount": 100.0}],
        page_blocks=[],
        llm_citations={},
    )

    inserted_result = _make_result()
    mock_results_service = MagicMock()
    mock_results_service.insert_result = AsyncMock(return_value=inserted_result)
    mock_results_service.ensure_indexes = AsyncMock()
    mock_results_service.col = mock_motor_db["sift_results"]

    svc = SiftService(mock_motor_db)
    svc.results_service = mock_results_service

    with patch("sifter.services.sift_service.sift_agent.extract", new_callable=AsyncMock) as mock_extract, \
         patch("sifter.services.webhook_service.WebhookService"):
        mock_extract.return_value = agent_result

        results = await svc.process_single_document(sift.id, b"pdf bytes", "invoice.pdf")

    assert len(results) == 1
    assert results[0].confidence == 0.95
    mock_extract.assert_called_once()


# ── process_single_document — sift not found ─────────────────────────────────

@pytest.mark.asyncio
async def test_process_single_document_sift_not_found(mock_motor_db):
    mock_motor_db["sifts"].find_one = AsyncMock(return_value=None)
    svc = SiftService(mock_motor_db)
    valid_oid = str(ObjectId())

    with pytest.raises(ValueError, match="not found"):
        await svc.process_single_document(valid_oid, b"pdf", "file.pdf")


# ── process_single_document — document discarded ─────────────────────────────

@pytest.mark.asyncio
async def test_process_single_document_discarded(mock_motor_db):
    from sifter.services.sift_agent import ExtractionAgentResult

    sift = _make_sift()
    mongo_doc = sift.to_mongo() | {"_id": ObjectId(sift.id)}
    mock_motor_db["sifts"].find_one = AsyncMock(return_value=mongo_doc)
    mock_motor_db["sifts"].find_one_and_update = AsyncMock(
        return_value=mongo_doc | {"processed_documents": 1, "total_documents": 1}
    )

    agent_result = ExtractionAgentResult(
        document_type="unknown",
        matches_filter=False,
        filter_reason="not an invoice",
        confidence=0.1,
        extracted_data=[],
    )

    svc = SiftService(mock_motor_db)

    with patch("sifter.services.sift_service.sift_agent.extract", new_callable=AsyncMock) as mock_extract:
        mock_extract.return_value = agent_result
        with pytest.raises(DocumentDiscardedError) as exc_info:
            await svc.process_single_document(sift.id, b"pdf", "doc.pdf")

    assert "not an invoice" in exc_info.value.reason


# ── mark_document_failed ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mark_document_failed_increments_counter(mock_motor_db):
    from bson import ObjectId as OID
    sift_id = str(OID())
    updated = {
        "_id": OID(sift_id),
        "processed_documents": 1,
        "total_documents": 3,
        "status": "indexing",
    }
    mock_motor_db["sifts"].find_one_and_update = AsyncMock(return_value=updated)
    mock_motor_db["sifts"].update_one = AsyncMock()

    svc = SiftService(mock_motor_db)
    svc.results_service = MagicMock()
    svc.results_service.col = mock_motor_db["sift_results"]

    await svc.mark_document_failed(sift_id, "LLM error")
    mock_motor_db["sifts"].find_one_and_update.assert_called_once()


@pytest.mark.asyncio
async def test_mark_document_failed_sets_error_when_last(mock_motor_db):
    from bson import ObjectId as OID
    sift_id = str(OID())
    updated = {
        "_id": OID(sift_id),
        "processed_documents": 1,
        "total_documents": 1,
    }
    mock_motor_db["sifts"].find_one_and_update = AsyncMock(return_value=updated)
    mock_motor_db["sifts"].update_one = AsyncMock()
    mock_motor_db["sift_results"].count_documents = AsyncMock(return_value=0)

    svc = SiftService(mock_motor_db)
    mock_rss = MagicMock()
    mock_rss.col = mock_motor_db["sift_results"]
    svc.results_service = mock_rss

    await svc.mark_document_failed(sift_id, "permanent error")
    update_call = mock_motor_db["sifts"].update_one.call_args[0][1]
    assert update_call["$set"]["status"] == SiftStatus.ERROR


# ── _update_schema_if_changed ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_update_schema_no_change(mock_motor_db):
    sift = _make_sift(schema="client (string)", schema_fields=[{"name": "client", "type": "string"}])
    svc = SiftService(mock_motor_db)

    # Same data → no DB write expected
    with patch("sifter.services.webhook_service.WebhookService"):
        await svc._update_schema_if_changed(sift, {"client": "Acme"})

    mock_motor_db["sifts"].update_one.assert_not_called()


@pytest.mark.asyncio
async def test_update_schema_first_time(mock_motor_db):
    sift = _make_sift(schema=None, schema_fields=[])
    mock_motor_db["sifts"].update_one = AsyncMock()
    mongo_doc = sift.to_mongo() | {"_id": ObjectId(sift.id)}
    mock_motor_db["sifts"].find_one = AsyncMock(return_value=mongo_doc)

    svc = SiftService(mock_motor_db)
    with patch("sifter.services.webhook_service.WebhookService"):
        await svc._update_schema_if_changed(sift, {"client": "Acme", "amount": 100.0})

    mock_motor_db["sifts"].update_one.assert_called_once()


@pytest.mark.asyncio
async def test_update_schema_changed_fires_webhook(mock_motor_db):
    old_fields = [{"name": "client", "type": "string"}]
    sift = _make_sift(
        schema="client (string)",
        schema_fields=old_fields,
        schema_version=1,
    )
    mock_motor_db["sifts"].update_one = AsyncMock()
    mongo_doc = sift.to_mongo() | {"_id": ObjectId(sift.id)}
    mock_motor_db["sifts"].find_one = AsyncMock(return_value=mongo_doc)

    svc = SiftService(mock_motor_db)
    with patch("sifter.services.webhook_service.WebhookService") as MockWH:
        mock_wh = MagicMock()
        mock_wh.dispatch = AsyncMock()
        MockWH.return_value = mock_wh
        # New field added → schema changed
        await svc._update_schema_if_changed(sift, {"client": "Acme", "amount": 100.0})

    mock_wh.dispatch.assert_called_once()


# ── get_records ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_records_returns_list(mock_motor_db):
    r = _make_result()
    mock_rss = MagicMock()
    mock_rss.get_results = AsyncMock(return_value=([r], 1))

    svc = SiftService(mock_motor_db)
    svc.results_service = mock_rss

    records, total = await svc.get_records("sift1")
    assert total == 1
    assert records[0]["confidence"] == 0.95
    assert records[0]["extracted_data"]["client"] == "Acme"


# ── process_documents ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_process_documents_success(mock_motor_db):
    from sifter.services.sift_agent import ExtractionAgentResult

    sift_id = str(ObjectId())
    sift = _make_sift(sift_id=sift_id)
    sift_raw = sift.to_mongo() | {"_id": ObjectId(sift_id)}

    mock_motor_db["sifts"].find_one = AsyncMock(return_value=sift_raw)
    mock_motor_db["sifts"].update_one = AsyncMock()

    agent_result = ExtractionAgentResult(
        document_type="invoice",
        matches_filter=True,
        filter_reason="",
        confidence=0.9,
        extracted_data=[{"client": "Acme", "amount": 100.0}],
    )

    mock_results_service = MagicMock()
    mock_results_service.insert_result = AsyncMock(return_value=_make_result(sift_id))
    mock_results_service.ensure_indexes = AsyncMock()
    mock_results_service.col = mock_motor_db["sift_results"]

    svc = SiftService(mock_motor_db)
    svc.results_service = mock_results_service

    with patch("sifter.services.sift_service.sift_agent.extract", new_callable=AsyncMock) as mock_extract, \
         patch("sifter.storage.get_storage_backend") as mock_storage_factory, \
         patch("sifter.services.webhook_service.WebhookService"):
        mock_extract.return_value = agent_result
        mock_backend = MagicMock()
        mock_backend.load = AsyncMock(return_value=b"file bytes")
        mock_storage_factory.return_value = mock_backend

        await svc.process_documents(sift_id, ["/uploads/doc.pdf"])

    mock_extract.assert_called_once()


@pytest.mark.asyncio
async def test_process_documents_sift_not_found(mock_motor_db):
    mock_motor_db["sifts"].find_one = AsyncMock(return_value=None)
    mock_motor_db["sifts"].update_one = AsyncMock()

    svc = SiftService(mock_motor_db)
    # Should return early without error
    await svc.process_documents(str(ObjectId()), ["/doc.pdf"])


@pytest.mark.asyncio
async def test_process_documents_with_error(mock_motor_db):
    sift_id = str(ObjectId())
    sift = _make_sift(sift_id=sift_id)
    sift_raw = sift.to_mongo() | {"_id": ObjectId(sift_id)}

    mock_motor_db["sifts"].find_one = AsyncMock(return_value=sift_raw)
    mock_motor_db["sifts"].update_one = AsyncMock()

    svc = SiftService(mock_motor_db)
    svc.results_service = MagicMock()
    svc.results_service.insert_result = AsyncMock()
    svc.results_service.col = mock_motor_db["sift_results"]

    with patch("sifter.services.sift_service.sift_agent.extract", new_callable=AsyncMock) as mock_extract, \
         patch("sifter.storage.get_storage_backend") as mock_storage_factory:
        mock_extract.side_effect = Exception("LLM error")
        mock_backend = MagicMock()
        mock_backend.load = AsyncMock(return_value=b"bytes")
        mock_storage_factory.return_value = mock_backend

        await svc.process_documents(sift_id, ["/uploads/doc.pdf"])

    # All failed — update should be called with ERROR status
    calls = mock_motor_db["sifts"].update_one.call_args_list
    assert any(
        call.args[1].get("$set", {}).get("status") == "error"
        for call in calls
    )


# ── mark_document_failed sift not found ──────────────────────────────────────

@pytest.mark.asyncio
async def test_mark_document_failed_sift_not_found(mock_motor_db):
    """If sift is deleted between enqueue and completion, just return without error."""
    mock_motor_db["sifts"].find_one_and_update = AsyncMock(return_value=None)

    svc = SiftService(mock_motor_db)
    svc.results_service = MagicMock()
    svc.results_service.col = mock_motor_db["sift_results"]

    # Should not raise
    await svc.mark_document_failed(str(ObjectId()), "processing failed")


# ── _update_schema_if_changed webhook path ────────────────────────────────────

@pytest.mark.asyncio
async def test_update_schema_if_changed_dispatches_webhook_on_change(mock_motor_db):
    sift_id = str(ObjectId())
    sift = _make_sift(sift_id=sift_id, schema="old_field (string)", schema_fields=[{"name": "old_field", "type": "string"}], schema_version=1)
    sift_raw = sift.to_mongo() | {"_id": ObjectId(sift_id)}

    mock_motor_db["sifts"].update_one = AsyncMock()
    # find_one returns updated doc with new schema
    mock_motor_db["sifts"].find_one = AsyncMock(return_value=sift_raw | {"schema": "new_field (string)", "schema_fields": [{"name": "new_field", "type": "string"}], "schema_version": 2})

    svc = SiftService(mock_motor_db)

    with patch("sifter.services.webhook_service.WebhookService") as mock_wh_cls:
        mock_wh = MagicMock()
        mock_wh.dispatch = AsyncMock()
        mock_wh_cls.return_value = mock_wh

        await svc._update_schema_if_changed(sift, {"new_field": "value"})

    mock_wh.dispatch.assert_called_once()


# ── reindex (lines 362-367) ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reindex_clears_and_reprocesses(mock_motor_db):
    sift_id = str(ObjectId())
    sift = _make_sift(sift_id=sift_id, schema="amount (string)")
    sift_raw = sift.to_mongo() | {"_id": ObjectId(sift_id)}

    mock_motor_db["sifts"].find_one = AsyncMock(return_value=sift_raw)
    mock_motor_db["sifts"].update_one = AsyncMock()
    mock_motor_db["sift_results"].delete_many = AsyncMock(
        return_value=MagicMock(deleted_count=5)
    )

    mock_result = MagicMock()
    mock_result.matches_filter = True
    mock_result.extracted_data = [{"amount": "100"}]
    mock_result.document_type = "invoice"
    mock_result.confidence = 0.9
    mock_result.llm_citations = {}
    mock_result.page_blocks = []

    mock_motor_db["sift_results"].replace_one = AsyncMock(
        return_value=MagicMock(upserted_id=None, modified_count=1)
    )

    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[])
    mock_motor_db["webhooks"].find = MagicMock(return_value=cursor)

    with patch("sifter.services.sift_service.sift_agent.extract", new_callable=AsyncMock, return_value=mock_result), \
         patch("sifter.storage.get_storage_backend") as mock_storage_factory:
        mock_backend = MagicMock()
        mock_backend.load = AsyncMock(return_value=b"bytes")
        mock_storage_factory.return_value = mock_backend

        svc = SiftService(mock_motor_db)
        await svc.reindex(sift_id, ["/uploads/doc.pdf"])

    # delete_by_sift_id was called → results deleted
    mock_motor_db["sift_results"].delete_many.assert_called_once()


# ── _update_schema_if_changed webhook exception (lines 357-358) ──────────────

@pytest.mark.asyncio
async def test_update_schema_webhook_exception_swallowed(mock_motor_db):
    sift_id = str(ObjectId())
    sift = _make_sift(sift_id=sift_id, schema="amount (string)",
                      schema_fields=[{"name": "amount", "type": "string"}], schema_version=1)
    updated_raw = sift.to_mongo() | {
        "_id": ObjectId(sift_id),
        "schema": "total (number)",
        "schema_fields": [{"name": "total", "type": "number"}],
        "schema_version": 2,
    }
    mock_motor_db["sifts"].update_one = AsyncMock()
    mock_motor_db["sifts"].find_one = AsyncMock(return_value=updated_raw)

    svc = SiftService(mock_motor_db)

    # WebhookService.dispatch raises — should be caught without propagating
    with patch("sifter.services.webhook_service.WebhookService") as mock_wh_cls:
        mock_wh = MagicMock()
        mock_wh.dispatch = AsyncMock(side_effect=Exception("webhook failed"))
        mock_wh_cls.return_value = mock_wh

        # Should not raise
        await svc._update_schema_if_changed(sift, {"total": 100})


# ── process_documents partial error (line 205) ───────────────────────────────

@pytest.mark.asyncio
async def test_process_documents_partial_error_sets_error_msg(mock_motor_db):
    """When some but not all documents fail, final_status=ACTIVE with error_msg (line 205)."""
    sift_id = str(ObjectId())
    sift = _make_sift(sift_id=sift_id, schema="amount (string)")
    sift_raw = sift.to_mongo() | {"_id": ObjectId(sift_id)}

    mock_motor_db["sifts"].find_one = AsyncMock(return_value=sift_raw)
    mock_motor_db["sifts"].update_one = AsyncMock()
    mock_motor_db["sift_results"].replace_one = AsyncMock(
        return_value=MagicMock(upserted_id=None, modified_count=1)
    )

    call_count = 0

    async def extract_side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            # First doc succeeds
            r = MagicMock()
            r.matches_filter = True
            r.extracted_data = [{"amount": "100"}]
            r.document_type = "invoice"
            r.confidence = 0.9
            r.llm_citations = {}
            r.page_blocks = []
            return r
        else:
            raise Exception("LLM timeout on second doc")

    mock_motor_db["sift_results"].update_one = AsyncMock(
        return_value=MagicMock(upserted_id=ObjectId(), modified_count=1)
    )
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[])
    mock_motor_db["webhooks"].find = MagicMock(return_value=cursor)

    with patch("sifter.services.sift_service.sift_agent.extract", new_callable=AsyncMock, side_effect=extract_side_effect), \
         patch("sifter.storage.get_storage_backend") as mock_storage_factory:
        mock_backend = MagicMock()
        mock_backend.load = AsyncMock(return_value=b"bytes")
        mock_storage_factory.return_value = mock_backend

        svc = SiftService(mock_motor_db)
        await svc.process_documents(sift_id, ["/doc1.pdf", "/doc2.pdf"])

    # Final update should include an error_msg but status=active
    calls = mock_motor_db["sifts"].update_one.call_args_list
    final_call = calls[-1]
    final_set = final_call.args[1].get("$set", {})
    assert "error" in final_set
    assert final_set["error"] is not None
    # Partial failure: error_msg is set but status is ACTIVE (not error)
    assert final_set.get("status") != "error"


# ── process_documents matches_filter=False (lines 154-162) ───────────────────

@pytest.mark.asyncio
async def test_process_documents_discarded_document(mock_motor_db):
    """Document that does not match filter increments discarded counter (lines 154-162)."""
    sift_id = str(ObjectId())
    sift = _make_sift(sift_id=sift_id, schema=None)
    sift_raw = sift.to_mongo() | {"_id": ObjectId(sift_id)}

    mock_motor_db["sifts"].find_one = AsyncMock(return_value=sift_raw)
    mock_motor_db["sifts"].update_one = AsyncMock()
    mock_motor_db["sift_results"].replace_one = AsyncMock(
        return_value=MagicMock(upserted_id=None, modified_count=0)
    )
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[])
    mock_motor_db["webhooks"].find = MagicMock(return_value=cursor)

    discarded_result = MagicMock()
    discarded_result.matches_filter = False
    discarded_result.filter_reason = "not an invoice"
    discarded_result.extracted_data = []
    discarded_result.document_type = "unknown"
    discarded_result.confidence = 0.0

    with patch("sifter.services.sift_service.sift_agent.extract", new_callable=AsyncMock,
               return_value=discarded_result), \
         patch("sifter.storage.get_storage_backend") as mock_storage_factory:
        mock_backend = MagicMock()
        mock_backend.load = AsyncMock(return_value=b"bytes")
        mock_storage_factory.return_value = mock_backend

        svc = SiftService(mock_motor_db)
        await svc.process_documents(sift_id, ["/doc.pdf"])

    # All documents discarded → final status should be ACTIVE (non-discarded == 0 == errors)
    calls = mock_motor_db["sifts"].update_one.call_args_list
    final_set = calls[-1].args[1]["$set"]
    assert final_set.get("processed_documents") == 0


# ── process_single_document citation resolution failure (lines 265-267) ──────

@pytest.mark.asyncio
async def test_process_single_document_citation_failure(mock_motor_db):
    """citation_resolver raises → logged and citations = {} (lines 265-267)."""
    sift_id = str(ObjectId())
    sift = _make_sift(sift_id=sift_id)
    sift_raw = sift.to_mongo() | {"_id": ObjectId(sift_id)}

    mock_motor_db["sifts"].find_one = AsyncMock(return_value=sift_raw)
    mock_motor_db["sifts"].update_one = AsyncMock()
    mock_motor_db["sift_results"].replace_one = AsyncMock(
        return_value=MagicMock(upserted_id=ObjectId(), modified_count=1)
    )
    mock_motor_db["sift_results"].find_one = AsyncMock(return_value=None)
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[])
    mock_motor_db["webhooks"].find = MagicMock(return_value=cursor)

    extract_result = MagicMock()
    extract_result.matches_filter = True
    extract_result.extracted_data = [{"amount": "100"}]
    extract_result.document_type = "invoice"
    extract_result.confidence = 0.9
    extract_result.llm_citations = {"amount": {"source_text": "100"}}
    extract_result.page_blocks = []

    with patch("sifter.services.sift_service.sift_agent.extract", new_callable=AsyncMock,
               return_value=extract_result), \
         patch("sifter.services.citation_resolver.resolve_citations",
               side_effect=Exception("citation error")):

        svc = SiftService(mock_motor_db)
        results = await svc.process_single_document(sift_id, b"bytes", "invoice.pdf")

    assert len(results) >= 1
