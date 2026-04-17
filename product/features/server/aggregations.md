---
title: "Server: Aggregations (saved + ad-hoc)"
status: synced
version: "1.1"
last-modified: "2026-04-17T00:00:00.000Z"
---

# Aggregations — Server

Two flavors sharing the same pipeline validator and executor:

- **Saved aggregation** — NL query generates a pipeline, stored on the server, re-runnable by id.
- **Ad-hoc aggregation** — client submits a pipeline directly and receives the result in one round-trip.

## Endpoints

### Saved aggregations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/aggregations` | Create saved aggregation (returns immediately, `status: generating`) |
| GET | `/api/aggregations` | List aggregations (`?sift_id=&limit=50&offset=0`) |
| GET | `/api/aggregations/{id}` | Get aggregation detail |
| GET | `/api/aggregations/{id}/result` | Execute the stored pipeline and return results |
| POST | `/api/aggregations/{id}/regenerate` | Re-generate pipeline from NL query |
| DELETE | `/api/aggregations/{id}` | Delete aggregation |

Create body: `{ "name": str, "query": str, "sift_id": str }`
Result response: `{ "results": list, "pipeline": list, "ran_at": str }`

### Ad-hoc aggregation

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sifts/{id}/aggregate` | Execute a client-supplied pipeline without saving |

Request: `{ "pipeline": list[dict], "limit": int = 1000 }`
Response: `{ "results": list[dict], "ran_at": str }`

The pipeline goes through the same validator as saved aggregations (see **Validation** below). The `sift_id` filter is always injected as the first `$match` stage.

Intended for programmatic consumers — SDK/CLI/MCP that construct pipelines deterministically from a known schema. Cheaper and faster than the NL query endpoint because no LLM call is involved.

## Async Pipeline Generation

- `POST /api/aggregations` returns immediately with `status: generating`
- `asyncio.create_task(_generate_and_store_pipeline(...))` runs the LLM call in background
- Client polls `GET /api/aggregations/{id}` (every 2 seconds) until `status` is `ready` or `error`

## Statuses

| Status | Meaning |
|--------|---------|
| `generating` | Pipeline is being created by the LLM agent |
| `ready` | Pipeline stored; can be executed |
| `error` | Pipeline generation failed (`error_message` contains reason) |

## Key Behaviors

- Results from `GET /api/aggregations/{id}/result` and `POST /api/sifts/{id}/aggregate` are always computed fresh (pipeline cached, not results)
- Pipeline generation uses `SIFTER_PIPELINE_MODEL` (cheaper/faster than extraction model)
- `sift_id` filter is always injected automatically — results scoped to that sift
- If extraction schema changes, use `POST /api/aggregations/{id}/regenerate` to rebuild pipeline

## Validation

The pipeline validator (`services/pipeline_validator.py`) is shared across NL query, saved aggregations, and ad-hoc aggregations:

- Allowed stages: `$group`, `$sort`, `$project`, `$match`, `$unwind`, `$limit`, `$skip`, `$count`.
- Field references must target `extracted_data.<fieldName>`.
- Rejected stages (HTTP 400): `$lookup`, `$out`, `$merge`, `$expr`, unknown stages.
- `limit` (ad-hoc): capped server-side at 10 000 regardless of client request.
