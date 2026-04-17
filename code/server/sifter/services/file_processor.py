import base64
from pathlib import Path
from typing import NamedTuple

import structlog

logger = structlog.get_logger()

SUPPORTED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".webp"}


def count_pdf_pages(content: bytes) -> int | None:
    """Return the page count of a PDF byte stream, or None if it cannot be parsed."""
    try:
        import fitz  # pymupdf

        with fitz.open(stream=content, filetype="pdf") as doc:
            return doc.page_count
    except Exception as exc:
        logger.warning("pdf_page_count_failed", error=str(exc))
        return None


class ProcessedFile(NamedTuple):
    text_content: str
    images: list[dict]  # list of {"type": "image_url", "image_url": {"url": "data:..."}}
    mime_type: str
    file_name: str
    page_blocks: list[dict] = []  # kept for API compatibility; always empty now


class FileProcessor:
    def process_uri(self, uri: str, filename: str) -> ProcessedFile:
        """Build a ProcessedFile from a remote URI (gs://, https://, ...).
        The LLM fetches the file directly — no download required."""
        ext = Path(filename).suffix.lower()
        mime_map = {
            ".pdf": "application/pdf",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".tiff": "image/tiff",
            ".tif": "image/tiff",
            ".webp": "image/webp",
        }
        mime_type = mime_map.get(ext, "application/octet-stream")
        return ProcessedFile(
            text_content="",
            images=[{"type": "image_url", "image_url": {"url": uri}}],
            mime_type=mime_type,
            file_name=filename,
        )

    def process(self, data: bytes, filename: str) -> ProcessedFile:
        ext = Path(filename).suffix.lower()
        if ext == ".pdf":
            return self._process_pdf(data, filename)
        elif ext in {".png", ".jpg", ".jpeg", ".tiff", ".tif", ".webp"}:
            return self._process_image(data, filename)
        else:
            return self._process_text(data, filename)

    def _process_pdf(self, data: bytes, filename: str) -> ProcessedFile:
        b64 = base64.b64encode(data).decode("utf-8")
        return ProcessedFile(
            text_content="",
            images=[{
                "type": "image_url",
                "image_url": {"url": f"data:application/pdf;base64,{b64}"},
            }],
            mime_type="application/pdf",
            file_name=filename,
        )

    def _process_image(self, data: bytes, filename: str) -> ProcessedFile:
        ext = Path(filename).suffix.lower()
        mime_map = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".tiff": "image/tiff",
            ".tif": "image/tiff",
            ".webp": "image/webp",
        }
        mime_type = mime_map.get(ext, "image/png")
        b64 = base64.b64encode(data).decode("utf-8")
        return ProcessedFile(
            text_content="",
            images=[{
                "type": "image_url",
                "image_url": {"url": f"data:{mime_type};base64,{b64}"},
            }],
            mime_type=mime_type,
            file_name=filename,
        )

    def _process_text(self, data: bytes, filename: str) -> ProcessedFile:
        content = data.decode("utf-8", errors="replace")
        return ProcessedFile(
            text_content=content,
            images=[],
            mime_type="text/plain",
            file_name=filename,
        )

    def is_supported(self, filename: str) -> bool:
        return Path(filename).suffix.lower() in SUPPORTED_EXTENSIONS
