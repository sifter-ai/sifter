---
title: "Server: Natural Language Query"
status: synced
version: "1.1"
last-modified: "2026-04-17T00:00:00.000Z"
---

# Natural Language Query — Server

Stabilized, contract-stable endpoint: both OSS clients (SDK, CLI, MCP, admin UI) and `sifter-cloud` consume the same response shape.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sifts/{id}/query` | NL → MongoDB pipeline, optionally executed — one-off, not saved |

### Request

```json
{ "query": "Total by client in Q1", "execute": true }
```

- `query` — required natural-language question.
- `execute` — default `true`. When `false`, the server returns only the generated pipeline without running it (useful for UIs that preview/edit the pipeline).

### Response

```json
{
  "pipeline": [ … MongoDB aggregation stages … ],
  "results": [ … rows … ] | null,
  "generated_at": "2026-04-17T00:00:00Z"
}
```

`results` is `null` when `execute=false`.

Auth required: JWT Bearer or `X-API-Key`.

## Pipeline Generation

1. Receives the NL query.
2. `pipeline_agent.py` invokes `SIFTER_PIPELINE_MODEL` with the query + the sift's inferred schema.
3. The generated pipeline is passed through the shared pipeline validator (see `services/pipeline_validator.py`) — same whitelist used by the ad-hoc aggregate and saved-aggregation endpoints.
4. If `execute=true`, the pipeline runs against `sift_results` with the `sift_id` filter prepended.

## Validation Rules

Shared with every pipeline endpoint on this server:

- Field references must target `extracted_data.<fieldName>`.
- Allowed stages: `$group`, `$sort`, `$project`, `$match`, `$unwind`, `$limit`, `$skip`, `$count`.
- Rejected stages (HTTP 400): `$lookup`, `$out`, `$merge`, `$expr`, and anything outside the allowlist.
- `$match` on text fields uses case-insensitive regex.

## Structured Alternatives

`POST /api/sifts/{id}/query` is for conversational / exploratory use. When the schema is known, prefer the structured endpoints:

- `GET /api/sifts/{id}/records` with a filter DSL — see `product/features/server/records-query.md`.
- `POST /api/sifts/{id}/aggregate` for an ad-hoc pipeline — see `product/features/server/aggregations.md`.
- `POST /api/aggregations` for persisted/named queries — see `product/features/server/aggregations.md`.

Structured endpoints skip the LLM roundtrip, making them cheaper and deterministic for programmatic consumers.
