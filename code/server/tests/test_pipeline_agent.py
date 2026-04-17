"""
Unit tests for the pipeline agent.
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from sifter.services.pipeline_agent import generate_pipeline, _build_field_schema, _infer_type


def test_infer_type_string():
    assert _infer_type("hello") == "string"


def test_infer_type_number():
    assert _infer_type(1500.0) == "number"
    assert _infer_type(42) == "number"


def test_infer_type_null():
    assert _infer_type(None) == "null"


def test_infer_type_bool():
    assert _infer_type(True) == "boolean"


def test_build_field_schema_empty():
    result = _build_field_schema([])
    assert "No fields" in result


def test_build_field_schema_with_records():
    records = [
        {"extracted_data": {"client": "Acme Corp", "amount": 1500.0, "date": "2024-12-15"}},
        {"extracted_data": {"client": "Globex", "amount": 2000.0, "date": "2024-12-16"}},
    ]
    result = _build_field_schema(records)
    assert "`client`" in result
    assert "type=string" in result
    assert "`amount`" in result
    assert "type=number" in result


@pytest.mark.asyncio
async def test_generate_pipeline_success():
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps([
        {"$group": {"_id": "$extracted_data.client", "total": {"$sum": "$extracted_data.amount"}}},
        {"$sort": {"total": -1}},
    ])

    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        result = await generate_pipeline(
            query="Total amount by client",
            sample_records=[{"extracted_data": {"client": "Acme", "amount": 100.0}}],
        )

    pipeline = json.loads(result)
    assert isinstance(pipeline, list)
    assert len(pipeline) == 2
    assert "$group" in pipeline[0]


@pytest.mark.asyncio
async def test_generate_pipeline_invalid_json():
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "not valid json"

    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        with pytest.raises(ValueError, match="invalid pipeline JSON"):
            await generate_pipeline(
                query="total by client",
                sample_records=[],
            )


@pytest.mark.asyncio
async def test_generate_pipeline_not_array():
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = '{"not": "an array"}'

    with patch("litellm.acompletion", new_callable=AsyncMock) as mock_llm:
        mock_llm.return_value = mock_response
        with pytest.raises(ValueError, match="must be a JSON array"):
            await generate_pipeline(
                query="total by client",
                sample_records=[],
            )
