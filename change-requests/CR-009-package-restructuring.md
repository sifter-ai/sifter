---
title: "Package restructuring: server/sdk split + namespace + features modulith"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-15T00:00:00.000Z"
---

## Summary

The codebase has been refactored into two separate packages sharing the `sifter` Python namespace. The documentation needs to reflect this new layout. Additionally, `product/features/` is reorganised into a modulith structure with `server/`, `frontend/`, and `sdk/` subdirectories — each feature has one doc describing the API/backend and one describing the UI that consumes it.

---

## 1. Package split

The single `code/sifter/` package has been split into two:

| Package | PyPI name | Python namespace | Entry point |
|---------|-----------|-----------------|-------------|
| `code/server/` | `sifter-server` | `sifter` (namespace, no `__init__.py`) | `sifter.server:run` |
| `code/sdk/` | `sifter-ai` | `sifter` (owns `__init__.py`) | — |

Both packages share the `sifter` Python namespace via Python 3.3+ implicit namespace packages. When only `sifter-server` is installed, `from sifter.server import app` works normally. When both are installed (e.g. in dev), the SDK's `__init__.py` adds `Sifter`, `SiftHandle`, `FolderHandle` to the `sifter` namespace.

### Imports

```python
# Server (sifter-cloud extension point)
from sifter.server import app

# SDK
from sifter import Sifter, SiftHandle, FolderHandle
```

### Entry points

```bash
# Run server
sifter-server        # CLI entrypoint (calls sifter.server:run)
uvicorn sifter.server:app --reload

# Install SDK only
pip install sifter-ai
```

---

## 2. Project layout (updated)

```
code/
├── server/                        ← sifter-server package
│   ├── pyproject.toml             # name = "sifter-server"
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── run.sh
│   ├── .env.example
│   ├── sifter/                    # namespace package (no __init__.py)
│   │   ├── server.py              # FastAPI app, lifespan, routers
│   │   ├── config.py
│   │   ├── auth.py
│   │   ├── db.py
│   │   ├── limiter.py
│   │   ├── storage.py
│   │   ├── models/
│   │   ├── services/
│   │   ├── api/
│   │   └── prompts/
│   └── tests/
├── sdk/                           ← sifter-ai package
│   ├── pyproject.toml             # name = "sifter-ai"
│   └── sifter/
│       ├── __init__.py            # exports Sifter, SiftHandle, FolderHandle
│       └── client.py
└── examples/
```

Key changes from the old layout:
- `code/sifter/main.py` → `code/server/sifter/server.py`
- `code/sifter/sdk/` removed — SDK lives in `code/sdk/`
- No `__init__.py` in `code/server/sifter/` — namespace package
- `run.sh` moved from `code/run.sh` to `code/server/run.sh`

---

## 3. Features modulith restructuring

`product/features/` is reorganised into three subdirectories:

```
product/features/
├── server/          ← API endpoints, backend logic, processing
│   ├── auth.md
│   ├── extraction.md
│   ├── documents.md
│   ├── query.md
│   ├── aggregations.md
│   └── qa-agents.md
├── frontend/        ← UI pages, components, user flows
│   ├── auth.md
│   ├── extraction.md
│   ├── documents.md
│   ├── query.md
│   ├── aggregations.md
│   └── chat.md
└── sdk/             ← Python client library
    └── sdk.md
```

### Convention

- `features/server/<feature>.md` describes the API contract: endpoints, request/response shapes, business logic, error cases, auth requirements.
- `features/frontend/<feature>.md` describes the UI: pages, routes, components, user flows, interactions, how the frontend consumes the server API.
- `features/sdk/sdk.md` describes the Python SDK client.

### Feature split mapping

