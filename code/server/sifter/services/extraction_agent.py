# Legacy shim — import from new location
from .sift_agent import ExtractionAgentResult, extract, _strip_markdown_fences  # noqa: F401

__all__ = ["ExtractionAgentResult", "extract", "_strip_markdown_fences"]
