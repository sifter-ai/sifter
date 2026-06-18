---
title: "markitdown preprocessing step (text-first indexing)"
status: applied
author: "Bruno Fortunato"
created-at: "2026-06-16T00:00:00.000Z"
---

## Summary

Introduce a selectable **preprocessing step** that converts uploaded documents to **Markdown text**
using [microsoft/markitdown](https://github.com/microsoft/markitdown), so the indexing step can feed
**text** (not base64 documents) to the extractor LLM. This makes Sifter compatible with text-only and
cheaper models, lightens payloads, and unlocks many more input formats (Office, audio, EPub, ZIP,
JSON/XML, …).

Selectable via `SIFTER_PREPROCESSOR` (`native` | `markitdown`), **default `markitdown`**.

Images stay multimodal: for visual formats (PDF, images) the processor attaches **both** the extracted
Markdown text **and** the original image/file block, so vision models keep full capability while
text-only models still receive text.

## Motivation

Today extraction is bound to multimodal models: PDFs and images are sent as base64 blocks and
`sift_agent.extract()` builds a `text + images` message. This locks Sifter to vision models, produces
heavy/expensive payloads, and supports a narrow set of formats. A markitdown preprocessing layer
decouples extraction from vision, reduces token cost, and broadens format coverage with minimal change
to the indexing code.

## Detailed Design

### Config (`config.py`)
- `preprocessor: str = "markitdown"` — env `SIFTER_PREPROCESSOR`, values `native` | `markitdown`.
- `markitdown_ocr: bool = False` — env `SIFTER_MARKITDOWN_OCR`; when true, markitdown is given the
  extractor model as `llm_client`/`llm_model` for image/PDF captioning.
- `markitdown_docintel_endpoint: str = ""` — env `SIFTER_MARKITDOWN_DOCINTEL_ENDPOINT`; optional Azure
  Document Intelligence endpoint for real OCR.

### Preprocessing (`file_processor.py`)
- `process()` branches at the top: `preprocessor == "markitdown"` → `_process_markitdown`, else current path.
- `_process_markitdown(data, filename)`:
  - `MarkItDown(...).convert_stream(BytesIO(data), file_extension=ext).text_content` → `text_content`.
  - For visual formats (pdf, png/jpg/jpeg/tiff/tif/webp) ALSO attach the image/file block (reuse existing
    image/base64-PDF builders) → `images` non-empty.
  - For PDFs keep `page_blocks` via `_extract_pdf_blocks` (pymupdf) for citation grounding.
  - Lazy import; clear error if markitdown missing (`pip install markitdown[all]`).
- New `MARKITDOWN_EXTENSIONS` set extends `is_supported()`/`SUPPORTED_EXTENSIONS` when in markitdown mode
  (xlsx, xls, pptx, ppt, epub, zip, json, xml, msg, mp3, wav, …). Native mode unchanged.

### Indexing (`sift_agent.py`)
No change. It already sends `text_content` + `images`; with text-only documents `images=[]`, so a
text-only model works automatically.

### GCS URI shortcut
`document_processor.py` and `sift_service.py` must NOT pass the `gs://` URI to the model when
`preprocessor == "markitdown"` (markitdown needs bytes). Add `and config.preprocessor != "markitdown"`
to both `_use_gcs_uri` conditions.

### Dependency (`pyproject.toml`)
Add `markitdown[all]` to core dependencies (default-on). Document the size trade-off.

## Files

### Product / system docs
- `system/architecture.md` — preprocessing step (native|markitdown); indexing receives text (+images for visual formats).
- `product/features/server/extraction.md` — extended formats, `SIFTER_PREPROCESSOR`, text-only vs multimodal, optional OCR.
- `system/deployment.md` — new env vars and `markitdown[all]` dependency.

### Code
- `code/server/sifter/config.py` — `preprocessor`, `markitdown_ocr`, `markitdown_docintel_endpoint`.
- `code/server/sifter/services/file_processor.py` — markitdown branch, `_process_markitdown`, extended extension set.
- `code/server/sifter/services/document_processor.py` — guard `_use_gcs_uri` against markitdown.
- `code/server/sifter/services/sift_service.py` — guard `_use_gcs_uri` against markitdown.
- `code/server/pyproject.toml` — `markitdown[all]` dependency.
- `code/server/.env.example` — new env vars.
- `code/server/tests/test_file_processor.py` — markitdown conversion tests.

## Acceptance Criteria

1. With `SIFTER_PREPROCESSOR=markitdown` (default), a `.docx`/`.xlsx`/`.pptx`/`.html`/`.csv` file is
   converted to Markdown and the extractor receives **text only** (`images == []`).
2. A `.pdf` produces Markdown text AND keeps an attached file/image block AND `page_blocks` for citations.
3. A pure image (`.png`/`.jpg`) keeps its multimodal image block (text may be empty without OCR enabled).
4. New formats (xlsx, pptx, epub, zip, json, xml, audio) pass `is_supported()` only in markitdown mode.
5. With `SIFTER_PREPROCESSOR=native` behaviour is identical to today (no markitdown import).
6. When markitdown is active, the GCS `gs://` URI shortcut is disabled (document bytes are loaded).
7. Extraction with a text-only model succeeds on text-extractable documents.
8. Missing markitdown install yields a clear, actionable error.
9. Tests pass for the scenarios above.

## Out of Scope

- URL-based ingestion (YouTube/web) — markitdown supports it but Sifter uploads are file-bytes; needs a new ingestion path.
- Frontend changes (the upload UI is format-agnostic; only `is_supported` widens server-side).
- Making markitdown OCR (LLM/Azure) the default — it remains opt-in via `SIFTER_MARKITDOWN_OCR` / docintel.
- sifter-cloud changes (separate repo/CR if needed).
