---
title: Architecture & Tech Stack
status: synced
version: "1.1"
last-modified: "2026-04-17T00:00:00.000Z"
---

# Architecture & Tech Stack

## Client Layer

Four first-class clients against the public REST API — all shipped from this repo:

| Client | Package | Location | Purpose |
|--------|---------|----------|---------|
| Python SDK | `sifter-ai` (PyPI) | `code/sdk/` | Server-side Python integrations, scripts |
| TypeScript SDK | `@sifter-ai/sdk` (npm) | `code/sdk-ts/` | Node / edge / browser; ESM-only, zero runtime deps, first-class types |
| CLI | `@sifter-ai/cli` (npm) / `npx @sifter-ai/cli` | `code/cli/` | Terminal scripting, CI, quick evaluation |
| MCP Server | `sifter-mcp` (PyPI) / `uvx sifter-mcp` | `code/mcp/` | AI agent integration (Claude Desktop, Cursor, custom agents) via Model Context Protocol — read + write + structured query |
| Zapier App | `@sifter-ai/zapier` (Zapier Developer Platform) | `code/zapier/` | Triggers and actions over the public REST API + webhooks; consumes only public endpoints, no private surface |

**Rule:** clients MUST NOT call private endpoints. Every capability a client offers must be available over the same public REST API that third parties consume. This is the same rule the `sifter-cloud` product follows.

## Backend

- **Language**: Python 3.11+
- **Framework**: FastAPI (async)
- **Database**: MongoDB via `motor` (async driver)
- **AI**: LiteLLM (multi-provider: OpenAI, Anthropic, Google, Ollama)
- **PDF processing**: pymupdf (fitz) for page images; DOCX via mammoth (→ Markdown); HTML via beautifulsoup4 (→ plain text); TXT/MD/CSV via stdlib
- **Auth**: `python-jose` (JWT HS256) + `passlib[bcrypt]` (password hashing) + `google-auth` (Google OAuth ID token verification)
- **Rate limiting**: `slowapi` with `get_remote_address` key function
- **Logging**: structlog
- **Validation**: Pydantic v2
- **Settings**: pydantic-settings with `SIFTER_` env prefix
- **Package**: `sifter-server` on PyPI — namespace package `sifter` (no `__init__.py`)
- **SDK**: separate package `sifter-ai` on PyPI (`code/sdk/`) — pure HTTP client (`httpx`), shares `sifter` namespace

## Auth Middleware

A FastAPI dependency `get_current_principal()` is applied to all protected routes:

```python
@dataclass
class Principal:
    key_id: str  # "anonymous" | "bootstrap" | DB api_key _id | user _id (from JWT)
```

Resolution order:
1. `X-API-Key` header present → check bootstrap key (config value) or hash-lookup in DB
2. `Authorization: Bearer <jwt>` → decode HS256, extract `sub` (user_id)
3. No header → `Principal(key_id="anonymous")` if `require_api_key=False`, else HTTP 401

Invalid key (present but unrecognized) always raises HTTP 401.

### Google OAuth 2.0

When `SIFTER_GOOGLE_CLIENT_ID` is configured, users can authenticate via Google:

1. Frontend renders a "Sign in with Google" button using `@react-oauth/google`
2. On success, the frontend sends the authorization code to `POST /api/auth/google`
3. Backend exchanges the code for tokens via `POST https://oauth2.googleapis.com/token`
4. Backend verifies the ID token, extracts `sub` (Google user ID), `email`, `name`
5. User is looked up by `google_id`, then by `email` (for account linking), or created
6. A standard Sifter JWT is issued — no changes to `get_current_principal()` needed

Configuration env vars: `SIFTER_GOOGLE_CLIENT_ID`, `SIFTER_GOOGLE_CLIENT_SECRET`, `SIFTER_GOOGLE_REDIRECT_URI`.

### JWT Configuration

