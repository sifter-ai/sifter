---
title: "Trust UI: per-field source snippet + confidence in records"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-21T00:00:00.000Z"
---

## Summary

Close the loop on per-field citations end-to-end so the records UI becomes trustable at a glance. Three coordinated changes:

1. **Server parsing** — PDF documents are parsed with `pymupdf` into per-page text blocks, replacing the current empty `page_blocks` stub. Used for verbatim/fuzzy verification of the LLM's `source_text`.
2. **Extraction agent** — the LLM prompt is extended to return, alongside each extracted field, the source-text span it relied on and a per-field `confidence` (0.0–1.0). The `citations` map on each `SiftResult` grows a `confidence` key per entry.
3. **Records UI** — the record detail modal surfaces, under each field, the source snippet and a confidence indicator. Low-confidence, `inferred`, or un-cited fields get a visible warning so the user can scan-and-trust.

**Contract walk-back:** this CR drops `bbox` from the active citation shape. CR-027 declared bbox as mandatory in the contract but the code never populated it; also, bbox is only meaningful for PDFs — the `FileProcessor` supports 7 formats (PDF, images, docx, html, md, txt, csv) and for most of them bbox is either unavailable (no text layer, no OCR in v1) or nonsensical (CSV, plain text). Rather than keep a primitive that's empty on a majority of supported inputs, we mark bbox as **reserved** in the contract (field may appear in a future CR that ships click-to-highlight on PDF) and ship the trust UI on what every format can reliably provide: `source_text`, `page` (when paginated), `confidence`, `inferred`.

## Motivation

CR-027 shipped the Citations API contract but left two practical gaps: parsing never populates the block metadata the resolver needs, and the extraction prompt never asks the LLM for source spans. The net user experience is identical to pre-CR-027: extracted values with no verifiable provenance.

Trust is the prerequisite for business-user adoption (`product/vision.md`). Today users auditing a sift of 200 invoices must open each PDF and compare manually — so they don't. With per-field snippets + confidence, verification collapses from minutes per record to seconds: the user scans, spots the 2–3 fields with low confidence or suspicious snippets, and ignores the rest. Sifter stops being an "AI demo" and becomes a tool of record.

The UI was explicitly out of scope in CR-027 because it was deferred to `sifter-cloud`. With the OSS records table now a first-class surface (CR-017) and the dev-first repositioning (CR-022), the trust UI belongs in OSS alongside the API.

On bbox specifically: LLMs are unreliable at precise spatial grounding, so even if we asked for coordinates the output would be untrustworthy. The sound approach is LLM-returns-text, deterministic-parser-returns-geometry — but that parser only exists for PDFs (`pymupdf`). For images we'd need OCR (out of scope); for docx/html/md/txt/csv the concept doesn't apply. Shipping bbox only for PDFs and leaving 6 other formats with an empty primitive is bad API design. Cleaner: ship `source_text` for everyone (sufficient for human eyeballing), reserve bbox for when click-to-highlight becomes a real feature.

## Detailed Design

### Data model — `citations.md` update

Revised per-field citation shape:

```json
{
  "document_id": "doc_…",
  "source_text": "Acme Ltd.",
  "page": 1,
  "confidence": 0.95,
  "inferred": false
}
```

