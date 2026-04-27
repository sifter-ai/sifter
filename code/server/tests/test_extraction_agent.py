"""
Unit tests for the extraction agent.
Tests focus on JSON parsing and response handling without real LLM calls.
"""

import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from pathlib import Path

from sifter.services.sift_agent import extract, _strip_markdown_fences, ExtractionAgentResult


def test_strip_markdown_fences_plain():
    raw = '{"key": "value"}'
    assert _strip_markdown_fences(raw) == '{"key": "value"}'


def test_strip_markdown_fences_json_block():
    raw = '```json\n{"key": "value"}\n```'
    assert _strip_markdown_fences(raw) == '{"key": "value"}'


def test_strip_markdown_fences_plain_block():
    raw = '```\n{"key": "value"}\n```'
    assert _strip_markdown_fences(raw) == '{"key": "value"}'


def test_strip_markdown_fences_with_whitespace():
    raw = '  ```json\n  {"key": "value"}\n  ```  '
    result = _strip_markdown_fences(raw)
    assert result == '{"key": "value"}'


@pytest.mark.asyncio
async def test_extract_success(tmp_path):
    test_file = tmp_path / "invoice.txt"
    test_file.write_text("Invoice\nClient: Acme Corp\nAmount: 1500.00\nDate: 2024-12-15")

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps({
        "documentType": "invoice",
        "matchesFilter": True,
        "filterReason": "",
        "confidence": 0.95,
        "extractedData": {
            "client": "Acme Corp",
            "amount": 1500.00,
            "date": "2024-12-15",
        },
    })

    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        result = await extract(
            source=test_file.read_bytes(),
            filename="invoice.txt",
            instructions="Extract: client, amount, date",
        )

    assert result.document_type == "invoice"
    assert result.matches_filter is True
    assert result.confidence == 0.95
    assert result.extracted_data[0]["client"] == "Acme Corp"
    assert result.extracted_data[0]["amount"] == 1500.00


@pytest.mark.asyncio
async def test_extract_invalid_json(tmp_path):
    test_file = tmp_path / "doc.txt"
    test_file.write_text("some document")

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "This is not JSON"

    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        with pytest.raises(ValueError, match="invalid JSON"):
            await extract(
                source=test_file.read_bytes(),
                filename="doc.txt",
                instructions="Extract: client",
            )


@pytest.mark.asyncio
async def test_extract_parses_citations(tmp_path):
    test_file = tmp_path / "invoice.txt"
    test_file.write_text("Supplier: Acme Corp\nTotal: 1500 EUR")

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps({
        "documentType": "invoice",
        "matchesFilter": True,
        "filterReason": "",
        "confidence": 0.92,
        "extractedData": {"supplier": "Acme Corp", "total": 1500},
        "citations": {
            "supplier": {"source_text": "Acme Corp", "confidence": 0.98},
            "total": {"source_text": "Total: 1500 EUR", "confidence": 0.95},
        },
    })

    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        result = await extract(
            source=test_file.read_bytes(),
            filename="invoice.txt",
            instructions="Extract: supplier, total",
        )

    assert result.llm_citations is not None
    assert "supplier" in result.llm_citations
    assert result.llm_citations["supplier"]["source_text"] == "Acme Corp"
    assert result.llm_citations["supplier"]["confidence"] == pytest.approx(0.98)
    assert "total" in result.llm_citations


@pytest.mark.asyncio
async def test_extract_no_citations_key(tmp_path):
    test_file = tmp_path / "doc.txt"
    test_file.write_text("some document without citations")

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps({
        "documentType": "other",
        "matchesFilter": True,
        "filterReason": "",
        "confidence": 0.5,
        "extractedData": {"field": "value"},
    })

    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        result = await extract(
            source=test_file.read_bytes(),
            filename="doc.txt",
            instructions="Extract: field",
        )

    assert result.llm_citations == {}


# ── URI source path (line 66) ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_extract_uri_source():
    """source is a string URI → process_uri path (line 66)."""
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps({
        "documentType": "invoice",
        "matchesFilter": True,
        "filterReason": "",
        "confidence": 0.9,
        "extractedData": {"amount": "100"},
    })

    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        result = await extract(
            source="gs://my-bucket/path/invoice.pdf",
            filename="invoice.pdf",
            instructions="Extract amount",
        )

    assert result.document_type == "invoice"
    call_messages = mock_llm.call_args.kwargs["messages"]
    user_content = call_messages[1]["content"]
    assert any(
        isinstance(p, dict) and p.get("type") == "image_url"
        for p in user_content
    )


# ── multi_record=True with dict extractedData (line 132) ────────────────────

@pytest.mark.asyncio
async def test_extract_multi_record_dict_response():
    """multi_record=True but extractedData is a dict (not list) → wrap in list (line 132)."""
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps({
        "documentType": "invoice",
        "matchesFilter": True,
        "filterReason": "",
        "confidence": 0.9,
        "extractedData": {"amount": "100"},
    })

    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        result = await extract(
            source=b"text",
            filename="invoice.txt",
            instructions="Extract amounts",
            multi_record=True,
        )

    assert len(result.extracted_data) == 1
    assert result.extracted_data[0]["amount"] == "100"


# ── multi_record=True path (line 74) ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_extract_multi_record():
    """multi_record=True → array format instruction appended (line 74)."""
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps({
        "documentType": "invoice",
        "matchesFilter": True,
        "filterReason": "",
        "confidence": 0.9,
        "extractedData": [{"amount": "100"}, {"amount": "200"}],
    })

    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        result = await extract(
            source=b"some invoice text",
            filename="invoice.txt",
            instructions="Extract amounts",
            multi_record=True,
        )

    assert len(result.extracted_data) == 2
    call_messages = mock_llm.call_args.kwargs["messages"]
    user_text = call_messages[1]["content"][0]["text"]
    assert "array" in user_text.lower()


# ── schema param (line 84) ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_extract_with_schema():
    """schema provided → appended to user content (line 84)."""
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps({
        "documentType": "invoice",
        "matchesFilter": True,
        "filterReason": "",
        "confidence": 0.9,
        "extractedData": {"amount": "100"},
    })

    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        result = await extract(
            source=b"text",
            filename="invoice.txt",
            instructions="Extract",
            schema="amount: number",
        )

    call_messages = mock_llm.call_args.kwargs["messages"]
    user_text = call_messages[1]["content"][0]["text"]
    assert "Expected Schema" in user_text
    assert result.document_type == "invoice"


# ── LLM error re-raised (lines 113-115) ──────────────────────────────────────

@pytest.mark.asyncio
async def test_extract_llm_error_is_reraised():
    """If litellm raises, the error is logged and re-raised (lines 113-115)."""
    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.side_effect = RuntimeError("LLM unavailable")
        with pytest.raises(RuntimeError, match="LLM unavailable"):
            await extract(
                source=b"text",
                filename="invoice.txt",
                instructions="Extract",
            )


# ── extractedData as list when multi_record=False (lines 134-135) ────────────

@pytest.mark.asyncio
async def test_extract_single_record_list_response():
    """LLM returns a list for extractedData but multi_record=False → take first (lines 134-135)."""
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps({
        "documentType": "invoice",
        "matchesFilter": True,
        "filterReason": "",
        "confidence": 0.9,
        "extractedData": [{"amount": "100"}, {"amount": "200"}],
    })

    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        result = await extract(
            source=b"text",
            filename="invoice.txt",
            instructions="Extract",
            multi_record=False,
        )

    assert len(result.extracted_data) == 1
    assert result.extracted_data[0]["amount"] == "100"
