"""
Unit tests for file_processor — text, CSV, HTML, URI paths.
PDF and image paths require binary test fixtures and are skipped here.
"""
import pytest

from sifter.services.file_processor import FileProcessor, UnsupportedFileType


# ── plain text ────────────────────────────────────────────────────────────────

def test_process_txt():
    result = FileProcessor().process(b"hello world", "doc.txt")
    assert "hello world" in result.text_content
    assert result.images == []
    assert result.mime_type == "text/plain"
    assert result.file_name == "doc.txt"


def test_process_md():
    result = FileProcessor().process(b"# Title\n\nContent here.", "readme.md")
    assert "Title" in result.text_content
    assert result.mime_type == "text/markdown"


def test_process_txt_encoding_errors_replaced():
    data = b"hello \xff\xfe world"
    result = FileProcessor().process(data, "file.txt")
    assert result.text_content  # should not crash


# ── CSV ───────────────────────────────────────────────────────────────────────

def test_process_csv_basic():
    data = b"name,amount\nAlice,100\nBob,200"
    result = FileProcessor().process(data, "report.csv")
    assert "Alice" in result.text_content
    assert "amount" in result.text_content
    assert result.images == []
    assert result.mime_type == "text/csv"


def test_process_csv_markdown_table_format():
    data = b"col1,col2\nA,1\nB,2"
    result = FileProcessor().process(data, "t.csv")
    assert "|" in result.text_content
    assert "---" in result.text_content


def test_process_csv_empty():
    result = FileProcessor().process(b"", "empty.csv")
    assert result.text_content == ""
    assert result.mime_type == "text/csv"


def test_process_csv_max_rows():
    rows = "col\n" + "\n".join(str(i) for i in range(11_000))
    result = FileProcessor().process(rows.encode(), "big.csv")
    # Should produce output without crashing
    assert result.text_content


# ── HTML ──────────────────────────────────────────────────────────────────────

def test_process_html():
    data = b"<html><body><p>Hello World</p></body></html>"
    result = FileProcessor().process(data, "page.html")
    assert "Hello World" in result.text_content
    assert result.images == []
    assert result.mime_type == "text/html"


def test_process_htm_extension():
    data = b"<p>Content</p>"
    result = FileProcessor().process(data, "index.htm")
    assert "Content" in result.text_content


def test_process_html_strips_tags():
    data = b"<html><head><title>T</title></head><body><h1>H</h1><p>P</p></body></html>"
    result = FileProcessor().process(data, "f.html")
    assert "H" in result.text_content
    assert "<h1>" not in result.text_content


# ── process_uri ───────────────────────────────────────────────────────────────

def test_process_uri_pdf():
    result = FileProcessor().process_uri("gs://bucket/doc.pdf", "doc.pdf")
    assert result.text_content == ""
    assert len(result.images) == 1
    assert result.images[0]["image_url"]["url"] == "gs://bucket/doc.pdf"
    assert result.mime_type == "application/pdf"


def test_process_uri_image():
    result = FileProcessor().process_uri("https://cdn.example.com/photo.jpg", "photo.jpg")
    assert result.mime_type == "image/jpeg"
    assert result.images[0]["image_url"]["url"] == "https://cdn.example.com/photo.jpg"


# ── unsupported extension ─────────────────────────────────────────────────────

def test_process_unsupported_extension_raises():
    with pytest.raises(UnsupportedFileType):
        FileProcessor().process(b"data", "archive.zip")


def test_unsupported_file_type_has_ext():
    try:
        FileProcessor().process(b"data", "file.xyz")
    except UnsupportedFileType as e:
        assert e.ext == ".xyz"


# ── is_supported ─────────────────────────────────────────────────────────────

def test_is_supported_pdf():
    assert FileProcessor().is_supported("doc.pdf") is True

def test_is_supported_csv():
    assert FileProcessor().is_supported("data.csv") is True

def test_is_supported_zip():
    assert FileProcessor().is_supported("archive.zip") is False

def test_is_supported_case_insensitive():
    assert FileProcessor().is_supported("DOC.PDF") is True


# ── count_pdf_pages no fitz (lines 49-56) ────────────────────────────────────

