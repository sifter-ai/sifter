"""
Integration tests for the FastAPI REST API.
Runs against a real MongoDB test database (sifter_test).
Requires MongoDB running at localhost:27017.
"""

import asyncio
import os
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock, patch

# Use a test database
os.environ["SIFTER_MONGODB_DATABASE"] = "sifter_test"
os.environ.setdefault("SIFTER_LLM_API_KEY", "test-key")

# All tests in this module share the session event loop
pytestmark = pytest.mark.asyncio(loop_scope="session")

from sifter.server import app
from sifter.auth import Principal, get_current_principal

async def _mock_principal() -> Principal:
    return Principal(key_id="bootstrap")


# Override auth for all tests
app.dependency_overrides[get_current_principal] = _mock_principal


@pytest_asyncio.fixture(scope="session")
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture(autouse=True, loop_scope="session")
async def clean_db(client):
    """Wipe test collections before each test."""
    from sifter.db import get_db
    db = get_db()
    for col in ("sifts", "sift_results", "aggregations",
                "folders", "documents", "folder_extractors",
                "document_sift_statuses", "webhooks"):
        await db[col].delete_many({})
    yield


# ---- Health ----

async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ---- Extractions CRUD ----

async def test_create_extraction(client):
    r = await client.post("/api/sifts", json={
        "name": "Test Invoices",
        "description": "Integration test",
        "instructions": "Extract: client, date, amount",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Test Invoices"
    assert data["status"] == "active"
    assert "id" in data
    assert data["id"]


async def test_create_extraction_missing_instructions(client):
    r = await client.post("/api/sifts", json={"name": "Test"})
    assert r.status_code == 422


async def test_list_extractions_empty(client):
    r = await client.get("/api/sifts")
    assert r.status_code == 200
    assert r.json()["items"] == []


async def test_list_extractions(client):
    for i in range(3):
        await client.post("/api/sifts", json={
            "name": f"Extraction {i}",
            "instructions": "Extract: x",
        })
    r = await client.get("/api/sifts")
    assert r.status_code == 200
    assert len(r.json()["items"]) == 3


async def test_get_extraction(client):
    r = await client.post("/api/sifts", json={
        "name": "Fetch Me",
        "instructions": "Extract: x",
    })
    eid = r.json()["id"]

    r2 = await client.get(f"/api/sifts/{eid}")
    assert r2.status_code == 200
    assert r2.json()["id"] == eid
    assert r2.json()["name"] == "Fetch Me"


async def test_get_extraction_not_found(client):
    r = await client.get("/api/sifts/000000000000000000000000")
    assert r.status_code == 404


async def test_delete_extraction(client):
    r = await client.post("/api/sifts", json={
        "name": "Delete Me",
        "instructions": "Extract: x",
    })
    eid = r.json()["id"]

    r2 = await client.delete(f"/api/sifts/{eid}")
    assert r2.status_code == 200
    assert r2.json()["deleted"] is True

    r3 = await client.get(f"/api/sifts/{eid}")
    assert r3.status_code == 404


async def test_reset_extraction(client):
    r = await client.post("/api/sifts", json={
        "name": "Reset Me",
        "instructions": "Extract: x",
    })
    eid = r.json()["id"]

    r2 = await client.post(f"/api/sifts/{eid}/reset")
    assert r2.status_code == 200
    assert r2.json()["error"] is None


# ---- Records ----

async def test_get_records_empty(client):
    r = await client.post("/api/sifts", json={
        "name": "Empty",
        "instructions": "Extract: x",
    })
    eid = r.json()["id"]

    r2 = await client.get(f"/api/sifts/{eid}/records")
    assert r2.status_code == 200
    assert r2.json()["items"] == []


async def _insert_records(extraction_id, records):
    import uuid
    from sifter.db import get_db
    from sifter.services.sift_results import SiftResultsService
    svc = SiftResultsService(get_db())
    await svc.ensure_indexes()
    for filename, doc_type, conf, data in records:
        await svc.insert_result(extraction_id, str(uuid.uuid4()), filename, doc_type, conf, data)


async def test_get_records_with_data(client):
    r = await client.post("/api/sifts", json={
        "name": "With Data",
        "instructions": "Extract: client, amount",
    })
    eid = r.json()["id"]

    await _insert_records(eid, [
        ("invoice.pdf", "invoice", 0.95, {"client": "Acme Corp", "amount": 1500.0}),
        ("invoice2.pdf", "invoice", 0.88, {"client": "Globex", "amount": 2000.0}),
    ])

    r2 = await client.get(f"/api/sifts/{eid}/records")
    assert r2.status_code == 200
    records = r2.json()["items"]
    assert len(records) == 2
    clients = {rec["extracted_data"]["client"] for rec in records}
    assert clients == {"Acme Corp", "Globex"}


# ---- CSV Export ----

async def test_export_csv_with_data(client):
    r = await client.post("/api/sifts", json={
        "name": "CSV Test",
        "instructions": "Extract: client, amount",
    })
    eid = r.json()["id"]

    await _insert_records(eid, [
        ("doc1.pdf", "invoice", 0.9, {"client": "Acme", "amount": 100.0}),
        ("doc2.pdf", "invoice", 0.8, {"client": "Globex", "amount": 200.0}),
    ])

    r2 = await client.get(f"/api/sifts/{eid}/records/csv")
    assert r2.status_code == 200
    assert "text/csv" in r2.headers["content-type"]
    csv_text = r2.text
    assert "client" in csv_text
    assert "Acme" in csv_text
    assert "200.0" in csv_text


# ---- Live Query ----

async def test_live_query(client):
    r = await client.post("/api/sifts", json={
        "name": "Query Test",
        "instructions": "Extract: client, amount",
    })
    eid = r.json()["id"]

    await _insert_records(eid, [
        ("x.pdf", "invoice", 0.9, {"client": "TestCorp", "amount": 999.0}),
        ("y.pdf", "invoice", 0.9, {"client": "TestCorp", "amount": 1.0}),
    ])

    pipeline_json = '[{"$group": {"_id": null, "total": {"$sum": "$extracted_data.amount"}}}]'
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = pipeline_json

    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        r2 = await client.post(f"/api/sifts/{eid}/query", json={"query": "total amount"})

    assert r2.status_code == 200
    data = r2.json()
    assert data["results"][0]["total"] == 1000.0


# ---- Aggregations ----

async def test_create_and_list_aggregation(client):
    r = await client.post("/api/sifts", json={
        "name": "Agg Test",
        "instructions": "Extract: client, amount",
    })
    eid = r.json()["id"]

    pipeline_json = '[{"$count": "total"}]'
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = pipeline_json

    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        r2 = await client.post("/api/aggregations", json={
            "name": "Count All",
            "sift_id": eid,
            "aggregation_query": "count all documents",
        })
        # Let the background task run while mock is still active
        await asyncio.sleep(0.1)

    assert r2.status_code == 202
    agg = r2.json()
    assert agg["name"] == "Count All"
    assert agg["sift_id"] == eid

    # List
    r3 = await client.get(f"/api/aggregations?sift_id={eid}")
    assert r3.status_code == 200
    assert len(r3.json()["items"]) == 1


async def test_aggregation_execute(client):
    r = await client.post("/api/sifts", json={
        "name": "Exec Test",
        "instructions": "Extract: client, amount",
    })
    eid = r.json()["id"]

    await _insert_records(eid, [
        ("a.pdf", "invoice", 0.9, {"client": "Acme", "amount": 100.0}),
        ("b.pdf", "invoice", 0.9, {"client": "Acme", "amount": 200.0}),
    ])

    pipeline_json = '[{"$group": {"_id": "$extracted_data.client", "total": {"$sum": "$extracted_data.amount"}}}]'
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = pipeline_json

    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        r2 = await client.post("/api/aggregations", json={
            "name": "Total by Client",
            "sift_id": eid,
            "aggregation_query": "total by client",
        })
        # Let the background pipeline generation task run while mock is still active
        await asyncio.sleep(0.1)

    agg_id = r2.json()["id"]

    r3 = await client.get(f"/api/aggregations/{agg_id}/result")
    assert r3.status_code == 200
    results = r3.json()["results"]
    assert len(results) == 1
    assert results[0]["_id"] == "Acme"
    assert results[0]["total"] == 300.0


async def test_delete_aggregation(client):
    r = await client.post("/api/sifts", json={
        "name": "Del Agg",
        "instructions": "Extract: x",
    })
    eid = r.json()["id"]

    pipeline_json = '[{"$count": "total"}]'
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = pipeline_json

    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        r2 = await client.post("/api/aggregations", json={
            "name": "To Delete",
            "sift_id": eid,
            "aggregation_query": "count",
        })

    agg_id = r2.json()["id"]
    r3 = await client.delete(f"/api/aggregations/{agg_id}")
    assert r3.status_code == 200
    assert r3.json()["deleted"] is True

    r4 = await client.get(f"/api/aggregations/{agg_id}")
    assert r4.status_code == 404


# ---- Chat ----

async def test_chat_plain_response(client):
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = (
        '{"response": "I can help you analyze your documents!", "data": null}'
    )
    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        r = await client.post("/api/chat", json={"message": "Hello!"})

    assert r.status_code == 200
    data = r.json()
    assert "I can help" in data["response"]
    assert data["data"] is None


async def test_chat_with_extraction_context(client):
    r = await client.post("/api/sifts", json={
        "name": "Invoice Set",
        "instructions": "Extract: client, amount",
    })
    eid = r.json()["id"]

    await _insert_records(eid, [
        ("doc.pdf", "invoice", 0.9, {"client": "Acme", "amount": 500.0}),
    ])

    mock_chat_response = MagicMock()
    mock_chat_response.choices = [MagicMock()]
    mock_chat_response.choices[0].message.content = (
        '{"response": "Total is 500.", "data": [{"total": 500.0}]}'
    )

    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_chat_response
        r2 = await client.post("/api/chat", json={
            "message": "What is the total amount?",
            "sift_id": eid,
        })

    assert r2.status_code == 200
    data = r2.json()
    assert "500" in data["response"]
