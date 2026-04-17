"""
Citation resolver — maps extracted field values to source locations in the document.

Given the raw text blocks returned by the file processor and a field value, finds
the page number and bounding box where the value appears.  Falls back to fuzzy
matching when the verbatim string is not found.

Citation shape (matches system/entities.md):
{
    "document_id": str,
    "page": int,          # 1-indexed
    "bbox": [x1, y1, x2, y2],  # normalised [0..1]
    "source_text": str,
    "inferred": bool | None   # present and True when value was not directly quoted
}
"""
from __future__ import annotations

import re
from typing import Any


def resolve_citations(
    document_id: str,
    extracted_data: dict[str, Any],
    page_blocks: list[dict],  # [{page, text, bbox, width, height}, ...]
) -> dict[str, dict]:
    """
    Returns a citation map: { field_name: citation_dict }.
    Fields that cannot be resolved are omitted.
    """
    citations: dict[str, dict] = {}
    for field, value in extracted_data.items():
        if value is None:
            continue
        text = str(value).strip()
        if not text:
            continue

        citation = _find_verbatim(document_id, text, page_blocks)
        if citation is None:
            citation = _find_fuzzy(document_id, text, page_blocks)
        if citation is not None:
            citations[field] = citation

    return citations


def _find_verbatim(
    document_id: str, text: str, blocks: list[dict]
) -> dict | None:
    for block in blocks:
        block_text: str = block.get("text", "")
        if text.lower() in block_text.lower():
            return _make_citation(document_id, block, text, inferred=False)
    return None


def _find_fuzzy(
    document_id: str, text: str, blocks: list[dict]
) -> dict | None:
    text_tokens = set(_tokenize(text))
    if not text_tokens:
        return None

    best_score = 0.0
    best_block = None

    for block in blocks:
        block_tokens = set(_tokenize(block.get("text", "")))
        if not block_tokens:
            continue
        overlap = len(text_tokens & block_tokens)
        score = overlap / max(len(text_tokens), 1)
        if score > best_score:
            best_score = score
            best_block = block

    if best_score >= 0.6 and best_block is not None:
        return _make_citation(document_id, best_block, text, inferred=True)
    return None


def _make_citation(
    document_id: str, block: dict, source_text: str, inferred: bool
) -> dict:
    page = block.get("page", 1)
    raw_bbox = block.get("bbox", [0, 0, 0, 0])
    width = block.get("width", 1) or 1
    height = block.get("height", 1) or 1

    # Normalise bbox to [0..1]
    if len(raw_bbox) == 4:
        x1, y1, x2, y2 = raw_bbox
        norm_bbox = [x1 / width, y1 / height, x2 / width, y2 / height]
    else:
        norm_bbox = [0.0, 0.0, 1.0, 1.0]

    result: dict = {
        "document_id": document_id,
        "page": page,
        "bbox": norm_bbox,
        "source_text": source_text,
    }
    if inferred:
        result["inferred"] = True
    return result


def _tokenize(text: str) -> list[str]:
    return re.findall(r"\w+", text.lower())
