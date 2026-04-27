"""
Unit tests for schema_service — pure functions, no mocks needed.
"""
import pytest

from sifter.models.sift import Sift, SiftStatus
from sifter.services.schema_service import (
    emit_json_schema,
    emit_pydantic,
    emit_typescript,
    infer_schema_fields,
)


def _make_sift(name: str, fields: list[dict]) -> Sift:
    return Sift(
        name=name,
        instructions="test",
        schema_fields=fields,
        status=SiftStatus.ACTIVE,
    )


# ── emit_pydantic ─────────────────────────────────────────────────────────────

def test_emit_pydantic_empty_fields():
    sift = _make_sift("Empty", [])
    out = emit_pydantic(sift)
    assert "class Empty(BaseModel):" in out
    assert "pass" in out


def test_emit_pydantic_string_field():
    sift = _make_sift("Invoice", [{"name": "client", "type": "string"}])
    out = emit_pydantic(sift)
    assert "client: Optional[str] = None" in out


def test_emit_pydantic_number_and_integer():
    sift = _make_sift("Doc", [
        {"name": "amount", "type": "number"},
        {"name": "count", "type": "integer"},
    ])
    out = emit_pydantic(sift)
    assert "amount: Optional[float] = None" in out
    assert "count: Optional[int] = None" in out


def test_emit_pydantic_boolean():
    sift = _make_sift("Doc", [{"name": "is_paid", "type": "boolean"}])
    out = emit_pydantic(sift)
    assert "is_paid: Optional[bool] = None" in out


def test_emit_pydantic_date_imports():
    sift = _make_sift("Doc", [
        {"name": "issue_date", "type": "date"},
        {"name": "ts", "type": "datetime"},
    ])
    out = emit_pydantic(sift)
    assert "from datetime import date" in out
    assert "from datetime import datetime" in out
    assert "issue_date: Optional[date] = None" in out
    assert "ts: Optional[datetime] = None" in out


def test_emit_pydantic_array_object():
    sift = _make_sift("Doc", [
        {"name": "items", "type": "array"},
        {"name": "meta", "type": "object"},
    ])
    out = emit_pydantic(sift)
    assert "items: Optional[list] = None" in out
    assert "meta: Optional[dict] = None" in out


def test_emit_pydantic_class_name_pascal_case():
    sift = _make_sift("my invoice doc", [])
    out = emit_pydantic(sift)
    assert "class MyInvoiceDoc(BaseModel):" in out


def test_emit_pydantic_no_fields_is_none():
    sift = _make_sift("Doc", None)
    out = emit_pydantic(sift)
    assert "pass" in out


# ── emit_typescript ───────────────────────────────────────────────────────────

def test_emit_typescript_empty():
    sift = _make_sift("Empty", [])
    out = emit_typescript(sift)
    assert "export interface Empty {" in out
    assert "[key: string]: unknown;" in out


def test_emit_typescript_fields():
    sift = _make_sift("Invoice", [
        {"name": "client", "type": "string"},
        {"name": "amount", "type": "number"},
        {"name": "is_paid", "type": "boolean"},
    ])
    out = emit_typescript(sift)
    assert "client?: string;" in out
    assert "amount?: number;" in out
    assert "is_paid?: boolean;" in out


def test_emit_typescript_date_comment():
    sift = _make_sift("Doc", [
        {"name": "date", "type": "date"},
        {"name": "ts", "type": "datetime"},
    ])
    out = emit_typescript(sift)
    assert "// ISO yyyy-mm-dd" in out
    assert "// ISO 8601" in out


def test_emit_typescript_array_object():
    sift = _make_sift("Doc", [
        {"name": "items", "type": "array"},
        {"name": "meta", "type": "object"},
    ])
    out = emit_typescript(sift)
    assert "items?: unknown[];" in out
    assert "meta?: Record<string, unknown>;" in out


# ── emit_json_schema ──────────────────────────────────────────────────────────

def test_emit_json_schema_structure():
    sift = _make_sift("Invoice", [{"name": "client", "type": "string"}])
    schema = emit_json_schema(sift)
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert schema["title"] == "Invoice"
    assert schema["type"] == "object"
    assert "client" in schema["properties"]


def test_emit_json_schema_nullable():
    sift = _make_sift("Doc", [{"name": "amount", "type": "number"}])
    schema = emit_json_schema(sift)
    assert schema["properties"]["amount"]["type"] == ["number", "null"]


def test_emit_json_schema_date_format():
    sift = _make_sift("Doc", [
        {"name": "issue_date", "type": "date"},
        {"name": "ts", "type": "datetime"},
    ])
    schema = emit_json_schema(sift)
    assert schema["properties"]["issue_date"]["format"] == "date"
    assert schema["properties"]["ts"]["format"] == "date-time"


def test_emit_json_schema_empty_fields():
    sift = _make_sift("Doc", [])
    schema = emit_json_schema(sift)
    assert schema["properties"] == {}


# ── infer_schema_fields ───────────────────────────────────────────────────────

def test_infer_schema_string():
    fields = infer_schema_fields({"client": "Acme"})
    assert fields[0]["name"] == "client"
    assert fields[0]["type"] == "string"


def test_infer_schema_number_types():
    fields = infer_schema_fields({"amount": 99.5, "count": 3, "flag": True})
    types = {f["name"]: f["type"] for f in fields}
    assert types["amount"] == "number"
    assert types["count"] == "integer"
    assert types["flag"] == "boolean"


def test_infer_schema_date_detection():
    fields = infer_schema_fields({
        "issue_date": "2024-01-15",
        "ts": "2024-01-15T10:00:00Z",
        "note": "not a date",
    })
    types = {f["name"]: f["type"] for f in fields}
    assert types["issue_date"] == "date"
    assert types["ts"] == "datetime"
    assert types["note"] == "string"


def test_infer_schema_collection_types():
    fields = infer_schema_fields({"items": [1, 2], "meta": {"key": "v"}})
    types = {f["name"]: f["type"] for f in fields}
    assert types["items"] == "array"
    assert types["meta"] == "object"


def test_infer_schema_snake_case_keys():
    fields = infer_schema_fields({"Total Amount": 100, "ClientName": "Acme"})
    names = {f["name"] for f in fields}
    assert "total_amount" in names
    assert "client_name" in names


def test_infer_schema_nullable_flag():
    fields = infer_schema_fields({"x": "value"})
    assert fields[0]["nullable"] is True


def test_infer_schema_unknown_type_fallback():
    # Non-standard value type (e.g. None) → string
    fields = infer_schema_fields({"x": None})
    assert fields[0]["type"] == "string"
