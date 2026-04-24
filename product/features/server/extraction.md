---
title: "Server: Document Extraction (Sifts)"
status: synced
version: "1.7"
last-modified: "2026-04-24T00:00:00.000Z"
---

# Document Extraction — Server

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sifts` | Create new sift (also creates its default folder) |
| GET | `/api/sifts` | List sifts (`?limit=50&offset=0`) |
| GET | `/api/sifts/{id}` | Get sift details (includes `default_folder_id`) |
| PATCH | `/api/sifts/{id}` | Update sift (name, description, instructions, schema) |
| DELETE | `/api/sifts/{id}` | Delete sift + results |
| POST | `/api/sifts/{id}/upload` | Upload documents directly to sift (routed to default folder) |
| POST | `/api/sifts/{id}/reindex` | Reindex all documents |
| POST | `/api/sifts/{id}/reset` | Reset error state |
| GET | `/api/sifts/{id}/records` | Get extracted records (`?limit=100&offset=0&min_confidence=&has_uncertain_fields=`) |
| GET | `/api/sifts/{id}/records/count` | Count extracted records (accepts same filter params as list) |
| GET | `/api/sifts/{id}/records/csv` | Export records as CSV |
| GET | `/api/sifts/{id}/documents` | List all documents processed by this sift with per-document status (`?limit=50&offset=0`) |

Auth required on all endpoints: JWT Bearer or `X-API-Key` header.

## Sift Model

Key fields returned by `GET /api/sifts/{id}`:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Sift ID |
| `name` | string | Sift name |
| `instructions` | string | Natural language extraction instructions |
| `schema` | string | Auto-inferred schema (e.g. "client (string), date (string), amount (number)") |
| `status` | string | `active` \| `indexing` \| `paused` \| `error` |
| `processed_documents` | int | Documents successfully processed |
| `total_documents` | int | Total documents enqueued |
| `default_folder_id` | string? | ID of the auto-created default folder; `null` for pre-existing sifts until their first direct upload |
| `multi_record` | bool | If `true`, each document can produce multiple `SiftResult` rows (one per record found) |

## Processing Pipeline

1. User creates a sift with a name, description, and natural language instructions (e.g. "Extract: client name, invoice date, total amount, VAT number")
2. A **default folder** is created automatically with the same name as the sift and linked to it
3. Documents are uploaded either via **Folders** (see `server/documents.md`) or directly via `POST /api/sifts/{id}/upload` — both routes go through the same folder-document pipeline
4. Sifter processes each document asynchronously via the background queue
5. Sift schema is auto-inferred from the first processed document

## Templates (`GET /api/templates`)

Returns the full template library (no auth required). Response: `{ "templates": [ { id, name, description, icon, instructions } ] }`. Templates are static JSON fixtures (instructions-only, no schema) loaded at server startup — no DB, no hot-reload. See `system/api.md` for the full response shape.

## Sift Creation (`POST /api/sifts`)

On creation, the server performs the following steps atomically in sequence:

1. Persist the sift document in the `sifts` collection
2. Create a folder with the same name as the sift (no duplicate check — folder names are not unique)
3. Link the folder to the sift via `folder_extractors`
4. Update the sift with `default_folder_id = <new folder id>`

The response includes `default_folder_id`.

## Direct Upload (`POST /api/sifts/{id}/upload`)

Uploading directly to a sift routes files through the sift's **default folder**:

1. Read `default_folder_id` from the sift; create the folder lazily if `null` (for pre-existing sifts)
2. For each file: save to storage under `{folder_id}/{filename}`, create a `Document` record, enqueue for processing
3. Response: `{ "uploaded": N, "files": [...], "folder_id": "..." }`

Files uploaded this way are visible in the folder browser and benefit from the full folder pipeline: automatic retry (max 3), webhooks (`sift.document.processed`, `sift.error`), per-document status tracking, and concurrent worker processing.

> **Legacy note:** files uploaded to a sift before this change were stored under `{sift_id}/` with no `Document` records. They remain in blob storage but are not visible in the UI and cannot be migrated.

## Filter Discard

When a sift's instructions include matching conditions (e.g. "extract data only from invoices"),
documents that don't satisfy those conditions are **discarded** instead of stored as low-confidence results.

- `sift_agent.extract()` returns `matches_filter: bool` and `filter_reason: str`
- If `matches_filter` is `false`, the document is not stored in `sift_results`
- `DocumentSiftStatus.status` is set to `"discarded"` with `filter_reason` populated
- The processing queue task is marked `done` (not `error`) — the task completed successfully
- Webhook `sift.document.discarded` is fired with `{ document_id, sift_id, reason }`
- Users can reprocess a discarded document after updating the sift's instructions

## Indexing Log (`GET /api/sifts/{id}/documents`)

Returns all `DocumentSiftStatus` rows for the sift, joined with `Document` metadata.

Response item fields: `document_id`, `filename`, `folder_id`, `size_bytes`, `uploaded_at`,
`status` (`pending` | `processing` | `done` | `error` | `discarded`), `started_at`,
`completed_at`, `error_message`, `filter_reason`, `sift_record_id`.

Sorted by `uploaded_at` descending. Supports `?limit=50&offset=0` pagination.

If the document was deleted after processing, `filename` is `null`.

## Multi-Record Extraction

When `multi_record: true` on a Sift, the extraction agent is prompted to return `extractedData` as a JSON array of objects instead of a single object. Each element in the array becomes its own `SiftResult` with a `record_index` (0-based).

- `SiftResult.record_index` is `0` for all single-record sifts; `0, 1, 2, ...` for multi-record
- The unique index on sift results is `(sift_id, filename, record_index)` — reprocessing a document replaces its rows for that file
- `sift_record_id` in `DocumentSiftStatus` points to the first record's ID (`record_index=0`)
- Schema inference uses the first record's keys

## Records Filter Params

`GET /api/sifts/{id}/records` and `GET /api/sifts/{id}/records/count` accept two optional filter query params:

| Param | Type | Semantics |
|-------|------|-----------|
| `min_confidence` | float `[0.0, 1.0]` | Return only records with `confidence >= min_confidence`. Applied as a MongoDB `$gte` filter. Values outside `[0.0, 1.0]` return HTTP 422. |
| `has_uncertain_fields` | bool | When `true`, return only records where at least one citation entry has `confidence < 0.6` OR `inferred: true`. |

Both params are independent and composable. Both are ignored (no-op) when absent, preserving existing behaviour.

Each record response item includes a derived boolean field `has_uncertain_fields` (computed server-side from the `citations` map; never stored in MongoDB):

```json
{
  "id": "…",
  "confidence": 0.91,
  "has_uncertain_fields": true,
  "extracted_data": { … },
  "citations": { … }
}
```

## Per-Field Citations

Every extracted field is anchored to its source: the exact `source_text` snippet the LLM relied on, a per-field `confidence` score, and (for PDFs) the page number. Citations live on each record under a `citations` map keyed by field name — see `product/features/server/citations.md` for the full shape, endpoints, and pipeline details.

The extraction agent prompt asks the LLM to return a `citations` map alongside `extractedData`, with `source_text` and `confidence` per field. For PDFs, `citation_resolver.py` verifies each `source_text` against pymupdf-extracted text blocks to determine `page` and the `inferred` flag (verbatim vs fuzzy match). For non-PDF formats the LLM's span is passed through directly. `bbox` is reserved and not populated in the current version.

Records produced before this feature landed have an empty `citations` map until re-extracted via `POST /api/sifts/{id}/reindex`.

## Schema Versioning

Each sift has a `schema_version` integer that increments whenever the inferred schema changes (fields added / removed / types changed). Schema changes emit a `sift.schema.changed` webhook event with the new schema payload. Typed-schema consumers (the `sifter sifts schema --watch` CLI, the SDK's `model=` kwarg, the TypeScript codegen) subscribe to this event to regenerate models — see `product/features/server/typed-schemas.md`.

## Key Behaviors

- By default (single-record), each document produces exactly one `SiftResult` row with flat `extracted_data` key-value pairs
- With `multi_record: true`, one document can produce N rows, one per record found by the LLM
- Fields not found in a document are set to `null`
- Numeric values stored as numbers, dates as ISO YYYY-MM-DD strings
- The sift tracks status: `active`, `indexing`, `paused`, `error`
- Progress tracked via `processed_documents` / `total_documents` counters (per document, not per record)
- Schema inference: after first document processed, generate a schema string like "client (string), date (string), amount (number)"; `schema_version` starts at 1 and bumps on each change
- A sift can have multiple folders linked to it (many-to-many via `folder_extractors`); `default_folder_id` identifies the one created automatically at sift creation

## Manual Corrections

Users can correct wrong extracted values via a dedicated correction layer that sits on top of `extracted_data`. Corrections survive re-extraction.

### SiftResult — new fields

```python
user_overrides: dict[str, Any] = {}
# key = field name, value = corrected value (same type as extracted_data value)

