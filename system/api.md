---
title: REST API Endpoints
status: changed
version: "1.3"
last-modified: "2026-04-21T00:00:00.000Z"
---

# REST API Endpoints

Base path: `/api`

**Auth:** All endpoints except `/api/auth/register`, `/api/auth/login`, `/api/auth/google`, and `/health` require `Authorization: Bearer <jwt>` or `X-API-Key: sk-...`. Sifter OSS is single-tenant — no org scoping. Multi-tenant org management is a cloud-only feature (see `system/cloud.md`).

**Anonymous access:** By default, requests without credentials are allowed (Principal = `anonymous`). Set `SIFTER_REQUIRE_API_KEY=true` to enforce auth on all endpoints.

## Rate Limits

Enforced via `slowapi`, keyed by client IP.

| Endpoint | Limit |
|----------|-------|
| `POST /api/auth/login` | 10 requests / minute |
| `POST /api/auth/register` | 5 requests / minute |
| `POST /api/auth/google` | 10 requests / minute |
| `POST /api/folders/{id}/documents` | 30 requests / minute |
| `POST /api/sifts/{id}/upload` | 30 requests / minute |

## Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register user; returns JWT + user info |
| POST | `/api/auth/login` | Login; returns JWT + user info |
| POST | `/api/auth/google` | Google OAuth login; exchange authorization code for JWT + user info |
| GET | `/api/auth/me` | Current user info (requires JWT or API key) |
| PATCH | `/api/auth/me` | Update profile (`full_name`, `email`); returns updated user |
| POST | `/api/auth/change-password` | Change password — email-auth only; body `{ current_password, new_password }` |
| POST | `/api/auth/avatar` | Upload avatar (multipart JPEG/PNG/WebP ≤ 2 MB); returns updated user |

Register/Login body: `{ "email", "password", "full_name"? }`
Google body: `{ "code": "<Google OAuth authorization code>" }`
JWT response: `{ "access_token": str, "token_type": "bearer", "user": { id, email, full_name, auth_provider, avatar_url, created_at } }`

Google auth is only available when `SIFTER_GOOGLE_CLIENT_ID` is configured. When not configured, the endpoint returns 404.

## API Keys

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/keys` | List active API keys (prefix + metadata, no hashes) |
| POST | `/api/keys` | Create API key; returns full key **once** |
| DELETE | `/api/keys/{key_id}` | Revoke API key |

Create body: `{ "name": str }`
Create response: `{ "key": {...metadata}, "plaintext": "sk-..." }`

## Sifts

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sifts` | Create new sift |
| GET | `/api/sifts` | List sifts (`?limit=50&offset=0`) |
| GET | `/api/sifts/{id}` | Get sift details |
| PATCH | `/api/sifts/{id}` | Update sift (name, description, instructions, schema) |
| DELETE | `/api/sifts/{id}` | Delete sift + results |
| POST | `/api/sifts/{id}/upload` | Upload documents directly to sift |
| POST | `/api/sifts/{id}/reindex` | Reindex all documents |
| POST | `/api/sifts/{id}/reset` | Reset error state |
| GET | `/api/sifts/{id}/records` | Structured records query: `filter` (DSL), `sort`, `project`, `q`, `limit`, `cursor` — see `product/features/server/records-query.md` |
| GET | `/api/sifts/{id}/records/count` | Count records matching filter + `q` without shipping records |
| POST | `/api/sifts/{id}/records/batch` | Fetch records by a list of IDs. Body: `{ "ids": list[str] }` |
| GET | `/api/sifts/{id}/records/csv` | Stream records as CSV (honors `filter`, `sort`, `project`, `q`) |
| PATCH | `/api/sifts/{id}/records/{record_id}` | Correct one or more fields. Body: `{ "corrections": { field: { value, scope: "local"\|"rule"\|"reset" } } }`. Returns merged record. 422 on unknown field or type mismatch. |
| GET | `/api/sifts/{id}/correction-rules` | List correction rules (`?active_only=true` default). |
| DELETE | `/api/sifts/{id}/correction-rules/{rule_id}` | Soft-delete rule (`active = false`). Existing overrides on records are unchanged. |
| POST | `/api/sifts/{id}/correction-rules/{rule_id}/backfill` | Apply rule to all matching existing records. Returns `{ applied_count }`. Sync ≤500 records, async above. |
| GET | `/api/sifts/{id}/documents` | List all documents processed by this sift with per-document status (`?limit=50&offset=0`) |
| POST | `/api/sifts/{id}/query` | NL query → `{ pipeline, results, generated_at }`; `execute: false` returns only the pipeline |
| POST | `/api/sifts/{id}/aggregate` | Ad-hoc aggregation pipeline (no save). Body: `{ "pipeline": list, "limit": int = 1000 }` |
| POST | `/api/sifts/{id}/chat` | Scoped Q&A chat (schema-aware) |
| POST | `/api/sifts/{id}/extract` | Enqueue extraction for one document on this sift. Body: `{ "document_id": str }` → `{ "task_id": str, "status": "queued" }` |
| GET | `/api/sifts/{id}/extraction-status` | Per-document extraction status. `?document_id=<id>` → `{ "status": "queued\|running\|completed\|failed", "error"?: str }` |

