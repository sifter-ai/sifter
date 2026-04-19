import base64
import csv
import io
from pathlib import Path
from typing import NamedTuple

import structlog

logger = structlog.get_logger()

SUPPORTED_EXTENSIONS = {
    ".pdf",
    ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".webp",
    ".docx",
    ".txt", ".md",
    ".html", ".htm",
    ".csv",
}

_MIME_MAP = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
    ".webp": "image/webp",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".html": "text/html",
    ".htm": "text/html",
    ".csv": "text/csv",
}

_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tiff", ".tif", ".webp"}

_CSV_ROW_LIMIT = 10_000


class UnsupportedFileType(Exception):
    def __init__(self, ext: str):
        self.ext = ext
        super().__init__(f"Unsupported file type: {ext}")


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
        The LLM fetches the file directly — only PDF and images are supported this way."""
        ext = Path(filename).suffix.lower()
        mime_type = _MIME_MAP.get(ext, "application/octet-stream")
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
        elif ext in _IMAGE_EXTENSIONS:
            return self._process_image(data, filename)
        elif ext == ".docx":
            return self._process_docx(data, filename)
        elif ext in {".html", ".htm"}:
            return self._process_html(data, filename)
        elif ext == ".csv":
            return self._process_csv(data, filename)
        elif ext in {".txt", ".md"}:
            return self._process_text(data, filename, mime=_MIME_MAP.get(ext, "text/plain"))
        else:
            raise UnsupportedFileType(ext)

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
        mime_type = _MIME_MAP.get(ext, "image/png")
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

    def _process_docx(self, data: bytes, filename: str) -> ProcessedFile:
        import mammoth
        result = mammoth.convert_to_markdown(io.BytesIO(data))
        return ProcessedFile(
            text_content=result.value,
            images=[],
            mime_type=_MIME_MAP[".docx"],
            file_name=filename,
        )

    def _process_html(self, data: bytes, filename: str) -> ProcessedFile:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(data, "html.parser")
        text = soup.get_text(separator="\n", strip=True)
        return ProcessedFile(
            text_content=text,
            images=[],
            mime_type="text/html",
            file_name=filename,
        )

    def _process_csv(self, data: bytes, filename: str) -> ProcessedFile:
        try:
            text = data.decode("utf-8", errors="replace")
            reader = csv.reader(io.StringIO(text))
            rows = []
            for i, row in enumerate(reader):
                if i >= _CSV_ROW_LIMIT:
                    break
                rows.append(row)

            if not rows:
                return ProcessedFile(text_content="", images=[], mime_type="text/csv", file_name=filename)

            header = rows[0]
            separator = ["---"] * len(header)
            md_rows = [header, separator] + rows[1:]
            markdown = "\n".join("| " + " | ".join(r) + " |" for r in md_rows)
        except Exception:
            markdown = data.decode("utf-8", errors="replace")

        return ProcessedFile(
            text_content=markdown,
            images=[],
            mime_type="text/csv",
            file_name=filename,
        )

    def _process_text(self, data: bytes, filename: str, mime: str = "text/plain") -> ProcessedFile:
        content = data.decode("utf-8", errors="replace")
        return ProcessedFile(
            text_content=content,
            images=[],
            mime_type=mime,
            file_name=filename,
        )

    def is_supported(self, filename: str) -> bool:
        return Path(filename).suffix.lower() in SUPPORTED_EXTENSIONS
