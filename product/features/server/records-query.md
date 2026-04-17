---
title: "Server: Structured Records Query"
status: synced
version: "1.0"
last-modified: "2026-04-17T00:00:00.000Z"
---

# Structured Records Query — Server

The public, filterable, paginatable interface to a sift's extracted records. Consumed by the Python SDK (`sift.find`, `sift.records_count`, `sift.records_by_ids`), the TypeScript SDK, the CLI (`sifter records list`), the MCP tools (`find_records`), and `sifter-cloud`'s dashboard UI.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sifts/{sift_id}/records` | List records with filter + sort + projection + cursor pagination + full-text search |
| GET | `/api/sifts/{sift_id}/records/count` | Return the count matching `filter` + `q` without loading records |
| POST | `/api/sifts/{sift_id}/records/batch` | Fetch records by a list of IDs |

Auth required on all endpoints.

## `GET /api/sifts/{id}/records`

### Query parameters

| Param | Type | Description |
|-------|------|-------------|
| `filter` | JSON-encoded, URL-encoded object | Filter DSL (see below). `sift_id` is always added server-side; clients never set it. |
| `sort` | comma-separated fields | Prefix with `-` for desc, e.g. `-date,amount`. Defaults to `-created_at`. |
| `project` | comma-separated fields | Keys to include in each record's `extracted_data` (e.g. `client,date,total`). Omitted → full record. |
| `q` | string | Case-insensitive substring match across all string fields in `extracted_data`. |
| `limit` | int | Default 50, capped at 500. |
| `cursor` | opaque string | Cursor returned by a previous response. When set, `offset` is ignored. |
| `offset` | int | **Deprecated** — retained for one release, new clients must migrate to `cursor`. |

### Response envelope

```json
{
  "items": [ { "id": "…", "sift_id": "…", "document_id": "…", "extracted_data": { … }, … } ],
  "next_cursor": "eyJfaWQiOi… " | null,
  "total": 243 | null
}
```

- `next_cursor` — `null` when the current page is the last.
- `total` — populated when offset pagination is used. With cursor pagination on large result sets, the server may return `null` to avoid a separate `count` scan; clients should call `/records/count` explicitly when a total is required.

Cursor strategy: the cursor encodes the last `_id` of the current page (sort-stable). Pagination is insert-safe.

## Filter DSL

A restricted subset of the MongoDB query language, evaluated against keys inside `extracted_data.*`:

```jsonc
// equality
{ "client": "Acme" }

// numeric comparators
{ "amount": { "$gt": 1000 } }
// $gt, $gte, $lt, $lte, $ne

// set membership
{ "country": { "$in": ["IT", "FR"] } }
// $in, $nin

// string substring (case-insensitive)
{ "client": { "$contains": "Acm" } }

// existence
{ "due_date": { "$exists": true } }

// combinators
{ "$and": [ { "paid": true }, { "amount": { "$gt": 1000 } } ] }
{ "$or":  [ { "status": "open" }, { "status": "overdue" } ] }
{ "$not": { "country": "IT" } }
```

### Validation

- Only the operators listed above are accepted. Unknown operators and stages (`$regex`, `$expr`, `$where`, `$lookup`, …) return HTTP 400.
- Field names must refer to extracted-data keys. `_id`, `sift_id`, and other internal fields are not queryable through the DSL.
- Server compiles the DSL to a single `$match` stage, prefixed by the `sift_id` guard.

## `GET /api/sifts/{id}/records/count`

```
GET /api/sifts/{sift_id}/records/count?filter=…&q=…
→ { "count": 173 }
```

Accepts the same `filter` / `q` params as `/records`. Runs a server-side count — no records shipped over the wire.

## `POST /api/sifts/{id}/records/batch`

```
POST /api/sifts/{sift_id}/records/batch
Body: { "ids": ["rec_1", "rec_2", "rec_3"] }
→ { "items": [ … ] }
```

Ordered by the order supplied by the client. Missing IDs are dropped silently (they return 404 in the single-record endpoint).

## CSV Export

Not in this endpoint. CSV export remains at `GET /api/sifts/{sift_id}/records/csv` — a streaming response that honors the same `filter`, `sort`, `project`, and `q` query params (but not `cursor`).

## Performance Notes

- Cursor pagination uses the existing index on `sift_id + _id`.
- Frequent filter fields (hinted by the NL agent) should be backed by partial compound indexes on `sift_id + extracted_data.<field>`. Index creation is deferred to a separate performance CR; the document model here enables it.

## Backward Compatibility

`offset`-based pagination is still honored for one release. The response retains `total` when `offset` is used. New clients must switch to `cursor` — the SDKs and CLI default to cursor pagination.