- Algorithm: HS256
- Secret: `SIFTER_JWT_SECRET`
- Expiry: `SIFTER_JWT_EXPIRE_MINUTES` (default: 1440 = 24h)
- Payload: `{ "sub": user_id, "exp": ... }`

### API Key Format

- Format: `sk-<secrets.token_urlsafe(36)>` (~50 chars total)
- Display prefix: first 12 chars (e.g. `sk-AbCdEfGhIjKl...`)
- Stored: `SHA-256(key_without_sk_prefix)` as hex string in `api_keys.key_hash`
- Full key shown once at creation, never stored

## Rate Limiting

`slowapi` middleware is mounted globally. Specific endpoints have per-IP limits:

| Endpoint | Limit |
|----------|-------|
| `POST /api/auth/login` | 10 / minute |
| `POST /api/auth/register` | 5 / minute |
| `POST /api/auth/google` | 10 / minute |
| `POST /api/folders/{id}/documents` | 30 / minute |
| `POST /api/sifts/{id}/upload` | 30 / minute |

Limiter lives in `sifter/limiter.py` and is imported by `sifter/server.py`.

## Background Document Processing Queue

MongoDB-backed polling queue. Workers call `document_processor.worker()` which:

1. Polls `processing_queue` collection every 2 seconds for `status=pending` tasks
2. Claims task atomically (`findOneAndUpdate`: `status=processing`, `claimed_at=now`, `attempts++`)
3. Runs extraction via `SiftService.process_single_document()`
4. On success: `status=done`, updates `DocumentSiftStatus`, fires webhook
5. On failure: if `attempts < max_attempts` → `status=pending` (retry); else `status=error`
6. Stale `processing` tasks (claimed_at > 10 min ago) are reclaimed automatically

`SIFTER_MAX_WORKERS` (default: 4) worker coroutines are started via `asyncio.create_task()` in the FastAPI lifespan.

## Storage Backend

Abstracted behind a `StorageBackend` protocol in `sifter/storage.py`:

```python
class StorageBackend(Protocol):
    async def save(self, folder_id: str, filename: str, data: bytes) -> str:
        """Save file and return storage path / key."""
    async def load(self, path: str) -> bytes:
        """Load file by path / key."""
    async def delete(self, path: str) -> None:
        """Delete file."""
```

Implementations selected by `SIFTER_STORAGE_BACKEND`:

| Value | Class | Notes |
|-------|-------|-------|
| `filesystem` (default) | `FilesystemBackend` | Saves to `SIFTER_STORAGE_PATH` |
| `s3` | `S3Backend` | `aioboto3`; requires `SIFTER_S3_*` vars |
| `gcs` | `GCSBackend` | `google-cloud-storage`; requires `SIFTER_GCS_*` vars |

`Document.storage_path` stores the opaque path/key returned by `backend.save()`.

## Event System

Events are emitted on document processing completion and errors:

- **Webhooks**: stored in `webhooks` collection (`events` pattern list, `url`, optional `sift_id` filter). On each event the server fans out to all matching webhooks via background `httpx` POST calls.
- **SDK callbacks**: `SiftHandle.on()` / `FolderHandle.on()` register Python callbacks; wildcard matching runs client-side during `wait()` polling.

Event types: `sift.document.processed`, `sift.completed`, `sift.error`, `folder.document.uploaded`.

Wildcard matching: `*` matches one segment, `**` matches any number of segments.

## Async Aggregation Pipeline Generation

- `POST /api/aggregations` returns immediately with `status=generating`
- `asyncio.create_task(_generate_and_store_pipeline(...))` runs LLM call in background
- Client polls `GET /api/aggregations/{id}` every 2 seconds until `status` is `ready` or `error`

## OSS Extension Points

To support the cloud layer without forking, the OSS exposes two protocol interfaces with no-op defaults:

### `UsageLimiter` (`sifter/services/limits.py`)

