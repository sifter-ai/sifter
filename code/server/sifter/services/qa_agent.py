"""
Q&A Agent: schema-aware conversational assistant for sift data.
Used by both /api/chat and /api/sifts/{id}/chat.
"""
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import litellm
import structlog

from ..config import config
from .aggregation_service import AggregationService
from .sift_results import SiftResultsService
from .sift_service import SiftService

logger = structlog.get_logger()

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "qa_agent.md"
_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")

# Fallback prompt for global chat (no extraction context)
_FALLBACK_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "chat_agent.md"
_FALLBACK_PROMPT = _FALLBACK_PROMPT_PATH.read_text(encoding="utf-8")


@dataclass
class QAResponse:
    response: str
    data: Optional[list[dict[str, Any]]]
    pipeline: Optional[list]


async def chat(
    extraction_id: Optional[str],
    message: str,
    history: list[dict],
    db,
) -> QAResponse:
    """
    Main Q&A entrypoint. Accepts optional extraction_id for schema-aware mode.
    """
    extraction_svc = SiftService(db)
    results_svc = SiftResultsService(db)
    agg_svc = AggregationService(db)

    # Build system prompt with extraction context
    if extraction_id:
        extraction = await extraction_svc.get(extraction_id)
        if extraction:
            sample_records = await results_svc.get_sample_records(extraction_id, limit=5)
            extraction_context = _build_extraction_context(extraction, sample_records)
            system = _PROMPT_TEMPLATE.replace("{extraction_context}", extraction_context)
        else:
            system = _FALLBACK_PROMPT
            extraction_id = None  # can't query a nonexistent extraction
    else:
        # Global chat — list available extractions for context
        sifts, _ = await extraction_svc.list_all()
        if sifts:
            names = ", ".join(f'"{e.name}" (id: {e.id})' for e in sifts[:5])
            global_context = f"\n## Available Sifts\n{names}\n"
        else:
            global_context = "\n## Available Sifts\nNo sifts found.\n"
        system = _FALLBACK_PROMPT + global_context

    # Build messages
    messages = [{"role": "system", "content": system}]
    for msg in history[-10:]:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": message})

    response = await litellm.acompletion(
        model=config.pipeline_model,
        messages=messages,
        temperature=0.3,
        api_key=config.llm_api_key or None,
    )

    raw = response.choices[0].message.content
    logger.debug("qa_agent_response", raw=raw[:200])

    # Parse structured response
    try:
        cleaned = _strip_markdown_fences(raw)
        data = json.loads(cleaned)
        response_text = data.get("response", raw)
        query_used = data.get("query")
        result_data = data.get("data")
        pipeline_used = None

        # Execute query if provided
        if query_used and extraction_id:
            try:
                results, pipeline_used = await agg_svc.live_query(extraction_id, query_used)
                result_data = results
            except Exception as e:
                logger.warning("qa_agent_query_failed", error=str(e))

        return QAResponse(response=response_text, data=result_data, pipeline=pipeline_used)
    except (json.JSONDecodeError, AttributeError):
        return QAResponse(response=raw, data=None, pipeline=None)


def _build_extraction_context(extraction, sample_records: list[dict]) -> str:
    lines = [
        f"Name: {extraction.name}",
        f"Instructions: {extraction.instructions}",
        f"Schema: {extraction.schema or 'not yet inferred'}",
        f"Documents processed: {extraction.processed_documents}",
    ]
    if sample_records:
        # Show field names from first record
        first = sample_records[0].get("extracted_data", {})
        if first:
            fields = ", ".join(f"{k}: {type(v).__name__}" for k, v in list(first.items())[:10])
            lines.append(f"Sample fields: {fields}")
    return "\n".join(lines)


def _strip_markdown_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()
