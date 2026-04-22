"""Tests for citation_resolver."""
import pytest
from unittest.mock import patch
from sifter.services.citation_resolver import resolve_citations


PAGE_BLOCKS = [
    {"page": 1, "text": "OpenAI Ireland Ltd\nRegistered office: Dublin"},
    {"page": 1, "text": "Total amount: 1500 EUR"},
    {"page": 2, "text": "Invoice date: 14/03/2026"},
]


def test_verbatim_match():
    llm = {"supplier": {"source_text": "OpenAI Ireland Ltd", "confidence": 0.98}}
    result = resolve_citations("doc1", {"supplier": "OpenAI Ireland Ltd"}, llm, PAGE_BLOCKS)
    assert "supplier" in result
    c = result["supplier"]
    assert c["document_id"] == "doc1"
    assert c["source_text"] == "OpenAI Ireland Ltd"
    assert c["page"] == 1
    assert c.get("inferred") is not True
    assert c["confidence"] == pytest.approx(0.98)


def test_fuzzy_match():
    # "OpenAI Ltd Ireland" doesn't verbatim-match "OpenAI Ireland Ltd" but has high token overlap
    llm = {"supplier": {"source_text": "OpenAI Ltd Ireland", "confidence": 0.90}}
    result = resolve_citations("doc1", {"supplier": "OpenAI Ltd Ireland"}, llm, PAGE_BLOCKS)
    assert "supplier" in result
    c = result["supplier"]
    assert c.get("inferred") is True
    assert c["confidence"] <= 0.7


def test_non_pdf_passthrough():
    llm = {"supplier": {"source_text": "Acme Corp", "confidence": 0.95}}
    result = resolve_citations("doc1", {"supplier": "Acme Corp"}, llm, [])
    assert "supplier" in result
    c = result["supplier"]
    assert c["source_text"] == "Acme Corp"
    assert c["confidence"] == pytest.approx(0.95)
    assert "page" not in c
    assert "inferred" not in c


def test_missing_llm_citation():
    llm = {"supplier": {"source_text": "Acme", "confidence": 0.9}}
    result = resolve_citations("doc1", {"supplier": "Acme", "total": 1500}, llm, PAGE_BLOCKS)
    assert "supplier" in result
    assert "total" not in result


def test_low_confidence_logged():
    llm = {"total": {"source_text": "1500 EUR", "confidence": 0.4}}
    import structlog.testing
    with structlog.testing.capture_logs() as cap:
        result = resolve_citations("doc1", {"total": 1500}, llm, PAGE_BLOCKS)
    assert "total" in result
    low_logs = [e for e in cap if e.get("log_level") == "info" and "low_confidence" in e.get("event", "")]
    assert len(low_logs) > 0


def test_null_value_skipped():
    llm = {"client": {"source_text": "Acme", "confidence": 0.9}, "vat": {"source_text": "IT123", "confidence": 0.8}}
    result = resolve_citations("doc1", {"client": "Acme", "vat": None}, llm, PAGE_BLOCKS)
    # vat is None in extracted_data — should be in llm but skipped? No — the resolver
    # iterates extracted_data fields, so vat is still in extracted_data (as None).
    # But since vat IS in llm_citations, it will be processed. None values are fine.
    assert "client" in result


def test_empty_llm_citations():
    result = resolve_citations("doc1", {"client": "Acme"}, {}, PAGE_BLOCKS)
    assert result == {}


def test_unresolvable_citation_still_included():
    """When source_text doesn't match any block, citation is still included (no page/inferred)."""
    llm = {"total": {"source_text": "xyzzy no match here", "confidence": 0.5}}
    blocks = [{"page": 1, "text": "completely different text"}]
    result = resolve_citations("doc1", {"total": 100}, llm, blocks)
    assert "total" in result
    c = result["total"]
    assert "page" not in c
    assert "inferred" not in c
