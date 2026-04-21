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