| GET | `/api/sifts/{id}/schema` | Structured schema: `{ schema_text, schema_fields, schema_version }` |
| GET | `/api/sifts/{id}/schema.pydantic` | `text/plain` — Pydantic class |
| GET | `/api/sifts/{id}/schema.ts` | `text/plain` — TypeScript `interface` |
| GET | `/api/sifts/{id}/schema.json` | JSON Schema draft 2020-12 |

Chat body/response: `{ "message": str, "history"?: list }` → `{ "response": str, "data"?: list, "pipeline"?: list }`

List response envelope:
- Default (cursor) — `{ "items": [...], "next_cursor": str | null, "total": int | null }`
- Legacy (offset, deprecated) — `{ "items": [...], "total": 243, "limit": 50, "offset": 0 }`

## Aggregations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/aggregations` | Create saved aggregation (returns immediately, `status: generating`) |
| GET | `/api/aggregations` | List aggregations (`?sift_id=&limit=50&offset=0`) |
| GET | `/api/aggregations/{id}` | Get aggregation detail |
| GET | `/api/aggregations/{id}/result` | Execute pipeline and return results |
| POST | `/api/aggregations/{id}/regenerate` | Re-generate pipeline from NL query |
| DELETE | `/api/aggregations/{id}` | Delete aggregation |

Result response: `{ "results": list, "pipeline": list, "ran_at": str }`

## Folders

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/folders` | List folders (`?limit=50&offset=0`) |
| POST | `/api/folders` | Create folder |
| GET | `/api/folders/{folder_id}` | Folder detail + linked sifts |
| PATCH | `/api/folders/{folder_id}` | Update folder (name, description) |
| DELETE | `/api/folders/{folder_id}` | Delete folder and all documents |
| GET | `/api/folders/{folder_id}/extractors` | List linked sifts |
| POST | `/api/folders/{folder_id}/extractors` | Link sift: `{ "sift_id": str }` |
| DELETE | `/api/folders/{folder_id}/extractors/{sift_id}` | Unlink sift |
| GET | `/api/folders/{folder_id}/documents` | List documents with per-sift status (`?limit=100&offset=0`) |
| POST | `/api/folders/{folder_id}/documents` | Upload document (multipart); triggers processing |

## Webhooks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/webhooks` | List webhooks |
| POST | `/api/webhooks` | Register webhook |
| DELETE | `/api/webhooks/{hook_id}` | Delete webhook |

Register body: `{ "events": list[str], "url": str, "sift_id"?: str }`
Events support wildcard patterns: `sift.*`, `**`, etc.
Delivery: HTTP POST to `url` with body `{ "event": str, "payload": {...} }`

Event types: `sift.document.processed`, `sift.document.discarded`, `sift.completed`, `sift.error`, `sift.schema.changed`, `folder.document.uploaded`

`sift.schema.changed` payload: `{ sift_id, old_version, new_version, added_fields, removed_fields, changed_fields }` — see `product/features/server/typed-schemas.md`.

## Documents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/documents/{document_id}` | Document detail + per-sift statuses |
| GET | `/api/documents/{document_id}/download` | Download the original file bytes |
| DELETE | `/api/documents/{document_id}` | Delete document + all extraction results |
| POST | `/api/documents/{document_id}/reprocess` | Re-trigger extraction; optional `{ "sift_id": str }` in body |
| GET | `/api/documents/{document_id}/pages` | Page dimensions + thumbnail URLs |
| GET | `/api/documents/{document_id}/pages/{n}/image` | Rendered page PNG (cached). `?dpi=150` (default), max 300 |

## Citations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sifts/{sift_id}/records/{record_id}/citations` | Per-field citation map `{ field: { document_id, source_text, page?, confidence?, inferred? } }`. `bbox` is reserved and not populated in the current version. |

See `product/features/server/citations.md` for the full shape and the extraction pipeline that populates it.

## Chat

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat` | Global chat (optional `sift_id`) |

Chat body: `{ "message": str, "sift_id"?: str, "history"?: list }`
Chat response: `{ "response": str, "data"?: list, "pipeline"?: list }`

## Config

`GET /api/config` — no auth required. Returns deployment-level configuration.

```json
{ "mode": "oss", "google_auth_enabled": false }
```

`google_auth_enabled` is `true` when `SIFTER_GOOGLE_CLIENT_ID` is set. The frontend uses this to show/hide the "Sign in with Google" button.

In `sifter-cloud`, this is overridden to return `{ "mode": "cloud" }`. The frontend uses this to show/hide billing, team management, and org switching.

## Health

`GET /health` — no auth required.

Response:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "components": {
    "database": "ok",
    "queue": { "status": "ok", "pending": 3, "processing": 1 }
  }
}
```

Returns HTTP 503 if any component reports an error.
