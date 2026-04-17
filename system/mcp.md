---
title: MCP Server
status: changed
version: "1.1"
last-modified: "2026-04-17T00:00:00.000Z"
---

# MCP Server (`sifter-mcp`)

## Overview

`sifter-mcp` is a standalone Python package that exposes Sifter as a first-class MCP surface to AI agents (Claude Desktop, Cursor, custom MCP clients). v1.1 covers the full read/write/query surface — an agent can create a sift, upload a document, wait for extraction, and query or aggregate the resulting records without any out-of-band UI steps.

It wraps the `sifter-ai` Python SDK — no direct HTTP calls, no business logic duplication.

---

## Package

| Property | Value |
|----------|-------|
| Package name | `sifter-mcp` |
| Location | `code/mcp/` |
| Dependencies | `mcp`, `sifter-ai` |
| Entry point | `python -m sifter_mcp` |
| PyPI install | `pip install sifter-mcp` |
| Zero-install | `uvx sifter-mcp` |

---

## Configuration

All configuration via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SIFTER_API_KEY` | *(required)* | API key for authentication |
| `SIFTER_BASE_URL` | `http://localhost:8000` | Sifter server base URL |

For cloud: set `SIFTER_BASE_URL=https://api.sifter.ai`.

---

## Transport

v1.1 supports two transports:

| Transport | When | Config |
|-----------|------|--------|
| `stdio` | `uvx sifter-mcp` — local process (Claude Desktop, Cursor) | `SIFTER_API_KEY` + `--base-url` |
| `streamable-http` | Mounted in FastAPI server at `/mcp` — zero install for cloud users | `Authorization: Bearer <key>` |

The HTTP endpoint is mounted automatically when `sifter-mcp` is installed alongside `sifter-server`.

**v2 (future)**: SSE extraction-status streaming, prompt templates, sampling callbacks, richer resource model.

---

## Tools (v1.1)

### Read tools

| Tool | Parameters | Returns |
|------|-----------|---------|
| `list_sifts` | — | Array of sifts (id, name, instructions, document_count, record_count) |
| `get_sift` | `sift_id: str` | Sift metadata + inferred schema |
| `list_records` | `sift_id: str`, `limit: int = 20`, `offset: int = 0` | Extracted records with `extracted_data` |
| `query_sift` | `sift_id: str`, `natural_language: str` | NL query result (records + pipeline + answer) |
| `get_record_citations` | `sift_id: str`, `record_id: str` | Per-field citation map `{ field: { document_id, page, bbox, source_text } }` |
| `list_folders` | — | Array of folders (id, name, document_count) |
| `get_folder` | `folder_id: str` | Folder metadata + linked sifts + documents |

### Write tools

| Tool | Parameters | Returns |
|------|-----------|---------|
| `create_sift` | `name: str`, `instructions: str`, `folder_id: Optional[str] = None` | New sift (id, name, instructions, schema when inferred, default_folder_id) |
| `update_sift` | `sift_id: str`, `name: Optional[str]`, `instructions: Optional[str]` | Updated sift |
| `delete_sift` | `sift_id: str` | `{"deleted": true}` |
| `upload_document` | `folder_id: str`, `filename: str`, `content_base64: str`, `content_url: Optional[str] = None` | Document record (id, filename, status). If `content_url` is set the server fetches the bytes; otherwise `content_base64` is required. |
| `run_extraction` | `document_id: str`, `sift_id: Optional[str] = None` | `{"task_id": str, "status": "queued"}` |
| `get_extraction_status` | `document_id: str`, `sift_id: str` | `{"status": "queued\|running\|completed\|failed", "error": Optional[str]}` |

### Structured-query tools

Agents that already know the schema can construct precise filters and pipelines without a second LLM roundtrip.

| Tool | Parameters | Returns |
|------|-----------|---------|
| `find_records` | `sift_id: str`, `filter: dict`, `sort: Optional[list]`, `limit: int = 50`, `cursor: Optional[str]` | `{"records": [...], "next_cursor": str \| null}` |
| `aggregate_sift` | `sift_id: str`, `pipeline: list[dict]` | Pipeline result (array of aggregated rows) |

`filter` and `pipeline` follow the same shape as `GET /api/sifts/{id}/records` + `POST /api/sifts/{id}/aggregate` (see `product/features/server/records-query.md` and `product/features/server/aggregations.md`). The MCP layer is a thin wrapper — no query logic lives here.

### Agent workflow example

```
create_sift(name="Invoices", instructions="client, date, total") → sift
upload_document(folder_id=sift.default_folder_id, filename="invoice.pdf", content_base64=…) → document
poll get_extraction_status(document.id, sift.id) until completed
find_records(sift.id, filter={"total": {"$gt": 1000}}, sort=[("date", -1)])
```

### Permissions

All write tools require a valid API key. Scoped keys (read-only vs write) are deferred to a future CR — for v1.1, any valid API key has full scope.

### Error handling

Errors from the SDK surface as MCP errors with a human-readable message. Typical cases:

- `create_sift` with duplicate name in folder → 409 from server, MCP error "sift already exists"
- `upload_document` with unsupported MIME → 415 from server, MCP error "unsupported file type"
- `run_extraction` on a document still processing → 409, MCP error "extraction already in progress"

---

## Resources (v1 — optional)

| URI | Returns |
|-----|---------|
| `sift://{sift_id}/records` | All records for the sift as a JSON resource |

---

## Claude Desktop Configuration

### HTTP (Sifter Cloud — zero install)

```json
{
  "mcpServers": {
    "sifter": {
      "type": "http",
      "url": "https://api.sifter.ai/mcp",
      "headers": {
        "Authorization": "Bearer sk-your-key"
      }
    }
  }
}
```

### stdio (uvx — self-hosted or local)

```json
{
  "mcpServers": {
    "sifter": {
      "command": "uvx",
      "args": ["sifter-mcp", "--base-url", "http://localhost:8000"],
      "env": {
        "SIFTER_API_KEY": "sk-dev"
      }
    }
  }
}
```

---

## Implementation Notes

- Use **FastMCP** pattern from the `mcp` Python SDK.
- Each tool function calls the corresponding method on the `Sifter` SDK client. If a method does not yet exist in `sifter-ai`, this CR adds it (thin wrapper over the REST endpoint) — MCP and SDK move together.
  - `list_sifts` → `Sifter.list_sifts()`
  - `get_sift` → `Sifter.get_sift(sift_id)`
  - `create_sift` → `Sifter.create_sift(name, instructions, folder_id)`
  - `update_sift` → `Sifter.sift(sift_id).update(...)`
  - `delete_sift` → `Sifter.sift(sift_id).delete()`
  - `list_records` → `SiftHandle.records(limit, offset)`
  - `query_sift` → `SiftHandle.query(natural_language)`
  - `find_records` → `SiftHandle.find(filter, sort, limit, cursor)`
  - `aggregate_sift` → `SiftHandle.aggregate(pipeline)`
  - `list_folders` → `Sifter.list_folders()`
  - `get_folder` → `Sifter.get_folder(folder_id)`
  - `upload_document` → `Sifter.folder(folder_id).upload(filename, content)`
  - `run_extraction` → `Sifter.sift(sift_id).extract(document_id)`
  - `get_extraction_status` → `Sifter.sift(sift_id).extraction_status(document_id)`
- The `Sifter` client is initialized once at startup from env vars.
- Errors from the SDK bubble up as MCP error responses.