corrected_fields: dict[str, dict] = {}
# key = field name
# value = { value, scope: "local"|"rule", corrected_by: user_id, corrected_at: ISO timestamp }
```

`user_overrides` is the merge layer. `corrected_fields` is the audit trail — who changed what, when, and with what scope.

### Merge-on-read

The server returns `{**extracted_data, **user_overrides}` in all consumers. `user_overrides` always wins. `GET /records/{id}?show_original=true` returns raw `extracted_data` without overrides (useful for debugging).

All existing consumers (records list, CSV export, record detail) automatically see the corrected values — the merge happens in `SiftResultsService.to_response_dict` before any serialisation.

**Note:** MongoDB aggregation pipelines used by chat and dashboard run against raw `extracted_data`, not the merged view. This is a known v1 limitation documented in CR-035.

### Re-extraction durability

`POST /api/sifts/{id}/reindex` updates `extracted_data` and `citations` but **never touches** `user_overrides` or `corrected_fields`. Human corrections are immutable to re-extraction; only an explicit user action (reset to original) can remove them.

### CorrectionRule entity (new collection)

```python
class CorrectionRule(BaseModel):
    id: Optional[str]          # MongoDB _id
    sift_id: str
    field_name: str            # which field this rule targets
    match_value: str           # exact match (case-insensitive, trimmed)
    replace_value: Any         # replacement (same type as field)
    created_by: str            # user_id
    created_at: datetime
    applied_count: int = 0     # incremented on each apply (backfill or new extraction)
    active: bool = True        # soft-delete
