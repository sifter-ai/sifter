import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import litellm
import structlog

from ..config import config
from .file_processor import FileProcessor

logger = structlog.get_logger()

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "extraction.md"
_SYSTEM_PROMPT = _PROMPT_PATH.read_text(encoding="utf-8")

_file_processor = FileProcessor()


@dataclass
class ExtractionAgentResult:
    document_type: str
    matches_filter: bool
    filter_reason: str
    confidence: float
    extracted_data: list[dict[str, Any]]
    page_blocks: list[dict] = None


def _strip_markdown_fences(text: str) -> str:
    """Remove ```json ... ``` or ``` ... ``` wrappers."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


async def extract(
    source: "bytes | str",
    filename: str,
    instructions: str,
    schema: Optional[str] = None,
    multi_record: bool = False,
) -> ExtractionAgentResult:
    if isinstance(source, str):
        processed = _file_processor.process_uri(source, filename)
    else:
        processed = _file_processor.process(source, filename)

    user_content: list[dict] = []

    text_parts = [f"## Extraction Instructions\n{instructions}"]
    if multi_record:
        text_parts.append(
            "## Output Format\nReturn a JSON **array** of objects in the `extractedData` field, "
            "one object per record found in the document. If the document contains only one record, "
            "return a single-element array."
        )
    else:
        text_parts.append(
            "## Output Format\nReturn a single JSON object in the `extractedData` field."
        )
    if schema:
        text_parts.append(f"## Expected Schema (maintain consistency)\n{schema}")
    if processed.text_content:
        text_parts.append(f"## Document Text Content\n{processed.text_content}")

    user_content.append({"type": "text", "text": "\n\n".join(text_parts)})
    for img in processed.images:
        user_content.append(img)

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    logger.info(
        "extraction_agent_call",
        filename=filename,
        model=config.llm_model,
        num_images=len(processed.images),
    )

    response = await litellm.acompletion(
        model=config.llm_model,
        messages=messages,
        temperature=config.extraction_temperature,
        api_key=config.llm_api_key or None,
    )

    raw = response.choices[0].message.content
    cleaned = _strip_markdown_fences(raw)

    try:
        data_parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error("extraction_json_parse_error", raw=raw[:500], error=str(e))
        raise ValueError(f"LLM returned invalid JSON: {e}") from e

    raw_extracted = data_parsed.get("extractedData", {})
    if multi_record:
        if isinstance(raw_extracted, list):
            extracted_list = raw_extracted
        else:
            extracted_list = [raw_extracted] if raw_extracted else []
    else:
        if isinstance(raw_extracted, list):
            extracted_list = [raw_extracted[0]] if raw_extracted else [{}]
        else:
            extracted_list = [raw_extracted]

    return ExtractionAgentResult(
        document_type=data_parsed.get("documentType", "unknown"),
        matches_filter=data_parsed.get("matchesFilter", True),
        filter_reason=data_parsed.get("filterReason", ""),
        confidence=float(data_parsed.get("confidence", 0.0)),
        extracted_data=extracted_list,
        page_blocks=processed.page_blocks,
    )
