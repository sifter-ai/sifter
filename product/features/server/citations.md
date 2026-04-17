---
title: "Server: Citations"
status: synced
version: "1.0"
last-modified: "2026-04-17T00:00:00.000Z"
---

# Citations — Server

Every extracted field is anchored to its source: document, page, bounding box on that page, and the exact source-text snippet. Trust is a public API primitive in Sifter OSS, not a UI feature — any client (developer integration, admin UI, `sifter-cloud` drill-down, AI agent) can answer "where does this value come from?" using only public endpoints.

## Citation shape

Stored alongside `extracted_data` on each `SiftResult`, keyed by field name:

```json
{
  "document_id": "doc_…",
  "page": 1,
  "bbox": [0.12, 0.08, 0.44, 0.11],
  "source_text": "Acme Ltd.",
  "inferred": false
}
```

| Field | Meaning |
|-------|---------|
| `document_id` | Always the source document — set even when multi-document extraction spans several files. |
| `page` | 1-indexed page within the document. |
| `bbox` | Normalized `[x1, y1, x2, y2]` in `[0..1]`, relative to page width/height. |
| `source_text` | The raw snippet as it appears on the page. |
| `inferred` | `true` when the value was computed or inferred rather than directly quoted; `source_text` then holds the closest supporting text. Absent when `false`. |

Fields with no resolvable citation are absent from the `citations` map. Consumers must treat missing fields as "unknown", never as "no source".

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

1. Parsing enriches the parsed document representation with per-block/line `(page, bbox)` metadata. Backed by `pymupdf`.
2. The extraction agent prompt asks the LLM to return, alongside each extracted field, the source-text span it relied on.
3. `citation_resolver.py` maps each span → `(page, bbox)` by looking up the block/line coordinates from step 1. Verbatim match first; case-insensitive, whitespace-normalized fuzzy match as fallback.
4. Unresolvable spans drop from the citation map and log a structured warning. The field still appears in `extracted_data`.

The pipeline is LLM-provider agnostic — providers with structured-span outputs skip the fuzzy-match step; others rely on it.

## Page rendering

`GET /api/documents/{document_id}/pages/{n}/image` renders the page on first request and caches the result in blob storage keyed by `{document_id}/pages/{n}@{dpi}.png`. Subsequent requests serve from cache. Default DPI is 150; clients may request up to 300.

For non-PDF documents (JPEG, PNG, single-page TIFF), the endpoint returns the image itself with `page=1` only.

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

Consumers draw an overlay on top of the page image using normalized `bbox`:

```ts
const url = `/api/documents/${doc}/pages/${c.page}/image`;
// position a div at bbox * pageSize as a highlight
```

A runnable vanilla-JS example ships with `docs/concepts/citations.mdx`. `sifter-cloud` ships a production React component; OSS does not bundle one.

## Limits (v1)

- One primary span per field. Multi-span citations (a value drawn from several page regions) defer to a future CR.
- OCR is not performed. Scan-only pages with no text layer yield no citations.
- No redaction of rendered page images.
