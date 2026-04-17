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
            file_path=str(test_file),
            instructions="Extract: client, amount, date",
        )

    assert result.document_type == "invoice"
    assert result.matches_filter is True
    assert result.confidence == 0.95
    assert result.extracted_data["client"] == "Acme Corp"
    assert result.extracted_data["amount"] == 1500.00


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
                file_path=str(test_file),
                instructions="Extract: client",
            )
