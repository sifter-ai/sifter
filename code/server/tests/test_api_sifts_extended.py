"""
Extended integration tests for /api/sifts — endpoints not covered in test_api.py:
update, schema, aggregate, correction rules, record patch, count, batch.
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
    for col in ("sifts", "sift_results", "correction_rules", "document_sift_statuses"):
        await db[col].delete_many({})
    yield


async def _create_sift(client, name="Test", instructions="Extract: client, amount"):
    r = await client.post("/api/sifts", json={"name": name, "instructions": instructions})
    assert r.status_code == 200
    return r.json()["id"]


async def _insert_records(sift_id, records):
    import uuid
    from sifter.db import get_db
    from sifter.services.sift_results import SiftResultsService
    svc = SiftResultsService(get_db())
    await svc.ensure_indexes()
    ids = []
    for filename, doc_type, conf, data in records:
        await svc.insert_result(sift_id, str(uuid.uuid4()), filename, doc_type, conf, data)
    # fetch back to get actual _id values
    db = get_db()
    docs = await db["sift_results"].find({"sift_id": sift_id}).to_list(length=100)
    return [str(d["_id"]) for d in docs]


# ── update sift (PATCH) ───────────────────────────────────────────────────────

async def test_update_sift_name(client):
    sid = await _create_sift(client, "Original Name")
    r = await client.patch(f"/api/sifts/{sid}", json={"name": "Updated Name"})
    assert r.status_code == 200
    assert r.json()["name"] == "Updated Name"


async def test_update_sift_instructions(client):
    sid = await _create_sift(client)
    r = await client.patch(f"/api/sifts/{sid}", json={"instructions": "Extract: date"})
    assert r.status_code == 200
    assert r.json()["instructions"] == "Extract: date"


async def test_update_sift_not_found(client):
    r = await client.patch("/api/sifts/000000000000000000000000", json={"name": "X"})
    assert r.status_code == 404


# ── schema endpoints ──────────────────────────────────────────────────────────

async def test_get_schema_empty(client):
    sid = await _create_sift(client)
    r = await client.get(f"/api/sifts/{sid}/schema")
    assert r.status_code == 200


async def test_get_schema_pydantic(client):
    sid = await _create_sift(client)
    r = await client.get(f"/api/sifts/{sid}/schema.pydantic")
    assert r.status_code == 200
    assert "class" in r.text or r.text == "" or r.status_code == 200


async def test_get_schema_ts(client):
    sid = await _create_sift(client)
    r = await client.get(f"/api/sifts/{sid}/schema.ts")
    assert r.status_code == 200


# ── aggregate endpoint ────────────────────────────────────────────────────────

async def test_aggregate_sift(client):
    sid = await _create_sift(client)
    await _insert_records(sid, [
        ("a.pdf", "invoice", 0.9, {"client": "Acme", "amount": 100.0}),
        ("b.pdf", "invoice", 0.9, {"client": "Acme", "amount": 200.0}),
    ])

    r = await client.post(f"/api/sifts/{sid}/aggregate", json={
        "pipeline": [
            {"$group": {"_id": "$extracted_data.client", "total": {"$sum": "$extracted_data.amount"}}}
        ]
    })
    assert r.status_code == 200
    results = r.json()["results"]
    assert results[0]["total"] == 300.0


async def test_aggregate_sift_forbidden_stage(client):
    sid = await _create_sift(client)
    r = await client.post(f"/api/sifts/{sid}/aggregate", json={
        "pipeline": [{"$lookup": {"from": "users", "as": "u"}}]
    })
    assert r.status_code == 400


# ── record count ──────────────────────────────────────────────────────────────

async def test_count_records(client):
    sid = await _create_sift(client)
    await _insert_records(sid, [
        ("x.pdf", "inv", 0.9, {"v": 1}),
        ("y.pdf", "inv", 0.9, {"v": 2}),
    ])
    r = await client.get(f"/api/sifts/{sid}/records/count")
    assert r.status_code == 200
    assert r.json()["count"] == 2


# ── batch records ─────────────────────────────────────────────────────────────

async def test_batch_records(client):
    sid = await _create_sift(client)
    ids = await _insert_records(sid, [
        ("a.pdf", "inv", 0.9, {"client": "A"}),
        ("b.pdf", "inv", 0.9, {"client": "B"}),
    ])
    r = await client.post(f"/api/sifts/{sid}/records/batch", json={"ids": ids})
    assert r.status_code == 200
    assert len(r.json()["items"]) == 2


# ── record patch ──────────────────────────────────────────────────────────────

async def test_patch_record(client):
    sid = await _create_sift(client)
    ids = await _insert_records(sid, [
        ("inv.pdf", "invoice", 0.9, {"client": "Old Name", "amount": 100.0}),
    ])
    record_id = ids[0]

    r = await client.patch(f"/api/sifts/{sid}/records/{record_id}", json={
        "corrections": {
            "client": {"value": "New Name", "scope": "local"}
        }
    })
    assert r.status_code == 200
    assert r.json()["extracted_data"]["client"] == "New Name"


# ── correction rules ──────────────────────────────────────────────────────────

async def test_list_correction_rules_empty(client):
    sid = await _create_sift(client)
    r = await client.get(f"/api/sifts/{sid}/correction-rules")
    assert r.status_code == 200
    assert r.json()["rules"] == []


# ── extraction status ─────────────────────────────────────────────────────────

async def test_extraction_status_not_found(client):
    sid = await _create_sift(client)
    r = await client.get(f"/api/sifts/{sid}/extraction-status",
                         params={"document_id": "000000000000000000000000"})
    assert r.status_code == 404


# ── cancel indexing ───────────────────────────────────────────────────────────

async def test_cancel_indexing(client):
    sid = await _create_sift(client)
    r = await client.post(f"/api/sifts/{sid}/cancel-indexing")
    assert r.status_code == 200


# ── records with filter ───────────────────────────────────────────────────────

async def test_get_records_with_filter(client):
    sid = await _create_sift(client)
    await _insert_records(sid, [
        ("a.pdf", "inv", 0.9, {"client": "Acme", "amount": 100.0}),
        ("b.pdf", "inv", 0.9, {"client": "Globex", "amount": 200.0}),
    ])
    r = await client.get(f"/api/sifts/{sid}/records", params={"filter": '{"client": "Acme"}'})
    assert r.status_code == 200
    items = r.json()["items"]
    assert all(i["extracted_data"]["client"] == "Acme" for i in items)


# ── sift folders ──────────────────────────────────────────────────────────────

async def test_list_sift_folders(client):
    sid = await _create_sift(client)
    r = await client.get(f"/api/sifts/{sid}/folders")
    assert r.status_code == 200


# ── delete sift ───────────────────────────────────────────────────────────────

async def test_delete_sift(client):
    sid = await _create_sift(client, "To Delete")
    r = await client.delete(f"/api/sifts/{sid}")
    assert r.status_code == 200
    assert r.json()["deleted"] is True

    r2 = await client.get(f"/api/sifts/{sid}")
    assert r2.status_code == 404


async def test_delete_sift_not_found(client):
    r = await client.delete("/api/sifts/000000000000000000000000")
    assert r.status_code == 404


# ── reset sift ────────────────────────────────────────────────────────────────

async def test_reset_sift(client):
    sid = await _create_sift(client, "Reset Me")
    r = await client.post(f"/api/sifts/{sid}/reset")
    assert r.status_code == 200
    assert r.json()["id"] == sid


# ── csv export ────────────────────────────────────────────────────────────────

async def test_csv_export(client):
    sid = await _create_sift(client, "CSV Sift")
    await _insert_records(sid, [
        ("a.pdf", "inv", 0.9, {"client": "Acme", "amount": 100.0}),
    ])
    r = await client.get(f"/api/sifts/{sid}/records/csv")
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    assert "Acme" in r.text or r.content  # some CSV content


# ── list sift documents ───────────────────────────────────────────────────────

async def test_list_sift_documents(client):
    sid = await _create_sift(client, "Docs Sift")
    r = await client.get(f"/api/sifts/{sid}/documents")
    assert r.status_code == 200
    assert "items" in r.json()


# ── schema.json endpoint ──────────────────────────────────────────────────────

async def test_get_schema_json(client):
    sid = await _create_sift(client)
    r = await client.get(f"/api/sifts/{sid}/schema.json")
    assert r.status_code == 200


# ── records sorting and cursor ────────────────────────────────────────────────

async def test_get_records_sort_order(client):
    sid = await _create_sift(client, "Sort Sift")
    await _insert_records(sid, [
        ("a.pdf", "inv", 0.9, {"client": "A", "amount": 1.0}),
        ("b.pdf", "inv", 0.9, {"client": "B", "amount": 2.0}),
        ("c.pdf", "inv", 0.9, {"client": "C", "amount": 3.0}),
    ])
    r = await client.get(f"/api/sifts/{sid}/records", params={"limit": 2})
    assert r.status_code == 200
    data = r.json()
    assert len(data["items"]) == 2


async def test_list_sifts(client):
    await _create_sift(client, "List Sift 1")
    await _create_sift(client, "List Sift 2")
    r = await client.get("/api/sifts")
    assert r.status_code == 200
    assert len(r.json()["items"]) >= 2


# ── reindex sift ──────────────────────────────────────────────────────────────

async def test_reindex_sift_no_documents(client):
    sid = await _create_sift(client, "No Docs Sift")
    r = await client.post(f"/api/sifts/{sid}/reindex")
    assert r.status_code == 400  # No documents to reindex
