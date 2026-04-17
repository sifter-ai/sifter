import base64
import io
from pathlib import Path
from typing import NamedTuple

import structlog

logger = structlog.get_logger()

SUPPORTED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".webp"}


class ProcessedFile(NamedTuple):
    text_content: str
    images: list[dict]  # list of {"type": "image_url", "image_url": {"url": "data:..."}}
    mime_type: str
    file_name: str
    page_blocks: list[dict] = []  # [{page, text, bbox, width, height}] for citation resolution


class FileProcessor:
    def process(self, file_path: str | Path) -> ProcessedFile:
        path = Path(file_path)
        ext = path.suffix.lower()

        if ext == ".pdf":
            return self._process_pdf(path)
        elif ext in {".png", ".jpg", ".jpeg", ".tiff", ".tif", ".webp"}:
            return self._process_image(path)
        else:
            return self._process_text(path)

    def _process_pdf(self, path: Path) -> ProcessedFile:
        try:
            import fitz  # pymupdf

            doc = fitz.open(str(path))
            text_parts = []
            images = []
            page_blocks = []

            for page_num, page in enumerate(doc):
                text = page.get_text()
                if text.strip():
                    text_parts.append(f"--- Page {page_num + 1} ---\n{text}")

                rect = page.rect
                # Collect text blocks for citation resolution
                for block in page.get_text("blocks"):
                    # block: (x0, y0, x1, y1, text, block_no, block_type)
                    if block[6] == 0 and block[4].strip():  # type 0 = text
                        page_blocks.append({
                            "page": page_num + 1,
                            "text": block[4].strip(),
                            "bbox": [block[0], block[1], block[2], block[3]],
                            "width": rect.width,
                            "height": rect.height,
                        })

                # Render page as image for vision models
                mat = fitz.Matrix(2.0, 2.0)  # 2x zoom for better quality
                pix = page.get_pixmap(matrix=mat)
                img_bytes = pix.tobytes("png")
                b64 = base64.b64encode(img_bytes).decode("utf-8")
                images.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{b64}"},
                })

            doc.close()
            return ProcessedFile(
                text_content="\n\n".join(text_parts),
                images=images,
                mime_type="application/pdf",
                file_name=path.name,
                page_blocks=page_blocks,
            )
        except ImportError:
            logger.warning("pymupdf not available, falling back to text-only PDF processing")
            return self._process_text(path)
        except Exception as e:
            logger.error("pdf_processing_error", path=str(path), error=str(e))
            raise

    def _process_image(self, path: Path) -> ProcessedFile:
        ext = path.suffix.lower()
        mime_map = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".tiff": "image/tiff",
            ".tif": "image/tiff",
            ".webp": "image/webp",
        }
        mime_type = mime_map.get(ext, "image/png")

        with open(path, "rb") as f:
            img_bytes = f.read()

        b64 = base64.b64encode(img_bytes).decode("utf-8")
        images = [{
            "type": "image_url",
            "image_url": {"url": f"data:{mime_type};base64,{b64}"},
        }]

        return ProcessedFile(
            text_content="",
            images=images,
            mime_type=mime_type,
            file_name=path.name,
        )

    def _process_text(self, path: Path) -> ProcessedFile:
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            logger.error("text_processing_error", path=str(path), error=str(e))
            raise
        return ProcessedFile(
            text_content=content,
            images=[],
            mime_type="text/plain",
            file_name=path.name,
        )

    def is_supported(self, file_path: str | Path) -> bool:
        return Path(file_path).suffix.lower() in SUPPORTED_EXTENSIONS