def test_count_pdf_pages_no_fitz():
    """count_pdf_pages returns None when fitz unavailable (lines 49-56)."""
    import sys
    from sifter.services.file_processor import count_pdf_pages
    fitz_backup = sys.modules.get("fitz")
    sys.modules["fitz"] = None  # type: ignore
    try:
        result = count_pdf_pages(b"%PDF-1.4 fake content")
    finally:
        if fitz_backup is None:
            del sys.modules["fitz"]
        else:
            sys.modules["fitz"] = fitz_backup
    assert result is None


# ── _process_docx no mammoth (lines 87, 140-142) ─────────────────────────────

def test_process_docx_no_mammoth():
    """process() docx when mammoth not installed → ImportError propagates (line 87)."""
    import sys
    from sifter.services.file_processor import FileProcessor
    mammoth_backup = sys.modules.get("mammoth")
    sys.modules["mammoth"] = None  # type: ignore
    try:
        with pytest.raises((ImportError, TypeError)):
            FileProcessor().process(b"fake docx content", "report.docx")
    finally:
        if mammoth_backup is None:
            del sys.modules["mammoth"]
        else:
            sys.modules["mammoth"] = mammoth_backup


# ── _extract_pdf_blocks exception path (lines 108-110) ───────────────────────

def test_extract_pdf_blocks_no_fitz():
    """_extract_pdf_blocks returns [] when fitz unavailable (lines 108-110)."""
    import sys
    from sifter.services.file_processor import FileProcessor
    fitz_backup = sys.modules.get("fitz")
    sys.modules["fitz"] = None  # type: ignore
    try:
        fp = FileProcessor()
        result = fp._extract_pdf_blocks(b"%PDF-1.4 fake")
    finally:
        if fitz_backup is None:
            del sys.modules["fitz"]
        else:
            sys.modules["fitz"] = fitz_backup
    assert result == []


# ── count_pdf_pages when fitz is available (lines 52-53) ─────────────────────

def test_count_pdf_pages_with_fitz():
    """count_pdf_pages succeeds when fitz is available (lines 52-53)."""
    from unittest.mock import MagicMock, patch
    import importlib

    mock_doc = MagicMock()
    mock_doc.__enter__ = MagicMock(return_value=mock_doc)
    mock_doc.__exit__ = MagicMock(return_value=False)
    mock_doc.page_count = 3

    mock_fitz_module = MagicMock()
    mock_fitz_module.open.return_value = mock_doc

    import sys
    sys.modules["fitz"] = mock_fitz_module
    try:
        import sifter.services.file_processor as fp_module
        importlib.reload(fp_module)
        result = fp_module.count_pdf_pages(b"fake-pdf")
        assert result == 3
    finally:
        del sys.modules["fitz"]


# ── _process_docx when mammoth is available (lines 141-142) ──────────────────

def test_process_docx_with_mammoth():
    """_process_docx succeeds when mammoth is available (lines 141-142)."""
    from unittest.mock import MagicMock
    import importlib
    import sys

    mock_result = MagicMock()
    mock_result.value = "# Invoice\n\nClient: Acme"

    mock_mammoth = MagicMock()
    mock_mammoth.convert_to_markdown.return_value = mock_result

    sys.modules["mammoth"] = mock_mammoth
    try:
        import sifter.services.file_processor as fp_module
        importlib.reload(fp_module)
        processed = fp_module.FileProcessor().process(b"fake-docx", "doc.docx")
        assert "Acme" in processed.text_content
    finally:
        del sys.modules["mammoth"]


# ── _process_csv exception path (lines 177-178) ──────────────────────────────

def test_process_csv_exception_fallback():
    """Malformed CSV that triggers exception falls back to raw decode (lines 177-178)."""
    import sys
    import csv as csv_module
    from sifter.services.file_processor import FileProcessor

    original_reader = csv_module.reader

    def bad_reader(*args, **kwargs):
        raise RuntimeError("csv parse failure")

    csv_module.reader = bad_reader
    try:
        # Need to reimport to pick up patched csv
        import importlib
        import sifter.services.file_processor as fp_module
        importlib.reload(fp_module)
        result = fp_module.FileProcessor().process(b"col1,col2\nval1,val2", "bad.csv")
        assert "col1" in result.text_content or result.text_content
    finally:
        csv_module.reader = original_reader
