---
title: "Server: Citations"
status: synced
version: "2.0"
last-modified: "2026-04-21T00:00:00.000Z"
---

# Citations — Server

Every extracted field is anchored to its source: the exact source-text snippet the LLM relied on, a per-field confidence score, and (for PDFs) the page number. Trust is a public API primitive in Sifter OSS, not a UI feature — any client (developer integration, admin UI, `sifter-cloud` drill-down, AI agent) can answer "where does this value come from?" using only public endpoints.

## Citation shape

Stored alongside `extracted_data` on each `SiftResult`, keyed by field name:

```json
{
  "document_id": "doc_…",
  "source_text": "Acme Ltd.",
  "page": 1,
  "confidence": 0.95,
  "inferred": false
}
```

| Field | Required? | Meaning |
|-------|-----------|---------|
| `document_id` | yes | Always the source document — set even when multi-document extraction spans several files. |
| `source_text` | yes | The raw snippet as it appears in the document, as returned by the extraction agent. |
| `page` | optional | 1-indexed page within the document. Present for PDFs; absent for flat-text formats (docx, html, md, txt, csv). For images, always `1` when present. |
| `confidence` | optional | LLM self-assessment of extraction reliability, `[0.0, 1.0]`. Absent when the provider cannot supply it. The resolver caps this at `0.7` when fuzzy matching was needed. |
| `inferred` | optional | `true` when `source_text` did not verbatim-match any parsed text block and fuzzy match was used instead. `false` for verbatim matches. Absent when no text-layer verification was possible (non-PDF formats). |

Fields with no resolvable citation are absent from the `citations` map. Consumers must treat missing fields as "unknown", never as "no source".

### Reserved fields

`bbox` (`[x1, y1, x2, y2]` normalised to `[0..1]`) is reserved in the contract for a future click-to-highlight feature on PDFs. It is **not populated** in the current version and will never appear in API responses until an explicit CR ships it. Consumers should not rely on its presence.

The `page_count()` / `page_image()` endpoints from CR-027 remain in the API for future use; they are not consumed by the v1 trust UI.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sifts/{sift_id}/records/{record_id}/citations` | Citation map for one record |
| GET | `/api/documents/{document_id}/pages` | Pages metadata (number, dimensions, thumbnail URLs) |
| GET | `/api/documents/{document_id}/pages/{n}/image` | Rendered page at `?dpi=150` (PNG) |

Auth required — same scope as document endpoints.

### Response shapes

```json
// GET /api/sifts/{sift_id}/records/{record_id}/citations
{
  "record_id": "rec_…",
  "document_id": "doc_…",
  "citations": { "<field>": { … citation … } }
}

// GET /api/documents/{document_id}/pages
{
  "document_id": "doc_…",
  "pages": [
    { "page": 1, "width": 1240, "height": 1754, "image_url": "/api/documents/doc_…/pages/1/image" },
    …
  ]
}
```

Records returned by `GET /api/sifts/{sift_id}/records` also embed their `citations` map inline — the dedicated endpoint is for drill-down when the record is already loaded.

## Extraction pipeline

1. For PDFs, parsing extracts per-block text with page numbers via `pymupdf`. The blocks contain only `{page, text}` — geometry is not extracted in v1.
2. The extraction agent prompt asks the LLM to return, alongside each extracted field value, the `source_text` span it relied on and a per-field `confidence` score. The LLM never produces coordinates.
3. `citation_resolver.py` maps each LLM-provided span → `page` + `inferred` flag by searching the parsed text blocks: verbatim match → `inferred: false`; fuzzy token-overlap match → `inferred: true`, `confidence` capped at 0.7; no match → no `page`/`inferred`, log `citation_unresolved` warning.
4. For non-PDF formats (images, docx, html, md, txt, csv) there are no parsed text blocks. The LLM's `source_text` + `confidence` are passed through directly; `page` and `inferred` are absent.
5. Fields whose LLM citation is entirely missing are omitted from the `citations` map. The field still appears in `extracted_data`.

The pipeline is LLM-provider agnostic.

## Page rendering

`GET /api/documents/{document_id}/pages/{n}/image` renders the page on first request and caches the result in blob storage keyed by `{document_id}/pages/{n}@{dpi}.png`. Subsequent requests serve from cache. Default DPI is 150; clients may request up to 300.

For non-PDF documents (JPEG, PNG, single-page TIFF), the endpoint returns the image itself with `page=1` only.

These endpoints exist for future use (click-to-highlight on PDF pages). The v1 trust UI does not call them.

## Backfill

Records created before this CR lack citations. `POST /api/sifts/{id}/reindex` re-runs the full pipeline and populates citations for all existing documents. The response endpoint returns `{ "citations": {} }` for records not yet reindexed — consumers treat an empty map the same as "fields with no citation".

## SDK surface

Python:

```python
sift.record(record_id).citations()                # dict { field: citation }
sift.document(document_id).page_count()
sift.document(document_id).page_image(page, dpi=150)  # bytes
```

TypeScript (mirrors shape, camelCased).

## MCP

`get_record_citations(sift_id: str, record_id: str)` is added to the MCP read tools — agents can fetch citations to justify an answer.

## Client rendering

The v1 trust UI renders the `source_text` snippet inline in the record detail modal, with a confidence badge and an optional `page N` footer for PDFs. No bbox overlay is shown. See `product/features/frontend/records.md` for the full UI spec.

Future: when click-to-highlight ships, consumers will draw a `bbox` overlay on top of the page image. The page image endpoints are already in place for this.

## Limits (v1)

- One primary span per field. Multi-span citations (a value drawn from several page regions) defer to a future CR.
- OCR is not performed. Images and scan-only PDFs (no text layer) yield no verbatim/fuzzy verification; citations have `source_text` + `confidence` from the LLM only.
- `bbox` is reserved — not populated.
- No redaction of rendered page images.
