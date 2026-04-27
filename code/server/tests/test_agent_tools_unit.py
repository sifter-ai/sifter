"""
Unit tests for agent_tools — _make_preview and AgentToolRunner._dispatch.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from sifter.services.agent_tools import AgentToolRunner, _make_preview


# ── _make_preview ─────────────────────────────────────────────────────────────

def test_make_preview_list():
    assert _make_preview("list_sifts", [1, 2, 3]) == "3 items"


def test_make_preview_empty_list():
    assert _make_preview("list_sifts", []) == "0 items"


def test_make_preview_dict_with_error():
    assert _make_preview("get_sift", {"error": "not found"}) == "error: not found"


def test_make_preview_dict_with_count():
    assert _make_preview("aggregate_sift", {"count": 42, "results": []}) == "42 results"


def test_make_preview_dict_with_total():
    assert _make_preview("list_records", {"total": 10, "records": []}) == "10 records"


def test_make_preview_dict_generic_keys():
    result = _make_preview("get_sift", {"id": "s1", "name": "Invoices", "status": "active"})
    assert "id" in result


def test_make_preview_string():
    result = _make_preview("unknown", "some plain string")
    assert result == "some plain string"


def test_make_preview_string_truncated():
    long_str = "x" * 200
    result = _make_preview("unknown", long_str)
    assert len(result) <= 80


# ── AgentToolRunner._dispatch ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_dispatch_list_sifts(mock_motor_db):
    from sifter.models.sift import Sift, SiftStatus
    sift = Sift(
        _id=None,
        name="Invoices",
        instructions="Extract client",
        status=SiftStatus.ACTIVE,
        org_id="default",
    )
    runner = AgentToolRunner(mock_motor_db)
    runner.sift_svc = MagicMock()
    runner.sift_svc.list_all = AsyncMock(return_value=([sift], 1))

    result = await runner._dispatch("list_sifts", {})
    assert isinstance(result, list)
    assert result[0]["name"] == "Invoices"


@pytest.mark.asyncio
async def test_dispatch_get_sift_found(mock_motor_db):
    from sifter.models.sift import Sift, SiftStatus
    sift = Sift(
        _id="sift1",
        name="Invoices",
        instructions="Extract client",
        status=SiftStatus.ACTIVE,
        org_id="default",
    )
    runner = AgentToolRunner(mock_motor_db)
    runner.sift_svc = MagicMock()
    runner.sift_svc.get = AsyncMock(return_value=sift)
    runner.results_svc = MagicMock()
    runner.results_svc.count = AsyncMock(return_value=5)

    result = await runner._dispatch("get_sift", {"sift_id": "sift1"})
    assert result["name"] == "Invoices"
    assert result["record_count"] == 5


@pytest.mark.asyncio
async def test_dispatch_get_sift_not_found(mock_motor_db):
    runner = AgentToolRunner(mock_motor_db)
    runner.sift_svc = MagicMock()
    runner.sift_svc.get = AsyncMock(return_value=None)

    result = await runner._dispatch("get_sift", {"sift_id": "missing"})
    assert "error" in result


@pytest.mark.asyncio
async def test_dispatch_list_records(mock_motor_db):
    from sifter.models.sift_result import SiftResult
    r = SiftResult(
        sift_id="sift1",
        document_id="doc1",
        filename="invoice.pdf",
        document_type="invoice",
        confidence=0.95,
        extracted_data={"client": "Acme"},
    )
    runner = AgentToolRunner(mock_motor_db)
    runner.results_svc = MagicMock()
    runner.results_svc.get_results = AsyncMock(return_value=([r], 1))

    result = await runner._dispatch("list_records", {"sift_id": "sift1"})
    assert result["total"] == 1
    assert len(result["records"]) == 1


@pytest.mark.asyncio
async def test_dispatch_aggregate_sift(mock_motor_db):
    runner = AgentToolRunner(mock_motor_db)
    runner.results_svc = MagicMock()
    runner.results_svc.execute_aggregation = AsyncMock(return_value=[{"total": 100}])

    pipeline = [{"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    result = await runner._dispatch("aggregate_sift", {"sift_id": "sift1", "pipeline": pipeline})
    assert result["count"] == 1
    assert result["results"][0]["total"] == 100


@pytest.mark.asyncio
async def test_dispatch_aggregate_sift_missing_pipeline(mock_motor_db):
    runner = AgentToolRunner(mock_motor_db)
    result = await runner._dispatch("aggregate_sift", {"sift_id": "sift1"})
    assert "error" in result


@pytest.mark.asyncio
async def test_dispatch_find_records(mock_motor_db):
    runner = AgentToolRunner(mock_motor_db)
    runner.results_svc = MagicMock()
    runner.results_svc.execute_aggregation = AsyncMock(return_value=[{"client": "Acme"}])

    result = await runner._dispatch("find_records", {"sift_id": "sift1", "filter": {"client": "Acme"}})
    assert result["count"] == 1


@pytest.mark.asyncio
async def test_dispatch_unknown_tool(mock_motor_db):
    runner = AgentToolRunner(mock_motor_db)
    with pytest.raises(ValueError, match="Unknown tool"):
        await runner._dispatch("nonexistent_tool", {})
