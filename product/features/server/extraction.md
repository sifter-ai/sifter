---
title: "Server: Document Extraction (Sifts)"
status: synced
version: "1.3"
last-modified: "2026-04-17T00:00:00.000Z"
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
| GET | `/api/sifts/{id}/records` | Get extracted records (`?limit=100&offset=0`) |
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

## Per-Field Citations

Every extracted field is anchored to its source: document, page (1-indexed), bounding box (normalized `[0..1]`), and the source-text snippet. Citations live on each record under a `citations` map keyed by field name — see `product/features/server/citations.md` for the shape, endpoints, and rendering rules.

The extraction agent returns, alongside each field value, the source-text span. `citation_resolver.py` maps each span to `(page, bbox)` using the parsed document's per-block coordinates. When the mapping cannot resolve verbatim, fuzzy match is used; when it still cannot resolve, the field appears in `extracted_data` without an entry in `citations`.

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
