---
title: "Citations API: per-field source anchoring (page, bbox, text)"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
---

## Summary

For every extracted field, record the source of the value: which document, which page, bounding box on that page, and the exact source text snippet. Expose this via a public Citations API so any client — OSS admin UI, developer integration, or `sifter-cloud` trust/drill-down UI — can answer "where does this number come from?" by rendering the original page with the cited region highlighted.

## Motivation

Trust is the prerequisite for the business-user product: a dashboard full of numbers with no link back to the source document is a demo, not a tool of record. From the dev-first OSS side, citations are also valuable: a developer integrating Sifter into their own product needs primitives to build "click the cell → see the source" in their UI. Building citations in OSS is therefore both a cloud-enabling move and a dev-experience upgrade.

The primitive belongs in OSS. Pushing it into Cloud would either duplicate logic or require a private API — both of which violate the CR-022 architectural rule "Cloud has no private APIs".

## Detailed Design

### Data model

Add a `citations` map alongside `extracted_data` on each `SiftResult`:

```json
{
  "id": "rec_...",
  "sift_id": "sift_...",
  "document_id": "doc_...",
  "extracted_data": {
    "client": "Acme Ltd",
    "total": 1423.50,
    "date": "2026-03-14"
  },
  "citations": {
    "client": {
      "document_id": "doc_...",
      "page": 1,
      "bbox": [0.12, 0.08, 0.44, 0.11],
      "source_text": "Acme Ltd."
    },
    "total": {
      "document_id": "doc_...",
      "page": 2,
      "bbox": [0.64, 0.82, 0.92, 0.86],
      "source_text": "Total: € 1.423,50"
    },
    "date": {
      "document_id": "doc_...",
      "page": 1,
      "bbox": [0.64, 0.05, 0.92, 0.08],
      "source_text": "14/03/2026"
    }
  }
}
```

- `page` is 1-indexed.
- `bbox` is normalized to `[0..1]` in `[x1, y1, x2, y2]` form relative to the page.
- `source_text` is the raw snippet as it appears on the page.
- If a field was inferred (not directly quoted), `source_text` is still populated with the closest supporting text; an `"inferred": true` flag is added.
- Fields with no citation found (e.g. computed fields) are absent from the map.

### Endpoints

```
GET /api/sifts/{sift_id}/records/{record_id}/citations
Response: {
  "record_id": "rec_...",
  "document_id": "doc_...",
  "citations": { <field>: <citation>, ... }
}

GET /api/documents/{document_id}/pages
Response: {
  "document_id": "doc_...",
  "pages": [
    { "page": 1, "width": 1240, "height": 1754, "image_url": "/api/documents/.../pages/1/image" },
    ...
  ]
}

GET /api/documents/{document_id}/pages/{n}/image
Response: PNG (or JPEG) stream — rendered page at a standard DPI (default 150).
```

### Extraction pipeline changes

The extraction agent already receives the parsed document. To populate citations:

1. Document parsing step enriches the parsed representation with per-block/line `page` + `bbox` metadata. This is typically available from the underlying PDF extractor (pdfplumber, PyMuPDF, etc.) but may need propagation through the current parse step.
2. The LLM extraction prompt is extended to return, alongside each extracted field, the source text span it relied on. The server then resolves that span to `(page, bbox)` by looking up the block/line coordinates in the parsed representation.
3. If span resolution fails (LLM returned text not present verbatim), fuzzy match (normalized whitespace, case-insensitive) is used; if still unresolved, the field has no citation and a warning is logged.

This pipeline is LLM-provider agnostic — providers that support structured output with span references (e.g. Claude with extended JSON schemas) skip step 2's fuzzy-match fallback. For others, fuzzy match is the safety net.

### Page rendering

`GET /api/documents/{document_id}/pages/{n}/image` renders the PDF page to an image on demand, cached in blob storage keyed by `{document_id}/pages/{n}@{dpi}.png`. First request renders and caches; subsequent requests serve from cache. Uses `pdf2image` or `pymupdf` for rendering.

For image documents (JPEG, PNG): the endpoint returns the image itself (page=1 only).

### Backward compatibility

- Pre-existing `SiftResult` records have no `citations` field. API returns `{"citations": {}}` for them.
- The extraction agent writes citations on new records going forward. A manual `POST /api/sifts/{id}/reindex` backfills citations for existing documents.

### Access control

Citations and page images are org-scoped like any document. Same auth as the existing document endpoints (JWT or API key).

### SDK surface

Python (`SiftHandle`):

```python
sift.record(record_id).citations() -> dict
sift.document(document_id).page_count() -> int
sift.document(document_id).page_image(page: int, dpi: int = 150) -> bytes
```

TypeScript (CR-024):

```ts
await sift.record(recordId).citations();
await sift.document(docId).pageImage(page);   // returns Blob / Buffer
```

### MCP

A read tool is added:

```
get_record_citations(sift_id, record_id) -> { citations: {...} }
```

Useful for agents that want to justify an answer by pointing to source evidence.

### Docs

- `docs/concepts/citations.mdx` — what citations are, how the pipeline generates them, how to render them client-side (small JS example with an overlay div on a page image).
- `system/api.md` — add endpoints.

## Files

- `code/server/sifter/api/records.py` — NEW or CHANGED (citations endpoint, record detail)
- `code/server/sifter/api/documents.py` — CHANGED (pages listing + page image endpoint)
- `code/server/sifter/services/extraction_agent.py` — CHANGED (emit source spans)
- `code/server/sifter/services/citation_resolver.py` — NEW (map span → page/bbox)
- `code/server/sifter/services/page_renderer.py` — NEW (PDF → PNG cache)
- `code/server/sifter/models/sift_result.py` — CHANGED (citations field)
- `code/server/tests/test_citations.py` — NEW
- `code/sdk/sifter/client.py` — CHANGED (citations methods)
- `code/mcp/sifter_mcp/server.py` — CHANGED (`get_record_citations`)
- `product/features/server/extraction.md` — CHANGED (note citations output)
- `product/features/server/citations.md` — NEW (feature doc)
- `system/api.md` — CHANGED
- `docs/concepts/citations.mdx` — NEW

## Acceptance Criteria

1. A newly processed document produces a record whose `citations` map has at least one entry per extracted field when possible.
2. `GET /api/sifts/{sift_id}/records/{record_id}/citations` returns the map with `page`, `bbox`, `source_text` for each field.
3. `GET /api/documents/{document_id}/pages` returns a list with page dimensions.
4. `GET /api/documents/{document_id}/pages/{n}/image` returns a PNG of the page at default DPI, cached after first render.
5. Python SDK methods `citations()`, `page_count()`, `page_image()` work against a running server.
6. MCP tool `get_record_citations` returns the same shape as the REST endpoint.
7. `POST /api/sifts/{id}/reindex` populates citations for documents processed before this CR.
8. Tests cover: happy path with an LLM returning valid spans, fuzzy-match fallback, and a field with no resolvable citation.
9. `docs/concepts/citations.mdx` contains a runnable example of rendering the overlay in a browser.

## Out of Scope

- Multi-region citations per field (a field drawn from multiple spans) — v1 keeps the primary span only.
- OCR of scanned-only PDFs when no text layer is present — this is an upstream parsing capability; if a page has no text, citations are omitted for that page's fields.
- Built-in UI component for drill-down (consumers build their own; `sifter-cloud` will ship one).
- Redaction of PII in rendered page images — out of scope here; a future CR if needed.
