---
title: Python SDK
status: changed
version: "1.1"
last-modified: "2026-04-17T00:00:00.000Z"
---

# Python SDK

A developer-facing Python package (`pip install sifter-ai`) for programmatic use of Sifter. The SDK is a pure HTTP client that always connects to a running Sifter server (local or remote). There is no direct mode.

> Start the server with `cd code/server && ./run.sh` before using the SDK.

## Quick Start

```python
from sifter import Sifter

s = Sifter(api_key="sk-...")  # or api_url="http://localhost:8000"

# One-liner convenience
records = s.sift("./invoices/", "client, date, total")
```

## Constructor

```python
s = Sifter(
    api_url="http://localhost:8000",  # default
    api_key="",                       # or set SIFTER_API_KEY env var
)
```

- `api_key` can also be set via the `SIFTER_API_KEY` environment variable.
- Every request sends the `X-API-Key` header automatically.

## Sift CRUD

A **Sift** defines what to extract (instructions/schema) and owns a persistent database of extracted records. It can receive documents directly or via linked folders.

```python
sift = s.create_sift("Invoices", "client, date, total, VAT")
sift = s.get_sift("sift_id")
sifts = s.list_sifts()
sift.update(name="Invoices 2024", instructions="...")
sift.delete()
```

## Sift: Documents and Results

```python
sift.upload("./invoices/")        # directory or file path
sift.wait()                       # block until processing complete
records = sift.records()          # list of dicts (paginated; use cursor for > 50)
results = sift.query("Total by client")
sift.export_csv("output.csv")
```

## Sift: Extraction Control

```python
task = sift.extract(document_id)                # enqueue extraction for a single doc
status = sift.extraction_status(document_id)    # "queued" | "running" | "completed" | "failed"
```

## Typed Records

Pass a Pydantic model via `model=` to get validated, typed records back instead of `dict`.

```python
from pydantic import BaseModel
from sifter import Sifter

class Invoice(BaseModel):
    client: str | None = None
    date: str | None = None
    amount: float | None = None

records: list[Invoice] = sift.records(model=Invoice)
first_page = sift.find(filter={"amount": {"$gt": 1000}}, model=Invoice)
```

Generate the model file locally via the CLI, or fetch the structured schema via `sift.schema()`:

```python
schema = sift.schema()
# { "schema_text": "…", "schema_fields": [...], "schema_version": 3 }
```

See `product/features/server/typed-schemas.md`.

## Citations

```python
citations = sift.record(record_id).citations()
# { "client": {"document_id": "doc_…", "page": 1, "bbox": [...], "source_text": "Acme"},
#   "total":  {"document_id": "doc_…", "page": 2, "bbox": [...], "source_text": "€1,423.50"} }

doc = s.document(document_id)
n_pages = doc.page_count()
png_bytes = doc.page_image(page=1, dpi=150)
```

## Sift: Structured Queries

Direct, typed alternatives to natural-language queries for programmatic consumers.

```python
# Filter with Mongo-subset operators + cursor pagination
page = sift.find(
    filter={"total": {"$gt": 1000}, "currency": "EUR"},
    sort=[("date", -1)],
    limit=50,
    cursor=None,
)
records, next_cursor = page.records, page.next_cursor

# Arbitrary aggregation pipeline (ad-hoc, not saved)
rows = sift.aggregate([
    {"$group": {"_id": "$client", "total": {"$sum": "$total"}}},
    {"$sort": {"total": -1}},
])

count = sift.records_count(filter={"status": "paid"})
items = sift.records_by_ids(["rec_1", "rec_2"])
```

See `product/features/server/records-query.md` for the filter DSL and `product/features/server/aggregations.md` for the aggregate endpoint.

## Folder CRUD

A **Folder** is a shared document container. When a document is added, all linked sifts are updated automatically. A folder can feed multiple sifts; a sift can be linked to multiple folders.

```python
folder = s.create_folder("Contracts 2024")
folder = s.get_folder("folder_id")
folders = s.list_folders()
folder.update(name="Contracts 2024-2025")
folder.delete()
```

## Folder: Documents and Sifts

```python
folder.upload("./contracts/")   # upload documents to folder
docs = folder.documents()        # list documents in folder
folder.add_sift(sift)            # link a sift — folder docs processed by it
folder.remove_sift(sift)
linked = folder.sifts()          # list linked sifts
```

## Multi-Sift on Same Folder

```python
parties = s.create_sift("Parties", "contracting parties, dates")
clauses = s.create_sift("Clauses", "non-compete, termination conditions")
folder.add_sift(parties)
folder.add_sift(clauses)
# → all folder docs processed by both sifts
```

## One-Liner Convenience

```python
records = s.sift("./invoices/", "client, date, total")
```

Creates a temporary sift, uploads the documents, waits for processing, and returns records.

## Event Callbacks (SDK)

Register local callbacks for events on a sift or folder. The SDK polls internally during `wait()`. No extra infrastructure needed.

`on()` accepts a single event name, a list of event names, or a wildcard pattern. Wildcards use `*` to match any segment.

```python
sift.on("document.processed", lambda doc, record: print(record))
sift.on(["document.processed", "error"], lambda doc, record: print(record))
sift.on("*", lambda doc, record: print(record))
folder.on("document.uploaded", lambda doc: print(f"New: {doc.filename}"))
```

## Server-Side Webhooks

Register a URL to receive HTTP POST requests when events occur.

```python
s.register_hook(events="sift.*", url="https://my-app.com/webhook", sift_id=sift.id)
s.register_hook(events=["sift.completed", "sift.error"], url="https://my-app.com/webhook")
hooks = s.list_hooks()
s.delete_hook(hook_id)
```

## Event Types

| Event | Description |
|---|---|
| `sift.document.processed` | A document was extracted by a sift |
| `sift.completed` | All documents in a sift finished processing |
| `sift.error` | Extraction error on a document |
| `folder.document.uploaded` | New document added to a folder |

## Wildcard Matching Rules

- `*` — matches any single segment (e.g. `sift.*` matches `sift.completed` but not `folder.document.uploaded`)
- `**` — matches any number of segments (e.g. `**` matches everything)
- Matching is evaluated server-side for webhooks, client-side for SDK callbacks

## Creating an API Key

1. Log in to Sifter
2. Go to Settings → API Keys
3. Click "Create Key", enter a name
4. Copy the full key — shown **once only**
5. Pass it as `api_key=` or set `SIFTER_API_KEY` env var
