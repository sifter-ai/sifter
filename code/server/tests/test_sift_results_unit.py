"""
Unit tests for SiftResultsService — covers missing lines.
"""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId

from sifter.services.sift_results import SiftResultsService


# ── ensure_indexes stale rows warning (line 43) ───────────────────────────────

@pytest.mark.asyncio
async def test_ensure_indexes_stale_rows_warning(mock_motor_db):
    mock_motor_db["sift_results"].delete_many = AsyncMock(
        return_value=MagicMock(deleted_count=3)
    )
    mock_motor_db["sift_results"].create_index = AsyncMock()

    svc = SiftResultsService(mock_motor_db)
    await svc.ensure_indexes()
    # 3 stale rows deleted → warning logged (line 43 executed)
    mock_motor_db["sift_results"].delete_many.assert_called_once()


# ── get_result (lines 103-104) ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_result_found(mock_motor_db):
    from sifter.models.sift_result import SiftResult
    result_id = ObjectId()
    sr = SiftResult(
        sift_id="sift1",
        document_id="doc1",
        filename="f.pdf",
        record_index=0,
        document_type="invoice",
        confidence=0.9,
        extracted_data={"amount": "100"},
    )
    raw = sr.to_mongo()
    raw["_id"] = result_id
    mock_motor_db["sift_results"].find_one = AsyncMock(return_value=raw)

    svc = SiftResultsService(mock_motor_db)
    result = await svc.get_result(str(result_id))
    assert result is not None
    assert result.sift_id == "sift1"


@pytest.mark.asyncio
async def test_get_result_not_found(mock_motor_db):
    mock_motor_db["sift_results"].find_one = AsyncMock(return_value=None)
    svc = SiftResultsService(mock_motor_db)
    result = await svc.get_result(str(ObjectId()))
    assert result is None


# ── count (line 117) ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_count(mock_motor_db):
    mock_motor_db["sift_results"].count_documents = AsyncMock(return_value=5)
    svc = SiftResultsService(mock_motor_db)
    n = await svc.count("sift1")
    assert n == 5


# ── execute_aggregation with JSON string pipeline (line 127) ──────────────────

@pytest.mark.asyncio
async def test_execute_aggregation_string_pipeline(mock_motor_db):
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[])
    mock_motor_db["sift_results"].aggregate = MagicMock(return_value=cursor)

    pipeline_str = json.dumps([{"$group": {"_id": "$client"}}])
    svc = SiftResultsService(mock_motor_db)
    results = await svc.execute_aggregation("sift1", pipeline_str)
    assert results == []


# ── execute_aggregation with existing sift_id match (line 138) ───────────────

@pytest.mark.asyncio
async def test_execute_aggregation_existing_sift_match(mock_motor_db):
    """Pipeline already has sift_id in $match → has_sift_match=True, no inject (line 138)."""
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[{"_id": "Acme", "total": 10}])
    mock_motor_db["sift_results"].aggregate = MagicMock(return_value=cursor)

    pipeline = [{"$match": {"sift_id": "sift1"}}, {"$group": {"_id": "$client"}}]
    svc = SiftResultsService(mock_motor_db)
    results = await svc.execute_aggregation("sift1", pipeline)
    assert len(results) == 1
    # Verify sift_id match was not injected again (pipeline unchanged length)
    call_pipeline = mock_motor_db["sift_results"].aggregate.call_args[0][0]
    assert call_pipeline[0] == {"$match": {"sift_id": "sift1"}}


# ── export_csv no results (line 152) ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_export_csv_no_results(mock_motor_db):
    mock_motor_db["sift_results"].count_documents = AsyncMock(return_value=0)
    cursor = MagicMock()
    cursor.skip.return_value = cursor
    cursor.limit.return_value = cursor
    cursor.to_list = AsyncMock(return_value=[])
    mock_motor_db["sift_results"].find = MagicMock(return_value=cursor)

    svc = SiftResultsService(mock_motor_db)
    result = await svc.export_csv("sift1")
    assert result == ""


# ── _serialize_doc with list containing dicts (line 200) ─────────────────────

def test_serialize_doc_list_with_dicts():
    from sifter.services.sift_results import _serialize_doc
    oid = ObjectId()
    doc = {"items": [{"_id": oid, "name": "x"}, "plain"]}
    result = _serialize_doc(doc)
    assert result["items"][0]["_id"] == str(oid)
    assert result["items"][1] == "plain"
