import json
import re
from pathlib import Path
from typing import Any

import litellm
import structlog

from ..config import config, api_kwargs

logger = structlog.get_logger()

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "aggregation_pipeline.md"
_SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")


def _strip_markdown_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _build_field_schema(sample_records: list[dict[str, Any]]) -> str:
    """
    Build a human-readable field schema from sample extracted records.
    Format: "- `field_name` (type=string, sample='Acme Corp')"
    """
    field_info: dict[str, dict] = {}

    for record in sample_records:
        extracted = record.get("extracted_data", {})
        for field, value in extracted.items():
            if field not in field_info:
                field_info[field] = {"type": _infer_type(value), "sample": value}

    lines = []
    for field, info in field_info.items():
        sample = info["sample"]
        if sample is None:
            sample_str = "null"
        elif isinstance(sample, str):
            sample_str = f"'{sample[:50]}'"
        else:
            sample_str = str(sample)
        lines.append(f"- `{field}` (type={info['type']}, sample={sample_str})")

    return "\n".join(lines) if lines else "No fields available yet."


def _infer_type(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int | float):
        return "number"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return "string"


async def generate_pipeline(
    query: str,
    sample_records: list[dict[str, Any]],
) -> str:
    """
    Convert a natural language query into a MongoDB aggregation pipeline JSON string.

    Args:
        query: Natural language query (e.g. "Total amount by client")
        sample_records: Sample ExtractionResult dicts to infer field schema

    Returns:
        JSON string of MongoDB aggregation pipeline stages (array)
    """
    field_schema = _build_field_schema(sample_records)

    user_message = f"""## Available Fields
{field_schema}

## Query
{query}

Generate the MongoDB aggregation pipeline for this query."""

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    logger.info("pipeline_agent_call", model=config.pipeline_model, query=query)

    response = await litellm.acompletion(
        model=config.pipeline_model,
        messages=messages,
        temperature=0.1,
        **api_kwargs(config.pipeline_model),
    )

    raw = response.choices[0].message.content
    cleaned = _strip_markdown_fences(raw)

    # Validate: must be a JSON array
    try:
        pipeline = json.loads(cleaned)
        if not isinstance(pipeline, list):
            raise ValueError("Pipeline must be a JSON array")
        # Ensure each stage is a dict
        for stage in pipeline:
            if not isinstance(stage, dict):
                raise ValueError(f"Each pipeline stage must be an object, got: {type(stage)}")
    except json.JSONDecodeError as e:
        logger.error("pipeline_json_parse_error", raw=raw[:500], error=str(e))
        raise ValueError(f"LLM returned invalid pipeline JSON: {e}") from e

    return json.dumps(pipeline)
