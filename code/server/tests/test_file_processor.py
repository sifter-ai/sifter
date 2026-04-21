"""Tests for FileProcessor PDF block extraction."""
import pytest
from sifter.services.file_processor import FileProcessor


def _make_minimal_pdf() -> bytes:
    """Create a minimal valid PDF with one text page using pymupdf."""
    import fitz
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Invoice date: 2026-01-15\nTotal: 1500 EUR")
    return doc.tobytes()


def test_pdf_blocks_populated():
    data = _make_minimal_pdf()
    processor = FileProcessor()
    result = processor.process(data, "invoice.pdf")
    assert len(result.page_blocks) > 0
    for block in result.page_blocks:
        assert "page" in block
        assert "text" in block
        assert isinstance(block["page"], int)
        assert block["page"] >= 1
        assert isinstance(block["text"], str)
        assert len(block["text"]) > 0
        assert "bbox" not in block


def test_non_pdf_blocks_empty():
    processor = FileProcessor()
    result = processor.process(b"plain text content", "document.txt")
    assert result.page_blocks == []


def test_image_blocks_empty():
    import base64
    processor = FileProcessor()
    # minimal valid PNG (1x1 pixel)
    png_bytes = bytes([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
        0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
        0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
        0x44, 0xae, 0x42, 0x60, 0x82,
    ])
    result = processor.process(png_bytes, "photo.png")
    assert result.page_blocks == []
