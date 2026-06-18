"""Tests for the markitdown preprocessing path in FileProcessor.

A fake `markitdown` module is injected so these tests don't depend on the real
package being installed and assert the branching/attachment logic deterministically.
"""
import sys
import types
from unittest.mock import MagicMock, patch

import pytest

from sifter.config import SifterConfig, config
from sifter.services.file_processor import (
    FileProcessor,
    MARKITDOWN_EXTENSIONS,
    SUPPORTED_EXTENSIONS,
    _LiteLLMClient,
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
    assert result.images == []                           # markitdown mode: text only, no raw PDF block
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
    """Real markitdown on a text+image PDF: text is extracted, no raw PDF block attached."""
    pytest.importorskip("markitdown")
    result = FileProcessor().process(_pdf_with_text_and_image(), "invoice.pdf")
    assert "ACME" in result.text_content          # text layer extracted
    assert result.images == []                    # markitdown mode: text only, vision model not needed
    assert len(result.page_blocks) > 0            # citation grounding preserved


def test_markitdown_real_scanned_pdf_no_text_no_images(markitdown_mode):
    """Real markitdown on an image-only PDF without OCR: no text content, no images attached.
    OCR must be enabled (SIFTER_MARKITDOWN_OCR=true) to extract content from scanned PDFs."""
    pytest.importorskip("markitdown")
    result = FileProcessor().process(_scanned_pdf_no_text_layer(), "scanned.pdf")
    assert result.images == []          # markitdown mode never attaches raw PDF
    assert result.page_blocks == []     # no text layer → no blocks


# ── _LiteLLMClient structure ─────────────────────────────────────────────────

def test_litellm_client_has_openai_compatible_interface():
    """_LiteLLMClient exposes chat.completions.create matching the OpenAI SDK shape."""
    client = _LiteLLMClient()
    assert hasattr(client, "chat")
    assert hasattr(client.chat, "completions")
    assert callable(client.chat.completions.create)


def test_litellm_client_create_calls_litellm(monkeypatch):
    """chat.completions.create delegates to litellm.completion with ocr api_kwargs."""
    import litellm as _litellm_mod

    mock_completion = MagicMock(return_value="response")
    monkeypatch.setattr(_litellm_mod, "completion", mock_completion)
    monkeypatch.setattr(config, "ocr_api_key", "fw_testkey")
    monkeypatch.setattr(config, "ocr_base_url", "https://api.example.com/v1")

    client = _LiteLLMClient()
    msgs = [{"role": "user", "content": "describe this image"}]
    client.chat.completions.create(model="openai/test-model", messages=msgs)

    mock_completion.assert_called_once()
    call_kwargs = mock_completion.call_args
    assert call_kwargs.kwargs["model"] == "openai/test-model"
    assert call_kwargs.kwargs["messages"] == msgs


# ── OCR wiring in _build_markitdown ──────────────────────────────────────────

def test_build_markitdown_passes_litellm_client_when_ocr_enabled(monkeypatch):
    """When markitdown_ocr=True, _build_markitdown injects _LiteLLMClient and ocr_model."""
    monkeypatch.setattr(config, "preprocessor", "markitdown")
    monkeypatch.setattr(config, "markitdown_ocr", True)
    monkeypatch.setattr(config, "ocr_model", "openai/accounts/fireworks/models/minimax-m3")
    monkeypatch.setattr(config, "markitdown_docintel_endpoint", "")

    captured = {}

    class _FakeMarkItDown:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    fake = types.ModuleType("markitdown")
    fake.MarkItDown = _FakeMarkItDown
    monkeypatch.setitem(sys.modules, "markitdown", fake)

    FileProcessor()._build_markitdown()

    assert "llm_client" in captured
    assert isinstance(captured["llm_client"], _LiteLLMClient)
    assert captured["llm_model"] == "openai/accounts/fireworks/models/minimax-m3"
    assert captured.get("enable_plugins") is True


def test_build_markitdown_no_ocr_client_when_disabled(monkeypatch):
    """When markitdown_ocr=False, no llm_client is passed to MarkItDown."""
    monkeypatch.setattr(config, "preprocessor", "markitdown")
    monkeypatch.setattr(config, "markitdown_ocr", False)
    monkeypatch.setattr(config, "markitdown_docintel_endpoint", "")

    captured = {}

    class _FakeMarkItDown:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    fake = types.ModuleType("markitdown")
    fake.MarkItDown = _FakeMarkItDown
    monkeypatch.setitem(sys.modules, "markitdown", fake)

    FileProcessor()._build_markitdown()

    assert "llm_client" not in captured
    assert "llm_model" not in captured


# ── Image bypass (standalone images skip markitdown entirely) ─────────────────

def test_image_bypasses_markitdown_and_not_calls_convert(markitdown_mode, monkeypatch):
    """PNG/JPG files go directly to _process_image; markitdown.convert_stream is never called."""
    captured = _install_fake_markitdown(monkeypatch, text="should not appear")

    result = FileProcessor().process(b"\x89PNG\r\n", "photo.png")

    # markitdown was never invoked
    assert "data" not in captured
    # image block is present with correct mime type
    assert len(result.images) == 1
    assert result.images[0]["type"] == "image_url"
    assert "data:image/png;base64," in result.images[0]["image_url"]["url"]
    assert result.text_content == ""


@pytest.mark.parametrize("filename,expected_mime", [
    ("scan.jpg", "data:image/jpeg;base64,"),
    ("scan.jpeg", "data:image/jpeg;base64,"),
    ("photo.webp", "data:image/webp;base64,"),
    ("doc.tiff", "data:image/tiff;base64,"),
])
def test_image_extensions_bypass_markitdown(markitdown_mode, monkeypatch, filename, expected_mime):
    """All image extensions bypass markitdown and return a base64 image_url block."""
    captured = _install_fake_markitdown(monkeypatch, text="should not appear")
    result = FileProcessor().process(b"fake image data", filename)
    assert "data" not in captured
    assert len(result.images) == 1
    assert result.images[0]["image_url"]["url"].startswith(expected_mime)


# ── ocr_model fallback in config ──────────────────────────────────────────────

def test_ocr_model_falls_back_to_extractor_model():
    """When ocr_model is empty, it resolves to extractor_model at init time."""
    cfg = SifterConfig(
        default_model="vertex_ai/gemini-2.5-flash",
        extractor_model="openai/gpt-4o",
        ocr_model="",
        _env_file=None,
    )
    assert cfg.ocr_model == "openai/gpt-4o"


def test_ocr_model_explicit_value_not_overridden():
    """An explicit ocr_model is kept as-is, not replaced by extractor_model."""
    cfg = SifterConfig(
        default_model="vertex_ai/gemini-2.5-flash",
        extractor_model="openai/gpt-4o",
        ocr_model="openai/accounts/fireworks/models/minimax-m3",
        _env_file=None,
    )
    assert cfg.ocr_model == "openai/accounts/fireworks/models/minimax-m3"


def test_ocr_model_falls_back_via_extractor_to_default():
    """When both ocr_model and extractor_model are empty, both resolve to default_model."""
    cfg = SifterConfig(
        default_model="vertex_ai/gemini-2.5-flash",
        extractor_model="",
        ocr_model="",
        _env_file=None,
    )
    assert cfg.extractor_model == "vertex_ai/gemini-2.5-flash"
    assert cfg.ocr_model == "vertex_ai/gemini-2.5-flash"


# ── /api/config supportedExtensions ──────────────────────────────────────────

def test_config_endpoint_returns_markitdown_extensions_when_markitdown_mode(monkeypatch):
    """GET /api/config returns MARKITDOWN_EXTENSIONS when preprocessor=markitdown."""
    from fastapi.testclient import TestClient
    from fastapi import FastAPI
    from sifter.api.config import router

    monkeypatch.setattr(config, "preprocessor", "markitdown")
    monkeypatch.setattr(config, "google_client_id", "")

    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as c:
        r = c.get("/api/config")
    assert r.status_code == 200
    data = r.json()
    assert ".xlsx" in data["supportedExtensions"]
    assert ".pptx" in data["supportedExtensions"]
    assert ".mp3" in data["supportedExtensions"]
    assert ".pdf" in data["supportedExtensions"]
    assert data["supportedExtensions"] == sorted(data["supportedExtensions"])


def test_config_endpoint_returns_base_extensions_in_native_mode(monkeypatch):
    """GET /api/config returns only SUPPORTED_EXTENSIONS when preprocessor=native."""
    from fastapi.testclient import TestClient
    from fastapi import FastAPI
    from sifter.api.config import router

    monkeypatch.setattr(config, "preprocessor", "native")
    monkeypatch.setattr(config, "google_client_id", "")

    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as c:
        r = c.get("/api/config")
    assert r.status_code == 200
    data = r.json()
    assert ".xlsx" not in data["supportedExtensions"]
    assert ".mp3" not in data["supportedExtensions"]
    assert ".pdf" in data["supportedExtensions"]
    assert ".png" in data["supportedExtensions"]