| Field         | Required? | Notes                                                                                                                                                                                               |
| ------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document_id` | yes       | Always populated.                                                                                                                                                                                   |
| `source_text` | yes       | The snippet the LLM relied on, as it appears in the document.                                                                                                                                       |
| `page`        | optional  | 1-indexed. Present for paginated formats (PDF); absent for docx, html, md, txt, csv. For images, always `1` if present.                                                                             |
| `confidence`  | optional  | LLM self-assessment in `[0.0, 1.0]`. Absent when the provider cannot supply it. Resolver caps at `0.7` when fuzzy-match was needed (see resolver section).                                          |
| `inferred`    | optional  | `true` when `source_text` did not verbatim-match any page block and fuzzy match was used. `false` when verbatim. Absent when no verification was possible (no `page_blocks`, e.g. non-PDF formats). |

**`bbox` is reserved in the contract** — it does not appear in responses shipped by this CR. A future CR will populate it when we ship click-to-highlight on PDF pages. Consumers treat its absence as the expected default; the field is documented in `citations.md` under "reserved fields" with an explicit "not populated in the current version" note, so SDK consumers know it exists conceptually.

Record-level `SiftResult.confidence` stays (document-level summary).

### Server parsing — `file_processor.py`

`_process_pdf` is rewritten to populate `page_blocks` via `pymupdf`:

```python
# per-block shape (v1 — text only, no geometry)
{
  "page": 1,                                 # 1-indexed
  "text": "Total amount: 1500 EUR",
}
```

No `bbox`, `width`, or `height` — they're not used by the v1 resolver and won't be until bbox ships. Keeping the shape minimal avoids carrying dead data through pipeline + Mongo storage.

The PDF continues to be sent to the LLM as base64 (vision models extract more reliably than pure text for layout-sensitive invoices); the extracted page blocks travel alongside purely for verbatim/fuzzy verification of the LLM's `source_text`.

For non-PDF formats `page_blocks` stays empty:

- **Images** (png/jpg/tiff/webp) — no text layer without OCR (out of scope). Citations still have `source_text` + `confidence` from LLM; no `page`, no `inferred` flag.
- **docx** — converted to markdown via mammoth; page boundaries are lost in the flattened representation. Could be revisited later.
- **html, md, txt, csv** — single flat text blob; no pagination concept. `page` absent.

In all non-PDF cases the LLM's `source_text` is passed through as-is without verification. Consumers see the snippet; they do not see `inferred` (absence means "unverified by the server, trust the LLM").

### Extraction agent — prompt + parsing

`prompts/extraction.md` grows a section instructing the LLM to return a `citations` map parallel to `extractedData`:

```json
{
  "documentType": "invoice",
  "matchesFilter": true,
  "confidence": 0.95,
  "extractedData": {
    "supplier": "OpenAI Ireland Ltd",
    "total": 1500,
    "date": "2026-03-14"
  },
  "citations": {
    "supplier": { "source_text": "OpenAI Ireland Ltd", "confidence": 0.98 },
    "total": { "source_text": "Total amount: 1500 EUR", "confidence": 0.92 },
    "date": { "source_text": "Invoice date: 14/03/2026", "confidence": 0.88 }
  }
}
```

Prompt rules:

- One entry per non-null extracted field, when possible.
- `source_text` is the verbatim snippet as it appears on the page (short context, not the whole paragraph).
- `confidence` is an honest self-assessment: 1.0 = copied verbatim, ≥0.85 = found clearly, 0.5–0.85 = inferred or partial match, <0.5 = unsure or computed.
- Missing entries are allowed (computed fields, unreadable regions).

`sift_agent.py` parses the new `citations` block; absence falls back to the existing behavior (empty citations map).

### Citation resolver — update

`citation_resolver.py` now accepts the LLM-provided `citations` map and the `page_blocks`:

```python
def resolve_citations(
    document_id: str,
    extracted_data: dict[str, Any],
    llm_citations: dict[str, dict],   # NEW: from LLM
    page_blocks: list[dict],
) -> dict[str, dict]: ...
```

Per field:

1. Take `source_text` + `confidence` from `llm_citations` when present.
2. If `page_blocks` is non-empty (PDF): search for `source_text` verbatim → citation gets `page` + `inferred: false`. Else fuzzy match → `page` + `inferred: true`. If still unresolved, emit `{document_id, source_text, confidence}` without `page`/`inferred` and log a `citation_unresolved` warning.
3. If `page_blocks` is empty (non-PDF): pass through `{document_id, source_text, confidence}` with no `page`, no `inferred`.
4. Fuzzy match caps LLM `confidence` at `0.7` — the value was not verbatim in the document, so we down-weight the self-report regardless of what the LLM claimed.
5. If `llm_citations` lacks the field entirely: omit from citation map (consumers treat as "unknown source").

The existing `bbox` computation in `_make_citation` is removed. `page_blocks` no longer carry `bbox`, `width`, `height`.

Fields with `confidence < 0.6` log a `low_confidence_field` structured warning (one per record, batched).

### Backward compatibility

- `citations.md` gains a field, doesn't break existing consumers — `confidence` is optional.
- Records created before this CR have empty `citations` maps; reindex repopulates them.
- API response shape is a superset; TS SDK type `SiftRecord` extends non-breakingly.

### Records UI — `records.md` + `RecordsTable.tsx`

`RecordDetailModal` field row, current layout:

```
LABEL         VALUE
```

New layout (per field):

```
LABEL         VALUE                              [CONF BADGE]
              ┌ snippet ────────────────────────────────────┐
              │ "…Total amount: 1500 EUR…"                  │
              │ page 1                                       │
              └─────────────────────────────────────────────┘
