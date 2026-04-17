---
title: "Query NL API + structured query enhancements"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
---

## Summary

Make the query/aggregation layer a first-class public API that both Sifter OSS (admin UI, SDKs, MCP) and `sifter-cloud` (business UI) consume without duplicating logic. This CR:

1. Formalizes `POST /api/sifts/{id}/query` as the natural-language query primitive, returning both the generated pipeline and the results (current behavior, but now contract-stable and documented for consumers).
2. Adds structured query endpoints: expressive filters, multi-field sort, cursor-based pagination, projection, and full-text search over records.
3. Exposes `find` and `aggregate` as public SDK methods (Python and TS) and MCP tools (CR-023).
4. Documents the contract so `sifter-cloud` can build its business UI on top without private endpoints.

## Motivation

Per the repositioning (CR-022), the boundary between OSS and Cloud is drawn at the API level: Cloud has no private APIs, it consumes the same endpoints available to every developer. For that to work, the query/aggregation layer — which Cloud's dashboard, citations, and chat all depend on — must be a robust public contract in OSS.

Today:
- `POST /api/sifts/{id}/query` exists but is lightly documented and the response shape is not formally stable.
- `GET /api/sifts/{id}/records` supports `limit`/`offset` but has no expressive filtering, no cursor pagination, no projection, no full-text search.
- `GET /api/aggregations/{id}/result` runs a saved aggregation but there is no "run ad-hoc structured pipeline" endpoint.

These gaps force clients (including Cloud) to fetch too much data or to reimplement filtering in the browser. This CR closes the gaps.

## Detailed Design

### Endpoint surface

#### 1. Natural language query (contract stabilized)

```
POST /api/sifts/{sift_id}/query
Body:     { "query": str, "execute": bool = true }
Response: {
  "pipeline": list[dict],       # generated MongoDB pipeline (always)
  "results": list[dict] | null, # null when execute=false
  "generated_at": str           # ISO 8601
}
```

`execute: false` returns only the generated pipeline — useful for UIs that want to preview/edit the pipeline before running.

#### 2. Run an ad-hoc pipeline

```
POST /api/sifts/{sift_id}/aggregate
Body:     { "pipeline": list[dict], "limit": int = 1000 }
Response: { "results": list[dict], "ran_at": str }
```

Same validation as the saved-aggregation executor. `sift_id` filter always injected.

#### 3. Structured records query (replaces plain list semantics)

```
GET /api/sifts/{sift_id}/records
Query params:
  filter    JSON-encoded expressive filter (see DSL below), URL-encoded
  sort      comma-separated fields, prefix with `-` for desc (e.g. `-date,amount`)
  project   comma-separated fields to include (e.g. `client,date,total`)
  q         full-text search string across all string fields
  limit     default 50, max 500
  cursor    opaque cursor string from previous response

Response: {
  "items": list[dict],
  "next_cursor": str | null,
  "total": int | null     # null when cursor pagination used on large sets
}
```

Backward compatibility: `offset=N` still supported for a deprecation window; new clients should use `cursor`.

##### Filter DSL

Subset inspired by Mongo, restricted to fields under `extracted_data.*`:

```
{ "client": "Acme" }                          # equality
{ "amount": { "$gt": 1000 } }                 # $gt, $gte, $lt, $lte
{ "country": { "$in": ["IT", "FR"] } }        # $in, $nin
{ "client": { "$contains": "Acm" } }          # case-insensitive substring
{ "paid": { "$ne": true } }
{ "$and": [...] }                              # combinators
{ "$or": [...] }
{ "$not": { ... } }
```

The server validates the DSL, rejects anything else, and compiles it to a `$match` stage prefixed by the `sift_id` filter.

#### 4. Records count with filter

```
GET /api/sifts/{sift_id}/records/count?filter=...&q=...
Response: { "count": int }
```

Needed by UIs (and by Cloud dashboards) to render totals without pulling all records.

#### 5. Records by IDs (batch fetch)

```
POST /api/sifts/{sift_id}/records/batch
Body: { "ids": list[str] }
Response: { "items": list[dict] }
```

Used by cloud UI drill-downs (click on a group in a chart → fetch its records).

### Pipeline and filter validation

