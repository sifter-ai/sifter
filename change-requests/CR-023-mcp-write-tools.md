---
title: "MCP write tools: create_sift, upload_document, run_extraction, aggregate_sift, find_records"
status: pending
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
---

## Summary

Extend `sifter-mcp` with write and structured-query tools so AI agents can complete end-to-end workflows (create sift → upload document → wait for extraction → query/aggregate). Promotes MCP from read-only demo to first-class automation surface.

## Motivation

MCP v1 (CR-021) is read-only. An AI agent connected to Sifter can answer questions about existing records but cannot bootstrap a workflow — the user still has to open the UI to create a sift or upload documents.

For the dev-first repositioning (CR-022), MCP is the headline integration channel for AI-agent builders. A read-only MCP falls short of the promise. The missing primitives are already exposed via REST/SDK; this CR surfaces them through MCP tools with the same API shape.

Adding `aggregate_sift` and `find_records` alongside the existing `query_sift` gives agents a structured alternative to natural-language querying — agents that already know the schema can construct precise pipelines/filters without a second LLM roundtrip.

## Detailed Design

### New write tools

| Tool | Parameters | Returns |
|------|-----------|---------|
| `create_sift` | `name: str`, `instructions: str`, `folder_id: Optional[str] = None` | New sift (id, name, instructions, schema when inferred) |
| `update_sift` | `sift_id: str`, `name: Optional[str]`, `instructions: Optional[str]` | Updated sift |
| `delete_sift` | `sift_id: str` | `{"deleted": true}` |
| `upload_document` | `folder_id: str`, `filename: str`, `content_base64: str`, `content_url: Optional[str] = None` | Document record (id, filename, status) |
| `run_extraction` | `document_id: str`, `sift_id: Optional[str] = None` | `{"task_id": str, "status": "queued"}` |
| `get_extraction_status` | `document_id: str`, `sift_id: str` | `{"status": "queued|running|completed|failed", "error": Optional[str]}` |

### New structured-query tools

| Tool | Parameters | Returns |
|------|-----------|---------|
| `find_records` | `sift_id: str`, `filter: dict`, `sort: Optional[list]`, `limit: int = 50`, `cursor: Optional[str]` | `{"records": [...], "next_cursor": str \| null}` |
| `aggregate_sift` | `sift_id: str`, `pipeline: list[dict]` | Pipeline result (array of aggregated rows) |

`filter` and `pipeline` follow the same shape as the REST API introduced in CR-026 (Query NL API + structured query enhancements). The MCP layer is a thin wrapper; no query logic lives here.

### SDK dependency

All new tools wrap existing `sifter-ai` SDK methods:

- `create_sift` → `Sifter.create_sift(name, instructions, folder_id)`
- `update_sift` → `Sifter.sift(sift_id).update(...)`
- `delete_sift` → `Sifter.sift(sift_id).delete()`
- `upload_document` → `Sifter.folder(folder_id).upload(filename, content)`
- `run_extraction` → `Sifter.sift(sift_id).extract(document_id)`
- `get_extraction_status` → `Sifter.sift(sift_id).extraction_status(document_id)`
- `find_records` → `SiftHandle.find(filter, sort, limit, cursor)` (new SDK method from CR-026)
- `aggregate_sift` → `SiftHandle.aggregate(pipeline)` (new SDK method from CR-026)

If a method does not yet exist on the Python SDK, this CR adds it (thin wrapper over the REST endpoint). MCP and SDK move together.

### Permissions

All write tools require an API key with write scope. If the API key is read-only (if scopes are introduced later), the tools raise an MCP error. For v1, all API keys have full scope — deferred to a future CR.

### Error handling

Errors from the SDK bubble up as MCP errors with a human-readable message. Typical cases:

- `create_sift` with duplicate name in folder → 409 from server, MCP error "sift already exists"
- `upload_document` with unsupported MIME → 415 from server, MCP error "unsupported file type"
- `run_extraction` on a document still processing from a previous run → 409, MCP error "extraction already in progress"

### Streaming status (deferred)

`get_extraction_status` remains polling-based in this CR. SSE streaming moves to Phase 5 (evaluation / observability track).

## Files

- `code/mcp/sifter_mcp/server.py` — CHANGED (add new `@mcp.tool()` functions)
- `code/mcp/tests/test_tools.py` — CHANGED (add test cases for each new tool)
- `code/sdk/sifter/client.py` — CHANGED (add missing SDK methods: `create_sift`, `update`, `delete`, `extract`, `extraction_status`, `find`, `aggregate`)
- `code/sdk/tests/test_client.py` — CHANGED
- `system/mcp.md` — CHANGED (add new tools table, update v1 → v1.1 note)
- `docs/integrations/mcp-server.mdx` — CHANGED (document write tools with examples)

## Acceptance Criteria

1. Each new MCP tool is callable from Claude Desktop and returns the documented shape.
2. End-to-end flow works from an agent: `create_sift` → `upload_document` → poll `get_extraction_status` until completed → `find_records` or `query_sift`.
3. Tests pass: `uv run pytest code/mcp/tests/ code/sdk/tests/`.
4. `system/mcp.md` lists all tools (read + write + structured query).
5. `docs/integrations/mcp-server.mdx` has an agent workflow example combining the new tools.

## Out of Scope

- Scoped API keys (read-only vs write) — future CR.
- SSE streaming for extraction status — Phase 5.
- Batch tools (`upload_documents`, `bulk_extract`) — add only if demanded.
- Writing via `streamable-http` transport — already supported, no extra work.
