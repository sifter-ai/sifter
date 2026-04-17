---
title: CLI (`sifter` command)
status: synced
version: "2.0"
last-modified: "2026-04-17T00:00:00.000Z"
---

# CLI

`sifter` is the official command-line tool for Sifter. It wraps the TypeScript SDK and covers the common developer workflows — sift CRUD, upload, extract, query, export — without writing any code.

## Package

| Property | Value |
|----------|-------|
| Package name | `@sifter-ai/cli` (npm) |
| Location | `code/cli/` |
| Install | `npm install -g @sifter-ai/cli` — registers the `sifter` entry point |
| Zero-install | `npx @sifter-ai/cli` |
| Dependencies | `@sifter-ai/sdk`, `commander`, `chalk`, `cli-table3`, `ora` |

## Command Surface

```
sifter sifts list
sifter sifts get <sift_id>
sifter sifts create --name N --instructions "…"
sifter sifts update <sift_id> --name N --instructions "…"
sifter sifts delete <sift_id>
sifter sifts schema <sift_id> [--format ts|json|pydantic] [--watch]

sifter folders list
sifter folders create --name N
sifter folders upload <folder_id> <path>  # file or directory
sifter folders link <folder_id> <sift_id>

sifter extract <path>… --instructions "…" [--sift <id>] [--wait] [--json]
# one-shot: creates a temp sift (or uses --sift), uploads, waits, prints records

sifter records list <sift_id> [--limit N] [--cursor C] [--filter '<json>']
sifter records query <sift_id> "natural language question"
sifter records export <sift_id> --output records.csv
```

## Global Flags

| Flag | Purpose |
|------|---------|
| `--api-url URL` | Sifter server URL (default: `SIFTER_BASE_URL` env, fallback `http://localhost:8000`) |
| `--api-key KEY` | API key (default: `SIFTER_API_KEY` env) |
| `--json` | Force JSON output (default on non-TTY) |
| `--quiet` | Suppress progress output |

## Auth

Set `SIFTER_API_KEY` (and optionally `SIFTER_BASE_URL`) in your environment, or pass `--api-key` / `--api-url` per command. There is no config file — credentials live in the environment.

```bash
export SIFTER_API_KEY=sk-...
export SIFTER_BASE_URL=https://api.sifter.ai  # omit for localhost
sifter sifts list
```

## Output Formatting

- `--table` — human-readable table (default on TTY).
- `--json` — raw JSON, pipeable: `sifter records list $SIFT --json | jq '.[].extracted_data.total'`.
- `sifter extract --wait` polls until processing completes and prints records. `--no-wait` returns the sift ID immediately.

## Typed Schemas (watch mode)

```bash
sifter sifts schema <sift_id> --format ts --watch > types.ts
```

Polls every 5 seconds and re-emits whenever the schema version changes. Used in dev loops where the schema is still evolving.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Usage error (missing API key, no files found) |
| 2 | Server error (API returned non-2xx) |

## MCP Integration

The MCP server (`sifter-mcp`, Python) is launched separately. For Claude Desktop / Cursor:

```json
{
  "mcpServers": {
    "sifter": {
      "command": "uvx",
      "args": ["sifter-mcp"],
      "env": { "SIFTER_API_KEY": "sk-..." }
    }
  }
}
```

## Scope

Included: sifts, folders, extract, records, schema emit.  
Excluded (future): browser device login, Homebrew packaging, interactive TUI, admin/org commands (those belong to the `sifter-cloud` CLI).
