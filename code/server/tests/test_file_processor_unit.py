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
