import base64
import csv
import io
from pathlib import Path
from typing import NamedTuple

import structlog

from ..config import config

logger = structlog.get_logger()


class _LiteLLMCompletions:
    def create(self, model: str, messages: list, **kwargs):
        import litellm
        from ..config import api_kwargs_for
        kw = api_kwargs_for("ocr")
        return litellm.completion(model=model, messages=messages, **kw)


class _LiteLLMChat:
    completions = _LiteLLMCompletions()


class _LiteLLMClient:
    """OpenAI-compatible client backed by LiteLLM, for markitdown-ocr plugin."""
    chat = _LiteLLMChat()

SUPPORTED_EXTENSIONS = {
    ".pdf",
    ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".webp",
    ".docx",
    ".txt", ".md",
    ".html", ".htm",
    ".csv",
}

# Extra extensions unlocked when the markitdown preprocessor is active.
MARKITDOWN_EXTENSIONS = SUPPORTED_EXTENSIONS | {
    ".xlsx", ".xls",
    ".pptx", ".ppt",
    ".epub",
    ".zip",
    ".json", ".xml",
    ".msg",
    ".mp3", ".wav",
}

# Visual formats that keep their image/file block attached even in markitdown mode,
# so vision models retain full capability.
_VISUAL_EXTENSIONS = {".pdf"} | {".png", ".jpg", ".jpeg", ".tiff", ".tif", ".webp"}

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
    page_blocks: list[dict] = []


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
        if config.preprocessor == "markitdown":
            ext = Path(filename).suffix.lower()
            if ext in _IMAGE_EXTENSIONS:
                return self._process_image(data, filename)
            return self._process_markitdown(data, filename)
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

    def _build_markitdown(self):
        """Construct a MarkItDown instance, wiring optional OCR backends.

        Raises a clear, actionable error when the markitdown package is missing.
        """
        try:
            from markitdown import MarkItDown
        except ImportError as exc:
            raise RuntimeError(
                "markitdown is not installed but SIFTER_PREPROCESSOR=markitdown. "
                "Install it with: pip install 'markitdown[all]' "
                "(or set SIFTER_PREPROCESSOR=native)."
            ) from exc

        kwargs: dict = {}
        if config.markitdown_docintel_endpoint:
            kwargs["docintel_endpoint"] = config.markitdown_docintel_endpoint
        if config.markitdown_ocr:
            kwargs["llm_client"] = _LiteLLMClient()
            kwargs["llm_model"] = config.ocr_model
        return MarkItDown(enable_plugins=True, **kwargs)

    def _process_markitdown(self, data: bytes, filename: str) -> ProcessedFile:
        import time
        ext = Path(filename).suffix.lower()
        mime_type = _MIME_MAP.get(ext, "application/octet-stream")
        ocr_enabled = config.markitdown_ocr

        logger.info(
            "preprocessor_start",
            filename=filename,
            ext=ext,
            size_kb=round(len(data) / 1024, 1),
            ocr=ocr_enabled,
            ocr_model=config.ocr_model if ocr_enabled else None,
        )

        t0 = time.monotonic()
        md = self._build_markitdown()
        stream = io.BytesIO(data)
        try:
            result = md.convert_stream(stream, file_extension=ext)
        except TypeError:
            stream.seek(0)
            result = md.convert_stream(stream)
        text_content = result.text_content or ""

        images: list[dict] = []
        page_blocks: list[dict] = []
        if ext == ".pdf":
            page_blocks = self._extract_pdf_blocks(data)

        logger.info(
            "preprocessor_done",
            filename=filename,
            elapsed_s=round(time.monotonic() - t0, 2),
            text_chars=len(text_content),
            page_blocks=len(page_blocks),
            images=len(images),
        )

        return ProcessedFile(
            text_content=text_content,
            images=images,
            mime_type=mime_type,
            file_name=filename,
            page_blocks=page_blocks,
        )

    def _extract_pdf_blocks(self, data: bytes) -> list[dict]:
        try:
            import fitz  # pymupdf
            blocks = []
            with fitz.open(stream=data, filetype="pdf") as doc:
                for page_num, page in enumerate(doc, start=1):
                    for b in page.get_text("blocks"):
                        x0, y0, x1, y1, text, block_no, block_type = b[:7]
                        if block_type == 0 and text.strip():
                            blocks.append({"page": page_num, "text": text.strip()})
            return blocks
        except Exception as exc:
            logger.warning("pdf_block_extraction_failed", error=str(exc))
            return []

    def _process_pdf(self, data: bytes, filename: str) -> ProcessedFile:
        b64 = base64.b64encode(data).decode("utf-8")
        return ProcessedFile(
            text_content="",
            images=[{
                "type": "file",
                "file": {"file_data": f"data:application/pdf;base64,{b64}"},
            }],
            mime_type="application/pdf",
            file_name=filename,
            page_blocks=self._extract_pdf_blocks(data),
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
        allowed = MARKITDOWN_EXTENSIONS if config.preprocessor == "markitdown" else SUPPORTED_EXTENSIONS
        return Path(filename).suffix.lower() in allowed
