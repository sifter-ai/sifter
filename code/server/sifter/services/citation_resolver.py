"""
Citation resolver — maps LLM-provided source spans to verified page locations.

For PDFs, page_blocks (extracted via pymupdf) are searched verbatim then fuzzy.
For other formats, the LLM's source_text + confidence pass through unchanged.

Citation shape:
{
    "document_id": str,
    "source_text": str,
    "page": int,       # 1-indexed; present for PDFs only
    "confidence": float,  # [0.0, 1.0]; absent when provider cannot supply it
    "inferred": bool,  # True when fuzzy match was used; absent for non-PDF
}
"""
from __future__ import annotations

import re
import structlog
from typing import Any

logger = structlog.get_logger()


def resolve_citations(
    document_id: str,
    extracted_data: dict[str, Any],
    llm_citations: dict[str, dict],
    page_blocks: list[dict],  # [{page, text}, ...] — empty for non-PDF formats
) -> dict[str, dict]:
    """
    Returns a citation map: { field_name: citation_dict }.
    Fields absent from llm_citations are omitted.
    """
    citations: dict[str, dict] = {}
    for field in extracted_data:
        if field not in llm_citations:
            continue
        llm_entry = llm_citations[field]
        if not isinstance(llm_entry, dict):
            continue
        source_text = llm_entry.get("source_text", "")
        if not source_text:
            continue
        confidence = llm_entry.get("confidence")
        if confidence is not None:
            try:
                confidence = float(confidence)
            except (TypeError, ValueError):
                confidence = None

        if confidence is not None and confidence < 0.6:
            logger.info("low_confidence_field", field=field, confidence=confidence)

        if page_blocks:
            page, inferred = _find_verbatim(source_text, page_blocks)
            if page is None:
                page, inferred = _find_fuzzy(source_text, page_blocks)
            if page is None:
                logger.warning("citation_unresolved", field=field, source_text=source_text[:80])
            citations[field] = _make_citation(document_id, source_text, page, inferred, confidence)
        else:
            citations[field] = _make_citation(document_id, source_text, None, None, confidence)

    return citations


def _find_verbatim(text: str, blocks: list[dict]) -> tuple[int | None, bool]:
    for block in blocks:
        if text.lower() in block.get("text", "").lower():
            return block.get("page", 1), False
    return None, False


def _find_fuzzy(text: str, blocks: list[dict]) -> tuple[int | None, bool]:
    text_tokens = set(_tokenize(text))
    if not text_tokens:
        return None, False

    best_score = 0.0
    best_page = None

    for block in blocks:
        block_tokens = set(_tokenize(block.get("text", "")))
        if not block_tokens:
            continue
        overlap = len(text_tokens & block_tokens)
        score = overlap / max(len(text_tokens), 1)
        if score > best_score:
            best_score = score
            best_page = block.get("page", 1)

    if best_score >= 0.6 and best_page is not None:
        return best_page, True
    return None, False


def _make_citation(
    document_id: str,
    source_text: str,
    page: int | None,
    inferred: bool | None,
    confidence: float | None,
) -> dict:
    result: dict = {"document_id": document_id, "source_text": source_text}
    if page is not None:
        result["page"] = page
    if confidence is not None:
        result["confidence"] = min(confidence, 0.7) if inferred else confidence
    if inferred:
        result["inferred"] = True
    return result


def _tokenize(text: str) -> list[str]:
    return re.findall(r"\w+", text.lower())