```

**Match semantics v1**: exact match after `str(value).strip().lower()` on both sides. No regex, no fuzzy.

**Ordering**: when multiple rules match the same field, applied in `created_at` ascending order. Conflicts are visible in the rules list UI; user must deactivate one.

**Application timing**: `DocumentProcessor` applies active rules immediately before writing `extracted_data` for new documents, so new documents are normalised at extraction time. Backfill is explicit.

### PATCH /api/sifts/{id}/records/{record_id}

Corrects one or more fields on a record.

Request body:
```json
{
  "corrections": {
    "vendor_name": { "value": "OpenAI", "scope": "local" },
    "total":       { "value": 1500,     "scope": "rule"  }
  }
}
```

Each field is processed independently:
- `scope: "local"` — writes to `user_overrides[field]` and `corrected_fields[field]`.
- `scope: "rule"` — same as local, plus creates a `CorrectionRule` for `(sift_id, field_name, old_value → new_value)` where `old_value` is the current merged value before the correction.
- `scope: "reset"` with `value: null` — removes the field from `user_overrides` and `corrected_fields`, restoring the LLM-extracted value.

Returns the updated record (merged view). HTTP 422 for unknown field name or type-incompatible value.

### Correction rules endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sifts/{id}/correction-rules` | List rules (`?active_only=true` default) |
| DELETE | `/api/sifts/{id}/correction-rules/{rule_id}` | Soft-delete (`active = false`). Existing record overrides are unchanged. |
| POST | `/api/sifts/{id}/correction-rules/{rule_id}/backfill` | Apply rule to all existing records where field value matches. Returns `{ applied_count }`. |

**Backfill** runs synchronously for datasets ≤500 records, async (background task) for larger ones. Backfill writes to `user_overrides` + `corrected_fields` on each matching record (scope stays `"rule"` in the audit trail).