```python
class UsageLimiter(Protocol):
    async def check_upload(self, org_id: str, file_size_bytes: int) -> None:
        """Raise HTTPException(402) to block upload."""
    async def check_sift_create(self, org_id: str) -> None:
        """Raise HTTPException(402) to block sift creation."""
    async def record_processed(self, org_id: str, doc_count: int) -> None:
        """Record usage for billing metering."""
```

Default: `NoopLimiter`. Exposed as `get_usage_limiter()` FastAPI dependency.

Call sites:
- `check_upload()` — before file save in `POST /api/folders/{id}/documents` and `POST /api/sifts/{id}/upload`
- `check_sift_create()` — before insert in `POST /api/sifts`
- `record_processed()` — after successful extraction in `document_processor.worker()`

### `EmailSender` (`sifter/services/email.py`)

```python
class EmailSender(Protocol):
    async def send_invite(self, to: str, org_name: str, invite_url: str) -> None: ...
    async def send_password_reset(self, to: str, reset_url: str) -> None: ...
    async def send_usage_alert(self, to: str, org_name: str, usage_pct: float) -> None: ...
```

Default: `NoopEmailSender`. Exposed as `get_email_sender()` FastAPI dependency.

The cloud repo overrides both via `app.dependency_overrides`:
```python
app.dependency_overrides[get_usage_limiter] = lambda: StripeLimiter()
app.dependency_overrides[get_email_sender]  = lambda: ResendEmailSender()
```

## Frontend

- **Framework**: React 18 + Vite + TypeScript
- **UI components**: shadcn/ui + Tailwind CSS
- **State**: TanStack React Query + React Router v6
- **Location**: `code/frontend/`
- **Mode-aware**: adapts UI based on `GET /api/config` response (`mode: "oss"` | `"cloud"`)
- In dev: Vite on `:3000` proxies `/api` to FastAPI `:8000`
- In production: FastAPI serves `frontend/dist/` via `StaticFiles` on `/`

## Integrations

Sifter publishes first-party integrations with no-code automation platforms. They consume only the public REST API and public webhook events — no private endpoints. This is the same rule `sifter-cloud` follows.

### Zapier

A Zapier Platform CLI app lives at `code/zapier/` (JavaScript/TypeScript). It is distributed through the Zapier Developer Portal, not through npm/PyPI.

- **Auth:** API key. User provides `api_url` (default `https://api.sifter.ai`, overridable for self-host) and `api_key`. Test request: `GET {api_url}/api/sifts?limit=1`.
- **Triggers** (preferring webhooks; polling fallback): `record_created`, `sift_completed`, `document_processed`. Webhook triggers subscribe via `POST /api/webhooks` on enable and unsubscribe via `DELETE /api/webhooks/{id}` on disable.
- **Actions:** `upload_document`, `create_sift`, `run_extraction`.
- **Searches:** `find_records`, `get_record`.
- **Dynamic dropdowns:** `sift_id` and `folder_id` fields are populated by calling `GET /api/sifts` / `GET /api/folders`.
- **Distribution:** authored via `zapier push`; submitted for public certification through the Zapier Developer Portal (4–6 week review cadence).

Zapier certification runs in parallel with the rest of Phase 4 — the app ships first, goes public when certified.

Other no-code platforms (Make.com, n8n, Pipedream) are not in scope for this repo. The same public-API-only rule would apply if they are added later.

## All-in-One Image Topology

For the zero-friction evaluation path (`docker run ghcr.io/sifter-ai/sifter`), a separate multi-stage Dockerfile (`code/docker/Dockerfile.allinone`) packages the API, the built frontend, and an embedded MongoDB 7 behind `supervisord`:

