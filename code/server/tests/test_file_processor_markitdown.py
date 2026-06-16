"""Tests for the markitdown preprocessing path in FileProcessor.

A fake `markitdown` module is injected so these tests don't depend on the real
package being installed and assert the branching/attachment logic deterministically.
"""
import sys
import types

import pytest

from sifter.config import config
from sifter.services.file_processor import (
    FileProcessor,
    MARKITDOWN_EXTENSIONS,
    SUPPORTED_EXTENSIONS,
)


@pytest.fixture
def markitdown_mode(monkeypatch):
    monkeypatch.setattr(config, "preprocessor", "markitdown")
    monkeypatch.setattr(config, "markitdown_ocr", False)
    monkeypatch.setattr(config, "markitdown_docintel_endpoint", "")


def _install_fake_markitdown(monkeypatch, text="# Converted\n\nbody"):
    """Inject a fake `markitdown` module returning fixed text_content."""
    captured = {}

    class _Result:
        def __init__(self, text):
            self.text_content = text

    class _MarkItDown:
        def __init__(self, **kwargs):
            captured["init_kwargs"] = kwargs

        def convert_stream(self, stream, file_extension=None, **kw):
            captured["file_extension"] = file_extension
            captured["data"] = stream.read()
            return _Result(text)

    fake = types.ModuleType("markitdown")
    fake.MarkItDown = _MarkItDown
    monkeypatch.setitem(sys.modules, "markitdown", fake)
    return captured


def test_markitdown_text_only_for_docx(markitdown_mode, monkeypatch):
    _install_fake_markitdown(monkeypatch, text="# Doc\n\nClient: Acme")
    result = FileProcessor().process(b"fake docx", "report.docx")
    assert "Acme" in result.text_content
    assert result.images == []          # text-only → any model works
    assert result.page_blocks == []


def test_markitdown_pdf_keeps_image_and_blocks(markitdown_mode, monkeypatch):
    captured = _install_fake_markitdown(monkeypatch, text="Invoice total 1500")
    # Avoid real pymupdf — stub block extraction.
    monkeypatch.setattr(
        FileProcessor,
        "_extract_pdf_blocks",
        lambda self, data: [{"page": 1, "text": "Invoice total 1500"}],
    )
    result = FileProcessor().process(b"%PDF-1.4 fake", "invoice.pdf")
    assert "Invoice total 1500" in result.text_content
    assert len(result.images) == 1                       # image still attached
    assert result.images[0]["type"] == "file"
    assert result.page_blocks and result.page_blocks[0]["page"] == 1
    assert captured["file_extension"] == ".pdf"


def test_markitdown_image_stays_multimodal(markitdown_mode, monkeypatch):
    _install_fake_markitdown(monkeypatch, text="")
    result = FileProcessor().process(b"\x89PNG fake", "photo.png")
    assert len(result.images) == 1
    assert result.images[0]["type"] == "image_url"
    assert result.images[0]["image_url"]["url"].startswith("data:image/png;base64,")


def test_markitdown_unlocks_new_formats(markitdown_mode):
    fp = FileProcessor()
    assert fp.is_supported("sheet.xlsx") is True
    assert fp.is_supported("deck.pptx") is True
    assert fp.is_supported("archive.zip") is True
    assert fp.is_supported("audio.mp3") is True


def test_native_mode_does_not_unlock_new_formats(monkeypatch):
    monkeypatch.setattr(config, "preprocessor", "native")
    fp = FileProcessor()
    assert fp.is_supported("sheet.xlsx") is False
    assert fp.is_supported("archive.zip") is False


def test_markitdown_missing_raises_clear_error(markitdown_mode, monkeypatch):
    # Simulate markitdown not installed (None in sys.modules → ImportError on import).
    monkeypatch.setitem(sys.modules, "markitdown", None)
    with pytest.raises(RuntimeError, match="markitdown"):
        FileProcessor().process(b"data", "report.docx")


def test_markitdown_extensions_are_superset():
    assert SUPPORTED_EXTENSIONS <= MARKITDOWN_EXTENSIONS
    assert ".xlsx" in MARKITDOWN_EXTENSIONS
    assert ".xlsx" not in SUPPORTED_EXTENSIONS


# ── real integration: image-bearing PDFs through the actual markitdown ─────────

def _pdf_with_text_and_image() -> bytes:
    """A PDF with a real text layer plus an embedded raster image."""
    import fitz
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 90), "INVOICE #2026-0042", fontsize=16)
    page.insert_text((72, 120), "Vendor: ACME Corp", fontsize=12)
    page.insert_text((72, 140), "Total: 1500.00 EUR", fontsize=12)
    # Build a small pixmap and embed it as an image.
    img = fitz.open()
    ip = img.new_page(width=120, height=80)
    ip.draw_rect(ip.rect, fill=(0.2, 0.4, 0.8))
    pix = ip.get_pixmap()
    img.close()
    page.insert_image(fitz.Rect(72, 170, 192, 250), pixmap=pix)
    data = doc.tobytes()
    doc.close()
    return data


def _scanned_pdf_no_text_layer() -> bytes:
    """An image-only PDF: text rasterized into a full-page image, no text layer."""
    import fitz
    src = fitz.open()
    p = src.new_page()
    p.insert_text((72, 100), "SCANNED INVOICE #2026-0099", fontsize=16)
    pix = p.get_pixmap(dpi=120)
    src.close()
    out = fitz.open()
    page = out.new_page(width=pix.width, height=pix.height)
    page.insert_image(page.rect, pixmap=pix)
    data = out.tobytes()
    out.close()
    return data


def test_markitdown_real_pdf_text_and_image(markitdown_mode):
    """Real markitdown on a text+image PDF: text is extracted AND image stays attached."""
    pytest.importorskip("markitdown")
    result = FileProcessor().process(_pdf_with_text_and_image(), "invoice.pdf")
    assert "ACME" in result.text_content          # text layer extracted
    assert len(result.images) == 1                # image kept for vision models
    assert result.images[0]["type"] == "file"
    assert len(result.page_blocks) > 0            # citation grounding preserved


def test_markitdown_real_scanned_pdf_keeps_image(markitdown_mode):
    """Real markitdown on an image-only PDF: no text layer, but image stays attached."""
    pytest.importorskip("markitdown")
    result = FileProcessor().process(_scanned_pdf_no_text_layer(), "scanned.pdf")
    # No selectable text without OCR — the multimodal image block is what carries content.
    assert result.text_content.strip() == ""
    assert len(result.images) == 1
    assert result.images[0]["type"] == "file"