```

Rendering rules:

- **Confidence badge** (inline, right-aligned with value):
  - `≥0.85` → green dot + `High`
  - `0.60–0.85` → amber dot + `Medium`
  - `<0.60` OR `inferred: true` → red triangle icon + `Low`
  - no citation entry at all → muted info icon + `Unverified` (tooltip: "Source not located in document")
- **Snippet block** (below value, collapsible after 120 chars):
  - Shown when citation has `source_text`.
  - Monospace serif, muted border, small type, word-wrap.
  - Footer line: `page N` when `page` is present; nothing for non-PDF.
- **Missing citation**: no snippet block, only the `Unverified` badge.
- Table cell view (not detail) unchanged — keep the scan-only table density.

Empty citations map (pre-CR records, non-PDF, or LLM returned nothing): every field renders `Unverified`. A one-line banner at the top of the modal suggests "Reindex this sift to populate citations" with an action button calling `POST /api/sifts/{id}/reindex`.

### Frontend API types

`code/frontend/src/api/extractions.ts`:

```ts
export interface Citation {
  document_id: string;
  source_text: string;
  page?: number;
  confidence?: number;
  inferred?: boolean;
}

export interface SiftRecord {
  // existing fields…
  citations?: Record<string, Citation>;
}
```

Note: no `bbox` in the active type. When click-to-highlight ships, bbox is added back as an optional field.

### SDK surface — shape alignment + additions

- **TypeScript SDK** — `code/sdk-ts/src/types.ts` currently has a `Citation` with required `page`, required `bbox`, and no `confidence`. Rewrite to match the new shape:
  ```ts
  export interface Citation {
    document_id: string;
    source_text: string;
    page?: number;
    confidence?: number;
    inferred?: boolean;
  }
  ```
  `bbox` is removed — the field was documented as mandatory but never populated at runtime. Removing it is a type-only breaking change, but it aligns the TS surface with the actual server output. No runtime breakage.
- **Python SDK** — `code/sdk/sifter/client.py` `RecordHandle.citations()` returns `dict[str, Any]`; runtime is fine. Update the docstring to describe the new shape and call out that `bbox` is reserved / not currently returned.

No new SDK methods — `citations()` already exists and is additive-compatible. The `page_count()` / `page_image()` helpers from CR-027 remain for future click-to-view but are not used by the v1 trust UI.

### Mintlify docs

CR-027 listed `docs/concepts/citations.mdx` as NEW but the file was never created — this CR closes that gap in the same pass as shipping the trust UI, so the OSS docs site finally has a single authoritative page on citations.

- **NEW** `docs/concepts/citations.mdx` — explains: what a citation is, the shape (`document_id`, `source_text`, `page?`, `confidence?`, `inferred?`), how the extraction pipeline populates them (prompt → verbatim/fuzzy verification on PDF, passthrough on other formats), how the records UI renders them (trust view), what `inferred` means, per-format degraded modes (non-PDF = no `inferred`, no `page`). Explicit "Reserved fields" section at the bottom documents `bbox` as reserved for a future click-to-highlight feature. Uses Mintlify components (`<Card>`, `<CodeGroup>`, `<Warning>`).
- **UPDATED** `docs/concepts/records.mdx` — add a short "Verifying extractions" section describing the trust view (snippet + confidence badge + Unverified state + reindex banner) with a link to `citations.mdx` for the data shape.
- **UPDATED** `docs/integrations/typescript-sdk.mdx` — citations example uses the revised type (no `bbox`; `page?`, `confidence?`, `inferred?`).
- **UPDATED** `docs/integrations/mcp-server.mdx` — `get_record_citations` response example shows `source_text`, `page`, `confidence`, `inferred` (no `bbox`).
- **UPDATED** `docs/docs.json` — add `concepts/citations` to the concepts group navigation (positioned after `records`).

## Files

### Product / system docs (CR modifies these on apply)

- `product/features/server/citations.md` — rewrite shape table: `bbox` moved to a dedicated "Reserved fields" subsection marked "not populated in this version"; `confidence` added; `page` and `inferred` re-documented as optional. Update examples. Pipeline section clarifies that the LLM returns `source_text` only — geometry, when added, will come from deterministic parsing.
- `product/features/server/extraction.md` — update "Per-Field Citations" section to mention prompt returns spans + confidence, verbatim/fuzzy verification, and that `bbox` is currently reserved.
- `product/features/frontend/records.md` — add "Per-field trust view" section describing snippet + confidence badge + Unverified state + reindex banner.
- `system/api.md` — ensure `citations` response shape reflects the revised fields (`source_text`, `page?`, `confidence?`, `inferred?`; bbox omitted with a short note).

### Code (post-sync implementation)

- `code/server/sifter/services/file_processor.py` — implement `_extract_pdf_blocks` with `pymupdf`; populate `page_blocks` as `[{page, text}, …]`. No bbox.
- `code/server/sifter/prompts/extraction.md` — add `citations` output spec (source_text + confidence per field).
- `code/server/sifter/services/sift_agent.py` — parse `citations` from LLM response into `ExtractionAgentResult.llm_citations`.
- `code/server/sifter/services/citation_resolver.py` — accept `llm_citations`, verbatim/fuzzy search over `page_blocks` (text-only), preserve confidence, cap at 0.7 on fuzzy, set `inferred` only when verification is possible. Remove `_make_citation` bbox normalization code.
- `code/server/sifter/services/sift_service.py` — pass `llm_citations` into `resolve_citations`.
- `code/server/sifter/models/sift_result.py` — no schema change (dict is already open-typed).
- `code/server/tests/test_file_processor.py` — PDF → non-empty page_blocks with `{page, text}`; assertion that `bbox` keys are absent.
- `code/server/tests/test_sift_agent.py` — prompt parses `citations` block.
- `code/server/tests/test_citations.py` — LLM span + verbatim match path; LLM span + fuzzy-match path (inferred=true, confidence capped); non-PDF passthrough path (no inferred, no page); missing citation path.
- `code/frontend/src/api/extractions.ts` — `Citation` type (no bbox), extend `SiftRecord`.
- `code/frontend/src/components/RecordsTable.tsx` — extend `RecordDetailModal` + `DetailValue`: snippet block, confidence badge, Unverified state, reindex banner.
- `code/frontend/src/components/RecordsTable.test.tsx` (or nearby) — unit tests for badge logic per confidence bucket.
- `code/sdk-ts/src/types.ts` — rewrite `Citation`: remove `bbox`, make `page` optional, add `confidence?` and ensure `inferred?` is present.
- `code/sdk-ts/test/` — update citation-related assertions (drop bbox expectations, add confidence).
- `code/sdk/sifter/client.py` — docstring of `RecordHandle.citations()` documents new shape and bbox-reserved status.
- `code/mcp/` — `get_record_citations` already exposes the map; no change beyond `confidence` passthrough.

### Mintlify docs

- **NEW** `docs/concepts/citations.mdx` — authoritative docs page for citations (shape, pipeline, trust UI, per-format degraded modes, reserved fields).
- `docs/concepts/records.mdx` — add "Verifying extractions" section with trust-view description.
- `docs/integrations/typescript-sdk.mdx` — citations example reflects relaxed `Citation` shape.
- `docs/integrations/mcp-server.mdx` — `get_record_citations` response example shows `confidence`.
- `docs/docs.json` — nav entry for `concepts/citations`.

## Acceptance Criteria

1. A newly uploaded PDF produces a `SiftResult` where `citations` contains one entry per non-null field (when LLM cooperates), each with at least `source_text` and `confidence`, plus `page` + `inferred` when verification against `page_blocks` succeeded.
2. The extraction prompt in `prompts/extraction.md` explicitly instructs the LLM to return the `citations` block with `source_text` + `confidence` per field (no bbox requested).
3. `FileProcessor._process_pdf` returns non-empty `page_blocks`, each entry containing exactly `{page, text}` (no `bbox` / `width` / `height`).
4. `citation_resolver.resolve_citations` preserves LLM `confidence`, caps it at `0.7` when fuzzy-match was used, marks `inferred: true` in that path, and omits `inferred`/`page` when no verification was possible (non-PDF).
5. In the frontend `RecordDetailModal`, each extracted field row shows: the field value, a confidence badge (High / Medium / Low / Unverified), and — when citation has `source_text` — a collapsible snippet block with optional `page N` footer (PDF only).
6. Records with an empty citations map render the reindex banner; clicking it calls `POST /api/sifts/{id}/reindex`.
7. Non-PDF formats (image, html, docx, md, txt, csv): fields show snippet + confidence; no `page N` footer; no `inferred` badge; no regression in record display.
8. `POST /api/sifts/{id}/reindex` backfills citations (with confidence) for pre-CR records.
9. MCP `get_record_citations` response includes `confidence` when present; never includes `bbox`.
10. Tests cover: PDF parsing output shape, prompt-output parsing, verbatim + fuzzy + degraded paths, confidence cap on fuzzy, frontend badge bucket selection.
11. `code/sdk-ts/src/types.ts` `Citation` has no `bbox`, `page` is optional, `confidence?` and `inferred?` are present. `npm test` in `code/sdk-ts/` green.
12. `docs/concepts/citations.mdx` exists and is reachable from the Mintlify nav; `bbox` is documented only under "Reserved fields" with explicit "not populated" note; Mintlify build renders without broken links.
13. No response returned by any endpoint in the updated pipeline includes a populated `bbox` key (should be absent from the JSON, not `null`).

## Out of Scope

- **Bounding-box rendering / click-to-highlight on page.** Requires `bbox` to be populated and a page-image overlay in the UI. Out of scope here; `bbox` stays reserved in the contract until a follow-up CR that ships PDF click-to-highlight.
- **OCR for images and scan-only PDFs.** Without OCR, images get LLM `source_text` passthrough with no verbatim verification. Future CR can add a tesseract / hosted-OCR path to populate `page_blocks` for images.
- **Page extraction for docx.** Mammoth loses pagination. Out of scope.
- **Multi-span citations** per field.
- **Per-field user override / edit.** Pure verification UI in this CR.
- **Table view changes** (records list). Per-field trust lives only in the detail modal; the table keeps the current document-level confidence column.
- **Built-in cloud drill-down component.** `sifter-cloud` territory.
