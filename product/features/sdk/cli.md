---
title: CLI (`sifter` command)
status: synced
version: "1.0"
last-modified: "2026-04-17T00:00:00.000Z"
---

# CLI

`sifter` is the official command-line tool for Sifter. It wraps the Python SDK and covers the common developer workflows — login, sift CRUD, upload, extract, query, export, run the MCP server — without writing any Python.

## Package

| Property | Value |
|----------|-------|
| Package name | `sifter-cli` (PyPI) |
| Location | `code/cli/` |
| Install | `pip install sifter-cli` — registers the `sifter` entry point |
| Zero-install | `uvx sifter` |
| Dependencies | `sifter-ai`, `typer`, `rich`, `tomli`/`tomli_w` |

## Command Surface

```
sifter login                              # save api_url + api_key to ~/.sifter/config.toml
sifter logout
sifter whoami                             # print active profile (api_url, key fingerprint)

sifter sifts list
sifter sifts get <sift_id>
sifter sifts create --name N --instructions "…"
sifter sifts update <sift_id> --name N --instructions "…"
sifter sifts delete <sift_id>
sifter sifts schema <sift_id> [--format pydantic|ts|json] [--watch]

sifter folders list
sifter folders create --name N
sifter folders upload <folder_id> <path>  # file or directory
sifter folders link <folder_id> <sift_id>

sifter extract <path>… --instructions "…" [--sift <id>] [--wait] [--json|--table]
# one-shot: creates a temp sift (or uses --sift), uploads, waits, prints records

sifter records list <sift_id> [--limit N] [--cursor C] [--filter '<json>']
sifter records query <sift_id> "natural language question"
sifter records export <sift_id> --output records.csv

sifter mcp run                            # launch sifter-mcp stdio bound to current profile
```

## Global Flags

| Flag | Purpose |
|------|---------|
| `--api-url URL` | Override config |
| `--api-key KEY` | Override config |
| `--profile NAME` | Use a named profile from `~/.sifter/config.toml` |
| `--json` / `--table` | Output format. Default: `--table` on TTY, `--json` otherwise |
| `--quiet` | Suppress progress spinners |

`SIFTER_API_KEY` env var wins over config when set.

## Config File

Profiles live in `~/.sifter/config.toml` (created `chmod 600` at first `sifter login`):

```toml
[default]
api_url = "http://localhost:8000"
api_key = "sk-…"

[profile.production]
api_url = "https://api.sifter.ai"
api_key = "sk-…"
```

## Output Formatting

- `--table` — `rich.table.Table`, human-readable.
- `--json` — raw SDK response; pipeable: `sifter records list $SIFT --json | jq '.items[].total'`.
- `sifter extract --wait` streams a per-document progress spinner (document IDs → `queued` → `running` → `done`). `--wait=false` returns document IDs immediately.

## Auth Flow

`sifter login` prompts for:
1. **API URL** — default `https://api.sifter.ai`, with a local suggestion.
2. **API key** — paste, or follow the printed URL to `/settings/api-keys`.

Device-authorized browser login (`sifter login --browser`) is a future CR.

## Shell Completion

```
sifter --install-completion zsh    # or bash / fish / pwsh
```

Typer generates the completion script natively.

## Typed Schemas (watch mode)

```
sifter sifts schema <sift_id> --format pydantic --watch > models.py
```

Regenerates the model on `sift.schema.changed` webhook events (see `product/features/server/typed-schemas.md`). Used in dev loops where the schema is still evolving.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Usage / config error (missing API key, bad flag) |
| 2 | Server error (SDK raised) — message printed to stderr |
| 130 | Interrupted (Ctrl-C) |

## MCP Integration

`sifter mcp run` is the simplest way to wire a local Sifter into Claude Desktop / Cursor:

```json
{
  "mcpServers": {
    "sifter": {
      "command": "sifter",
      "args": ["mcp", "run"]
    }
  }
}
```

Reuses the active CLI profile — no separate env-var setup.

## Scope

Included: login, sifts, folders, extract, records, mcp, schema emit, shell completion.
Excluded (future): browser device login, Homebrew packaging, interactive TUI, admin/org commands (those belong to the `sifter-cloud` CLI).
