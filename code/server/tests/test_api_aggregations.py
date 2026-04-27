"""
Integration tests for /api/aggregations — covers CRUD, result execution,
regenerate, delete, and all 404/error paths.
"""
import os
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock, patch

os.environ["SIFTER_MONGODB_DATABASE"] = "sifter_test"
os.environ.setdefault("SIFTER_DEFAULT_API_KEY", "test-key")

pytestmark = pytest.mark.asyncio(loop_scope="session")

from sifter.server import app
from sifter.auth import Principal, get_current_principal


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
    for col in ("aggregations", "sifts", "sift_results"):
        await db[col].delete_many({})
    yield


async def _create_sift(client, name="Agg Sift"):
    r = await client.post("/api/sifts", json={"name": name, "instructions": "Extract: amount"})
    assert r.status_code == 200
    return r.json()["id"]


# ── create aggregation ────────────────────────────────────────────────────────

async def test_create_aggregation_sift_not_found(client):
    r = await client.post("/api/aggregations", json={
        "name": "Test Agg",
        "sift_id": "000000000000000000000000",
        "aggregation_query": "total amount by client",
    })
    assert r.status_code == 404


async def test_create_aggregation_success(client):
    sid = await _create_sift(client)
    r = await client.post("/api/aggregations", json={
        "name": "My Agg",
        "sift_id": sid,
        "aggregation_query": "total by client",
    })
    assert r.status_code == 202
    data = r.json()
    assert data["name"] == "My Agg"
    assert data["sift_id"] == sid


# ── list aggregations ─────────────────────────────────────────────────────────

async def test_list_aggregations_all(client):
    r = await client.get("/api/aggregations")
    assert r.status_code == 200
    assert "items" in r.json()


async def test_list_aggregations_by_sift_id(client):
    sid = await _create_sift(client, "List By Sift")
    await client.post("/api/aggregations", json={
        "name": "Agg For Sift",
        "sift_id": sid,
        "aggregation_query": "count",
    })
    r = await client.get("/api/aggregations", params={"sift_id": sid})
    assert r.status_code == 200
    items = r.json()["items"]
    assert any(i["sift_id"] == sid for i in items)


async def test_list_aggregations_sift_not_found(client):
    r = await client.get("/api/aggregations", params={"sift_id": "000000000000000000000000"})
    assert r.status_code == 404


# ── get aggregation ───────────────────────────────────────────────────────────

async def test_get_aggregation_found(client):
    sid = await _create_sift(client, "Get Agg Sift")
    cr = await client.post("/api/aggregations", json={
        "name": "GetMe", "sift_id": sid, "aggregation_query": "total"
    })
    agg_id = cr.json()["id"]
    r = await client.get(f"/api/aggregations/{agg_id}")
    assert r.status_code == 200
    assert r.json()["id"] == agg_id


async def test_get_aggregation_not_found(client):
    r = await client.get("/api/aggregations/000000000000000000000000")
    assert r.status_code == 404


# ── get aggregation result ────────────────────────────────────────────────────

async def test_get_aggregation_result_not_found(client):
    r = await client.get("/api/aggregations/000000000000000000000000/result")
    assert r.status_code == 404


async def test_get_aggregation_result_success(client):
    sid = await _create_sift(client, "Result Agg Sift")
    cr = await client.post("/api/aggregations", json={
        "name": "ResultAgg", "sift_id": sid, "aggregation_query": "total"
    })
    agg_id = cr.json()["id"]

    with patch("sifter.services.aggregation_service.AggregationService.execute",
               new_callable=AsyncMock,
               return_value=([{"_id": "Acme", "total": 100}],
                              [{"$group": {"_id": "$client"}}])):
        r = await client.get(f"/api/aggregations/{agg_id}/result")
    assert r.status_code == 200
    assert "results" in r.json()


async def test_get_aggregation_result_value_error(client):
    sid = await _create_sift(client, "Result VE Sift")
    cr = await client.post("/api/aggregations", json={
        "name": "VEAgg", "sift_id": sid, "aggregation_query": "total"
    })
    agg_id = cr.json()["id"]

    with patch("sifter.services.aggregation_service.AggregationService.execute",
               new_callable=AsyncMock,
               side_effect=ValueError("bad pipeline")):
        r = await client.get(f"/api/aggregations/{agg_id}/result")
    assert r.status_code == 400


async def test_get_aggregation_result_server_error(client):
    sid = await _create_sift(client, "Result SE Sift")
    cr = await client.post("/api/aggregations", json={
        "name": "SEAgg", "sift_id": sid, "aggregation_query": "total"
    })
    agg_id = cr.json()["id"]

    with patch("sifter.services.aggregation_service.AggregationService.execute",
               new_callable=AsyncMock,
               side_effect=Exception("DB error")):
        r = await client.get(f"/api/aggregations/{agg_id}/result")
    assert r.status_code == 500


# ── regenerate aggregation ────────────────────────────────────────────────────

async def test_regenerate_aggregation_not_found(client):
    r = await client.post("/api/aggregations/000000000000000000000000/regenerate")
    assert r.status_code == 404


async def test_regenerate_aggregation_success(client):
    sid = await _create_sift(client, "Regen Sift")
    cr = await client.post("/api/aggregations", json={
        "name": "RegenAgg", "sift_id": sid, "aggregation_query": "total"
    })
    agg_id = cr.json()["id"]
    from sifter.models.aggregation import Aggregation
    from datetime import datetime, timezone
    mock_agg = Aggregation(
        _id=agg_id,
        name="RegenAgg",
        sift_id=sid,
        aggregation_query="total",
        pipeline=[],
        status="ready",
    )

    with patch("sifter.services.aggregation_service.AggregationService.regenerate",
               new_callable=AsyncMock,
               return_value=mock_agg):
        r = await client.post(f"/api/aggregations/{agg_id}/regenerate")
    assert r.status_code == 200


async def test_regenerate_aggregation_value_error(client):
    sid = await _create_sift(client, "Regen VE Sift")
    cr = await client.post("/api/aggregations", json={
        "name": "RegenVE", "sift_id": sid, "aggregation_query": "total"
    })
    agg_id = cr.json()["id"]

    with patch("sifter.services.aggregation_service.AggregationService.regenerate",
               new_callable=AsyncMock,
               side_effect=ValueError("sift not found")):
        r = await client.post(f"/api/aggregations/{agg_id}/regenerate")
    assert r.status_code == 404


# ── delete aggregation ────────────────────────────────────────────────────────

async def test_delete_aggregation_success(client):
    sid = await _create_sift(client, "Delete Agg Sift")
    cr = await client.post("/api/aggregations", json={
        "name": "DeleteMe", "sift_id": sid, "aggregation_query": "total"
    })
    agg_id = cr.json()["id"]
    r = await client.delete(f"/api/aggregations/{agg_id}")
    assert r.status_code == 200
    assert r.json()["deleted"] is True


async def test_delete_aggregation_not_found(client):
    r = await client.delete("/api/aggregations/000000000000000000000000")
    assert r.status_code == 404