- Reuse the allowed-stage whitelist from `query.py`: `$group`, `$sort`, `$project`, `$match`, `$unwind`, `$limit`, `$skip`, `$count`.
- Field references must target `extracted_data.*` (already enforced by the NL agent; apply the same rule for ad-hoc pipelines and filters).
- Reject `$lookup`, `$out`, `$merge`, `$expr` (arbitrary expression), and any stage not in the allowlist with HTTP 400.

### SDK surface (Python)

Added to `SiftHandle`:

```python
sift.find(filter=..., sort=..., project=..., q=..., limit=50, cursor=None) -> dict
sift.records_count(filter=..., q=...) -> int
sift.records_by_ids(ids: list[str]) -> list[dict]
sift.aggregate(pipeline: list[dict], limit: int = 1000) -> list[dict]
sift.query(nl: str, execute: bool = True) -> dict   # existing, extended signature
```

### SDK surface (TypeScript, CR-024)

Mirrors Python. Added methods: `find`, `recordsCount`, `recordsByIds`, `aggregate`. `query` gets the `execute` option.

### MCP tools (CR-023)

`find_records`, `aggregate_sift` (already listed in CR-023) bind directly to the new endpoints.

### Performance

- Add MongoDB indexes on `sift_id + extracted_data.*` for fields the NL agent hints at most often. Concrete index creation deferred to a performance CR but the document model here is what enables it.
- Cursor pagination is `_id`-based; stable across inserts, resilient for large result sets.

### Docs

- `system/api.md` — add the new endpoints to the reference.
- `docs/concepts/querying.mdx` (new Mintlify page) — NL query, structured filter DSL, aggregation pipelines, when to use which.
- `docs/sdk/python.mdx` / `docs/sdk/typescript.mdx` — code samples for `find`, `aggregate`, `query`.

## Files

- `code/server/sifter/api/sifts.py` — CHANGED (add `find` params, count, batch, aggregate endpoints)
- `code/server/sifter/api/query.py` — CHANGED (formalize response shape, add `execute` flag)
- `code/server/sifter/services/filter_dsl.py` — NEW (DSL parser + compiler to `$match`)
- `code/server/sifter/services/pipeline_validator.py` — CHANGED (shared validator used by NL agent, ad-hoc aggregate, and saved aggregations)
- `code/server/tests/test_query_api.py` — CHANGED / NEW (cover new endpoints, filter DSL, cursor pagination)
- `code/sdk/sifter/client.py` — CHANGED (add `find`, `records_count`, `records_by_ids`, `aggregate`, `execute` flag)
- `code/sdk/tests/test_client.py` — CHANGED
- `code/sdk-ts/src/sift-handle.ts` — CHANGED (once CR-024 merges)
- `product/features/server/query.md` — CHANGED (document `execute` flag and stable shape)
- `product/features/server/aggregations.md` — CHANGED (reference ad-hoc `POST /api/sifts/{id}/aggregate`)
- `product/features/server/records-query.md` — NEW (document filter DSL + cursor)
- `system/api.md` — CHANGED (add endpoints)
- `docs/concepts/querying.mdx` — NEW

## Acceptance Criteria

1. `POST /api/sifts/{id}/query` response includes `pipeline`, `results`, `generated_at`. `execute=false` returns `results: null`.
2. `POST /api/sifts/{id}/aggregate` executes ad-hoc pipelines with the same validation as saved aggregations.
3. `GET /api/sifts/{id}/records` accepts `filter`, `sort`, `project`, `q`, `cursor` and returns `next_cursor`.
4. Filter DSL rejects unsupported operators with HTTP 400 and a clear error message.
5. `GET /api/sifts/{id}/records/count` and `POST /api/sifts/{id}/records/batch` work as specified.
6. Python SDK exposes `find`, `records_count`, `records_by_ids`, `aggregate`, `query(execute=...)`.
7. All new behavior is covered by tests.
8. `docs/concepts/querying.mdx` exists with NL + DSL + pipeline examples.
9. Existing `offset`-based pagination still works for one release (deprecation notice in docs).

## Out of Scope

- `$lookup` / cross-sift joins (future — requires a multi-sift model).
- Full-text search ranking tuning (basic regex `$contains` + MongoDB text index is enough for v1).
- Query result caching (adds complexity; revisit if needed).
- Visualization / chart configuration (that's cloud-side).