- `supervisord` runs two programs: `mongod` (bound to `127.0.0.1:27017`, dbpath `/data/db`) and `uvicorn` serving the FastAPI app on `0.0.0.0:8000`.
- The built React frontend is served as static files by FastAPI — no separate nginx.
- First-boot logic (`code/docker/entrypoint.sh`) validates required env (`SIFTER_LLM_API_KEY`), initializes the dbpath, and hands off to `supervisord`.
- `SIFTER_DISABLE_EMBEDDED_MONGO=true` skips starting `mongod`; the API then uses `SIFTER_MONGODB_URI`.

The all-in-one image shares no runtime Python code with `code/server/Dockerfile`; both build from the same `code/server` source tree.

## Project Layout

```
code/
├── server/                        ← sifter-server package (PyPI: sifter-server)
│   ├── pyproject.toml
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── run.sh                     # starts MongoDB + API
│   ├── sifter/                    # namespace package (no __init__.py)
│   │   ├── server.py              # FastAPI app, lifespan, routers, StaticFiles mount
│   │   ├── config.py
│   │   ├── auth.py                # Principal, get_current_principal, JWT + bcrypt helpers
│   │   ├── db.py                  # motor client, get_db()
│   │   ├── limiter.py             # slowapi Limiter instance
│   │   ├── storage.py             # StorageBackend protocol + FilesystemBackend, S3Backend, GCSBackend
│   │   ├── models/
│   │   │   ├── user.py            # User (for auth), APIKey
│   │   │   ├── sift.py            # Sift, SiftStatus
│   │   │   ├── sift_result.py     # SiftResult
│   │   │   ├── document.py        # Folder, Document, FolderExtractor, DocumentSiftStatus
│   │   │   ├── aggregation.py     # Aggregation
│   │   │   ├── processing_task.py # ProcessingTask (queue)
│   │   │   └── webhook.py         # Webhook
│   │   ├── services/
│   │   │   ├── api_key_service.py
│   │   │   ├── document_service.py
│   │   │   ├── document_processor.py   # MongoDB polling queue + workers
│   │   │   ├── sift_service.py
│   │   │   ├── sift_results.py
│   │   │   ├── aggregation_service.py
│   │   │   ├── sift_agent.py           # LLM extraction agent
│   │   │   ├── pipeline_agent.py       # aggregation pipeline generator
│   │   │   ├── qa_agent.py             # chat / Q&A agent
│   │   │   ├── webhook_service.py
│   │   │   ├── limits.py               # UsageLimiter protocol + NoopLimiter + get_usage_limiter()
│   │   │   └── email.py                # EmailSender protocol + NoopEmailSender + get_email_sender()
│   │   ├── api/
│   │   │   ├── auth.py
│   │   │   ├── keys.py
│   │   │   ├── orgs.py            # stub router — org management is cloud-only
│   │   │   ├── sifts.py
│   │   │   ├── folders.py
│   │   │   ├── documents.py
│   │   │   ├── aggregations.py
│   │   │   ├── chat.py
│   │   │   ├── config.py          # GET /api/config → { "mode": "oss" }
│   │   │   └── webhooks.py
│   │   └── prompts/
│   │       ├── extraction.md
│   │       ├── aggregation_pipeline.md
│   │       ├── chat_agent.md
│   │       └── qa_agent.md
│   └── tests/
├── sdk/                           ← sifter-ai package (PyPI: sifter-ai)
│   ├── pyproject.toml
│   └── sifter/
│       ├── __init__.py            # exports Sifter, SiftHandle, FolderHandle
│       └── client.py
├── frontend/                      ← React UI
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── context/               # AuthContext, ConfigContext
│       ├── lib/
│       │   └── apiFetch.ts        # auth-injecting fetch wrapper
│       ├── api/
│       ├── hooks/
│       ├── pages/
│       └── components/
└── examples/
```

> **Namespace packages**: `sifter-server` and `sifter-ai` share the `sifter` Python namespace via Python 3.3+ implicit namespace packages. The SDK owns `sifter/__init__.py`; the server has no `__init__.py`. When only `sifter-server` is installed, `from sifter.server import app` works normally. When both are installed, `from sifter import Sifter` also works.
