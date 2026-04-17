---
title: "SDK: remove direct mode, server-only, folder-centric API"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-13T00:00:00.000Z"
---

## Summary

Redesign the Python SDK around two principles:

1. **Server-only** — remove direct mode. The SDK always connects to a Sifter server (local or remote). No `mode`, `mongodb_uri`, `llm_model`, or `llm_api_key` parameters.
2. **Sift-centric API with folder support** — the **Sift** is the core entity (instructions + persistent database of results). A **Folder** is a shared document container that can feed multiple sifts. A sift can also receive documents directly.

### SDK API

```python
from sifter import Sifter

s = Sifter(api_key="sk-...")  # or api_url="http://localhost:8000"

# ── One-liner convenience ──
records = s.sift("./invoices/", "client, date, total")

# ── Sift CRUD ──
sift = s.create_sift("Invoices", "client, date, total, VAT")
sift = s.get_sift("sift_id")
sifts = s.list_sifts()
sift.update(name="Invoices 2024", instructions="...")
sift.delete()

# ── Sift: documents and results ──
sift.upload("./invoices/")
sift.wait()
records = sift.records()
results = sift.query("Total by client")
sift.export_csv("output.csv")

# ── Folder CRUD ──
folder = s.create_folder("Contracts 2024")
folder = s.get_folder("folder_id")
folders = s.list_folders()
folder.update(name="Contracts 2024-2025")
folder.delete()

# ── Folder: documents and sifts ──
folder.upload("./contracts/")
docs = folder.documents()
folder.add_sift(sift)
folder.remove_sift(sift)
linked = folder.sifts()

# ── Multi-sift on same folder ──
parties = s.create_sift("Parties", "contracting parties, dates")
clauses = s.create_sift("Clauses", "non-compete, termination conditions")
folder.add_sift(parties)
folder.add_sift(clauses)
# → all folder docs processed by both sifts
```

### Key concepts

- **Sift** — defines what to extract (instructions/schema) and owns a persistent database of extracted records. Can receive documents directly or via linked folders. Queries and aggregations run against the sift's database in real-time.
- **Folder** — shared document container. When a document is added, modified, or deleted, all linked sifts are updated. A folder can feed multiple sifts. A sift can be linked to multiple folders.
- **One-liner** — `s.sift(path, instructions)` creates a temporary sift, uploads docs, waits, and returns records.

## Changes to product/

### product/features/sdk.md (CHANGED)

Full rewrite:

- Remove "Direct Mode" section and all references to `mode`, `mongodb_uri`, `llm_model`, `llm_api_key`
- Remove "Modes" section
- Constructor becomes: `Sifter(api_url="http://localhost:8000", api_key="")` — `api_key` can also be set via `SIFTER_API_KEY` env var
- Document the full API as described above: Sift CRUD, Folder CRUD, upload, query, records, export, folder↔sift linking
- Document the one-liner `s.sift()` convenience method
- Add note: "Start the server with `./run.sh` before using the SDK"

## Changes to system/

### system/architecture.md (CHANGED)

- Remove any reference to direct mode from diagrams and descriptions
- The SDK is a pure HTTP client wrapping the REST API

## Changes to code/

### code/sifter/sdk/client.py (CHANGED)

Rewrite with three classes:

**`Sifter`** (client):
- Constructor: `Sifter(api_url="http://localhost:8000", api_key="")`
- Reads `SIFTER_API_KEY` env var as fallback for `api_key`
- Sends `X-API-Key` header on every request
- Methods: `create_sift()`, `get_sift()`, `list_sifts()`, `create_folder()`, `get_folder()`, `list_folders()`, `sift()` (one-liner)

**`SiftHandle`**:
- Properties: `id`, `name`, `instructions`, `status`
- Methods: `upload(path)`, `wait()`, `records()`, `query(nl_query)`, `export_csv(path)`, `update(**kwargs)`, `delete()`

**`FolderHandle`**:
- Properties: `id`, `name`
- Methods: `upload(path)`, `documents()`, `add_sift(sift)`, `remove_sift(sift)`, `sifts()`, `update(**kwargs)`, `delete()`

Remove all `if self.mode == "direct": ...` branches. Keep only HTTP calls via `httpx`.