| Old flat file | → server/ | → frontend/ |
|---------------|-----------|-------------|
| `auth.md` | `server/auth.md` — endpoints, JWT, API key mechanics | `frontend/auth.md` — login/register pages, settings API Keys tab |
| `extraction.md` | `server/extraction.md` — sift CRUD API, processing pipeline, schema inference | `frontend/extraction.md` — sifts list page, sift detail page (records, reindex, export) |
| `documents.md` | `server/documents.md` — folder/document API, processing queue, storage backend | `frontend/documents.md` — folder browser, document detail, upload modal, status badges |
| `query.md` | `server/query.md` — `POST /api/sifts/{id}/query`, pipeline generation | `frontend/query.md` — query input, results table, pipeline viewer |
| `aggregations.md` | `server/aggregations.md` — aggregation CRUD API, async generation, result endpoint | `frontend/aggregations.md` — aggregations panel, status polling, named queries list |
| `qa-agents.md` | `server/qa-agents.md` — `POST /api/sifts/{id}/chat`, agent logic, context | *(no frontend/ counterpart — consumed by frontend/chat.md)* |
| `chat.md` | *(no server/ counterpart — API documented in server/qa-agents.md)* | `frontend/chat.md` — chat page, tab on sift detail, message rendering, pipeline toggle |
| `sdk.md` | — | — |
| `sdk.md` | → `sdk/sdk.md` | — |

---

## 4. Documentation files to update

### `system/architecture.md`

- Replace the `## Package` field in Backend section: `sifter-server` (not `sifter-ai`)
- Remove `**SDK**: pure HTTP client...` line from Backend section (SDK is a separate package)
- Remove `> **No frontend in this repo.**` note (frontend moves to OSS in CR-010)
- Remove `sdk/` from the project layout tree
- Rename `code/sifter/main.py` → `code/server/sifter/server.py` in project layout
- Add note: `sifter.server` is a namespace package — `sifter-server` and `sifter-ai` share the `sifter` namespace
- Rename `run.sh` path from `code/run.sh` to `code/server/run.sh` in project layout
- Add `sdk/` top-level entry to project layout (pointing to `sifter-ai`)
- Limiter entry in layout: `limits.py` entry point → `get_usage_limiter()`

### `system/cloud.md`

- Update import in Extension Pattern code block: `from sifter.main import app` → `from sifter.server import app`
- Update sifter-cloud pyproject.toml dependency: `sifter-ai>=0.1.0` → `sifter-server>=0.1.0`
- Update Feature Matrix: `React UI` row — change `OSS` column from `—` to `✓` (will be added in CR-010; anticipate here)

### `system/deployment.md`

- Update dev path: `cd code` → `cd code/server`
- Update run.sh reference: `code/run.sh` → `code/server/run.sh`
- Update Docker section: Dockerfile is at `code/server/Dockerfile`
- Remove cloud UI note: `> **Note:** This document covers the OSS sifter-ai backend only...For the full product with React frontend, see the sifter-cloud repo.` — frontend will be in this repo after CR-010
- Update SDK section: `pip install sifter-ai` (correct — SDK PyPI name is already right)

### `product/features/sdk.md` → `product/features/sdk/sdk.md`

- Move file to new location
- Update PyPI install: ensure it says `pip install sifter-ai`
- Update import: ensure it says `from sifter import Sifter` (no `sifter_sdk`)

### All flat `product/features/*.md`

Split each file into `server/<name>.md` (API/logic) and `frontend/<name>.md` (UI), following the mapping in section 3 above. The old flat files are deleted after the split.

---

## Files to Create

- `product/features/server/auth.md`
- `product/features/server/extraction.md`
- `product/features/server/documents.md`
- `product/features/server/query.md`
- `product/features/server/aggregations.md`
- `product/features/server/qa-agents.md`
- `product/features/frontend/auth.md`
- `product/features/frontend/extraction.md`
- `product/features/frontend/documents.md`
- `product/features/frontend/query.md`
- `product/features/frontend/aggregations.md`
- `product/features/frontend/chat.md`
- `product/features/sdk/sdk.md`

## Files to Modify

- `system/architecture.md` — layout, package names, namespace note
- `system/cloud.md` — import path, dependency name, feature matrix
- `system/deployment.md` — paths, remove cloud note

## Files to Delete (superseded by split)

- `product/features/auth.md`
- `product/features/extraction.md`
- `product/features/documents.md`
- `product/features/query.md`
- `product/features/aggregations.md`
- `product/features/qa-agents.md`
- `product/features/chat.md`
- `product/features/sdk.md`
