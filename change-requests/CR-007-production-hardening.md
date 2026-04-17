---
title: "Production Hardening: persistent queue, rate limiting, health check, pagination, S3 storage"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-13T00:00:00.000Z"
---

## Summary

Phase 1 production hardening. Addresses the highest-priority reliability and scalability gaps identified in the production readiness audit.

---

## 1. MongoDB-Backed Task Queue

Replace the in-memory `asyncio.Queue` in `document_processor.py` with a persistent MongoDB-backed queue.

### New collection: `processing_queue`

```python
class ProcessingTask(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    document_id: str
    sift_id: str
    storage_path: str
    org_id: str
    status: str = "pending"       # pending | processing | done | error
    attempts: int = 0
    max_attempts: int = 3
    error_message: Optional[str] = None
    created_at: datetime
    claimed_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
```

### Worker behaviour

- Workers poll MongoDB with `findOneAndUpdate` (atomic claim): find a `pending` or `error`-with-remaining-attempts task, set `status=processing` and `claimed_at=now`
- If extraction succeeds: set `status=done`, `completed_at=now`
- If extraction fails and `attempts < max_attempts`: set `status=pending`, increment `attempts`, clear `claimed_at` (will be retried)
- If extraction fails and `attempts >= max_attempts`: set `status=error`, store `error_message`
- Stale `processing` tasks (claimed_at > 10min ago) are reclaimed by the next worker poll
- The existing `asyncio.Queue` is removed; workers use a polling loop with `asyncio.sleep(2)` between polls

### API changes

- `enqueue()` function now inserts a `ProcessingTask` document instead of putting to asyncio.Queue
- `start_workers()` still creates N async tasks, but each polls MongoDB instead of the queue
- `ensure_indexes()` on startup: compound index on `(status, created_at)`, index on `document_id`

---

## 2. Rate Limiting

Add `slowapi` to dependencies. Apply limits to sensitive endpoints.

### Limits

| Endpoint | Limit |
|----------|-------|
| `POST /api/auth/login` | 10/minute per IP |
| `POST /api/auth/register` | 5/minute per IP |
| `POST /api/folders/{id}/documents` | 30/minute per IP |
| `POST /api/sifts/{id}/upload` | 30/minute per IP |

### Implementation

- Add `slowapi` to `pyproject.toml`
- Add `Limiter` to `main.py` with `key_func=get_remote_address`
- Add `SlowAPIMiddleware` and exception handler
- Decorate individual endpoints with `@limiter.limit("10/minute")`

---

## 3. Real Health Check

Replace the trivial health check with one that verifies system components.

### New `GET /health` response

```json
{
  "status": "ok",
  "version": "0.1.0",
  "components": {
    "database": "ok",
    "queue": {
      "status": "ok",
      "pending": 12,
      "processing": 3
    }
  }
}
```

- `database`: ping MongoDB with `db.command("ping")`. Returns `"error"` on failure, HTTP 503.
- `queue.pending`: count of `processing_queue` docs with `status=pending`
- `queue.processing`: count with `status=processing`
- If DB unreachable: `{"status": "error", ...}` with HTTP 503

---

## 4. Pagination

All list endpoints return unbounded results today. Add `limit`/`offset` query params.

### Affected endpoints

- `GET /api/sifts` — `?limit=50&offset=0`
- `GET /api/folders` — `?limit=50&offset=0`
- `GET /api/folders/{id}/documents` — `?limit=100&offset=0`
- `GET /api/sifts/{id}/records` — `?limit=100&offset=0`
- `GET /api/aggregations` — `?limit=50&offset=0`
- `GET /api/webhooks` — `?limit=50&offset=0`

### Response format change

Wrap list responses in a pagination envelope:
```json
{
  "items": [...],
  "total": 243,
  "limit": 50,
  "offset": 0
}
```

Update frontend to handle paginated responses. For now, set `limit=1000` from the frontend (functionally equivalent to current behaviour) until proper pagination UI is built.

---

## 5. S3-Compatible Storage Backend

Abstract the file storage layer and add S3 support.

### Interface

```python
class StorageBackend(Protocol):
    async def save(self, org_id: str, folder_id: str, filename: str, data: bytes) -> str:
        """Save file and return storage path/key."""
    async def load(self, path: str) -> bytes:
        """Load file by path/key."""
    async def delete(self, path: str) -> None:
        """Delete file."""
```

### Implementations

- `FilesystemBackend` — existing behaviour, wraps current code
- `S3Backend` — uses `aioboto3`. Stores at `s3://{bucket}/{org_id}/{folder_id}/{filename}`

### Config additions

```
SIFTER_STORAGE_BACKEND=filesystem   # or "s3"
SIFTER_S3_BUCKET=my-sifter-bucket
SIFTER_S3_ENDPOINT_URL=            # optional, for MinIO / R2
SIFTER_S3_REGION=us-east-1
SIFTER_S3_ACCESS_KEY_ID=
SIFTER_S3_SECRET_ACCESS_KEY=
```

- `storage_backend` factory function returns correct implementation based on config
- Document processor and service layer use the backend interface, not direct filesystem calls

---

## Files to Modify

- `sifter/services/document_processor.py` — replace asyncio.Queue with MongoDB polling
- `sifter/main.py` — add rate limiter, update health check, register storage backend
- `sifter/config.py` — add S3 config vars, add rate limit config
- `sifter/api/auth.py` — add rate limit decorators
- `sifter/api/folders.py` — add rate limit on upload, add pagination
- `sifter/api/sifts.py` — add pagination, add rate limit on upload
- `sifter/api/aggregations.py` — add pagination
- `sifter/api/webhooks.py` — add pagination
- `sifter/services/document_service.py` — add pagination params
- `sifter/services/sift_service.py` — add pagination params
- `sifter/services/sift_results.py` — add pagination params
- NEW: `sifter/storage.py` — StorageBackend protocol + FilesystemBackend + S3Backend
- NEW: `sifter/models/processing_task.py` — ProcessingTask model
- `pyproject.toml` — add slowapi, aioboto3
