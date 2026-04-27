"""
Unit tests for AggregationService — covers execute() error branches and regenerate().
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId

from sifter.services.aggregation_service import AggregationService
from sifter.models.aggregation import Aggregation, AggregationStatus


def _make_aggregation(status=AggregationStatus.READY, pipeline=None, error=None):
    agg = Aggregation(
        name="Test", description="", sift_id="sift1",
        aggregation_query="total by client",
        status=status,
        pipeline=pipeline or [],
        aggregation_error=error,
    )
    agg.id = str(ObjectId())
    return agg


# ── execute() error branches (lines 117, 119, 121, 123) ──────────────────────

@pytest.mark.asyncio
async def test_execute_not_found_raises(mock_motor_db):
    mock_motor_db["aggregations"].find_one = AsyncMock(return_value=None)
    svc = AggregationService(mock_motor_db)
    with pytest.raises(ValueError, match="not found"):
        await svc.execute(str(ObjectId()))


@pytest.mark.asyncio
async def test_execute_error_status_raises(mock_motor_db):
    agg = _make_aggregation(status=AggregationStatus.ERROR, error="bad pipeline")
    raw = agg.to_mongo()
    raw["_id"] = ObjectId(agg.id)
    mock_motor_db["aggregations"].find_one = AsyncMock(return_value=raw)

    svc = AggregationService(mock_motor_db)
    with pytest.raises(ValueError, match="error state"):
        await svc.execute(agg.id)


@pytest.mark.asyncio
async def test_execute_generating_status_raises(mock_motor_db):
    agg = _make_aggregation(status=AggregationStatus.GENERATING)
    raw = agg.to_mongo()
    raw["_id"] = ObjectId(agg.id)
    mock_motor_db["aggregations"].find_one = AsyncMock(return_value=raw)

    svc = AggregationService(mock_motor_db)
    with pytest.raises(ValueError, match="still being generated"):
        await svc.execute(agg.id)


@pytest.mark.asyncio
async def test_execute_no_pipeline_raises(mock_motor_db):
    agg = _make_aggregation(status=AggregationStatus.READY, pipeline=[])
    raw = agg.to_mongo()
    raw["_id"] = ObjectId(agg.id)
    mock_motor_db["aggregations"].find_one = AsyncMock(return_value=raw)

    svc = AggregationService(mock_motor_db)
    with pytest.raises(ValueError, match="not yet generated"):
        await svc.execute(agg.id)


@pytest.mark.asyncio
async def test_execute_success(mock_motor_db):
    agg = _make_aggregation(status=AggregationStatus.READY, pipeline=[{"$match": {}}])
    raw = agg.to_mongo()
    raw["_id"] = ObjectId(agg.id)
    mock_motor_db["aggregations"].find_one = AsyncMock(return_value=raw)
    mock_motor_db["aggregations"].update_one = AsyncMock()

    with patch(
        "sifter.services.aggregation_service.SiftResultsService.execute_aggregation",
        new_callable=AsyncMock,
        return_value=[{"_id": "Acme", "total": 100}],
    ):
        svc = AggregationService(mock_motor_db)
        results, pipeline = await svc.execute(agg.id)

    assert len(results) == 1
    assert pipeline == [{"$match": {}}]


# ── regenerate() body (lines 134-149) ────────────────────────────────────────

@pytest.mark.asyncio
async def test_regenerate_not_found_raises(mock_motor_db):
    mock_motor_db["aggregations"].find_one = AsyncMock(return_value=None)
    svc = AggregationService(mock_motor_db)
    with pytest.raises(ValueError, match="not found"):
        await svc.regenerate(str(ObjectId()))


@pytest.mark.asyncio
async def test_regenerate_success_creates_task(mock_motor_db):
    agg = _make_aggregation(status=AggregationStatus.READY, pipeline=[{"$match": {}}])
    raw = agg.to_mongo()
    raw["_id"] = ObjectId(agg.id)

    call_count = 0

    async def find_one_side_effect(q, *args, **kwargs):
        nonlocal call_count
        call_count += 1
        return raw

    mock_motor_db["aggregations"].find_one = AsyncMock(side_effect=find_one_side_effect)
    mock_motor_db["aggregations"].update_one = AsyncMock()

    # Patch _generate_and_store_pipeline so create_task doesn't fail
    with patch.object(AggregationService, "_generate_and_store_pipeline", new_callable=AsyncMock):
        svc = AggregationService(mock_motor_db)
        result = await svc.regenerate(agg.id)

    assert result is not None
