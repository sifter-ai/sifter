---
title: "CLI (`sifter` command)"
status: pending
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
---

## Summary

New `sifter` command-line tool at `code/cli/`, installable via `pip install sifter-cli` (or `uvx sifter`). Wraps the Python SDK to cover the most common developer workflows: login, sift CRUD, upload, extract, query, export. Matches the de-facto DX standard set by tools like `stripe`, `supabase`, `vercel`.

## Motivation

Developers evaluating an extraction engine try it first from the terminal, not by writing a script. A competent CLI shortens time-to-first-extraction to under a minute:

```
$ sifter login
$ sifter extract ./invoices/*.pdf --instructions "client, date, total" --json
```

It also unlocks scripting, CI pipelines, and quick manual ops without booting a notebook. Without it, every "try it now" moment requires Python boilerplate — unreasonable for a dev-first product.

## Detailed Design

### Package structure

```
code/cli/
├── pyproject.toml          sifter-cli package, depends on sifter-ai + typer + rich
├── sifter_cli/
│   ├── __init__.py
│   ├── __main__.py         entry point
│   ├── main.py             root Typer app + command wiring
│   ├── config.py           config file: ~/.sifter/config.toml
│   ├── commands/
│   │   ├── auth.py         login, logout, whoami
│   │   ├── sifts.py        list, get, create, delete, update
│   │   ├── folders.py      list, get, create, delete
│   │   ├── extract.py      one-shot extract (temporary sift)
│   │   ├── records.py      list, query, export
│   │   └── mcp.py          mcp run (wraps sifter-mcp stdio)
│   └── output.py           JSON vs table formatting (rich)
└── tests/
    └── test_cli.py         CliRunner-based tests per command
```

### Dependencies

- `sifter-ai` (the Python SDK)
- `typer` for command parsing
- `rich` for tables and pretty output
- `tomli` / `tomli_w` for config persistence (Python 3.11+ has `tomllib` built-in for read)

### Command surface

```
sifter                                    # help
sifter login                              # interactive: prompt for API URL + key, save to config
sifter logout
sifter whoami                             # show active config (api_url, key fingerprint)

sifter sifts list
sifter sifts get <sift_id>
sifter sifts create --name N --instructions "..."
sifter sifts delete <sift_id>
sifter sifts update <sift_id> --name N --instructions "..."

sifter folders list
sifter folders create --name N
sifter folders upload <folder_id> <path>  # file or directory
sifter folders link <folder_id> <sift_id>

sifter extract <path>... --instructions "..." [--sift <sift_id>] [--json|--table] [--wait]
# one-shot: creates temp sift (or uses existing), uploads, waits, prints records

sifter records list <sift_id> [--limit N] [--json|--table]
sifter records query <sift_id> "natural language question" [--json|--table]
sifter records export <sift_id> --output file.csv

sifter mcp run                            # launch sifter-mcp stdio bound to current config
```

### Global flags

- `--api-url URL` override config
- `--api-key KEY` override config
- `--json` / `--table` output format (default `--table` for TTY, `--json` otherwise)
- `--quiet` suppress progress spinners

### Config file

`~/.sifter/config.toml`:

```toml
[default]
api_url = "http://localhost:8000"
api_key = "sk-..."

[profile.production]
api_url = "https://api.sifter.ai"
api_key = "sk-..."
```

`--profile production` switches profile. `SIFTER_API_KEY` env var wins over config when set.

### Output formatting

- `--table` uses `rich.table.Table` for human reading.
- `--json` dumps the raw SDK response. Pipeable: `sifter records list $SIFT --json | jq '.items[].total'`.
- `sifter extract` with `--wait` (default on TTY) shows a progress spinner updating per-document status; `--wait=false` returns immediately with document IDs.

### Auth flow

`sifter login` prompts for:
1. API URL (default: `https://api.sifter.ai`, with `http://localhost:8000` suggestion for local)
2. API key (pasted or guided "open <url>/settings/api-keys")

Stores in `~/.sifter/config.toml` with mode 600.

For Cloud, a follow-up CR can add `sifter login --browser` that opens a browser to mint a device-authorized key. Not in this CR.

### Testing

Typer provides `CliRunner`. Tests:
- Each command invokes the right SDK method (mocked `Sifter`).
- `--json` and `--table` produce parseable / readable output.
- Config file read/write round-trip.
- Error codes: missing API key → exit 1; SDK error → exit 2 with stderr message.

### Distribution

- `pip install sifter-cli` (the package registers a `sifter` entry point).
- `uvx sifter` for zero-install.
- Homebrew formula deferred to a later CR.

### Shell completion

Typer supports shell completion natively. `sifter --install-completion <shell>` emits the script. Documented in README.

## Files

- `code/cli/pyproject.toml` — NEW
- `code/cli/sifter_cli/*.py` — NEW (structure above)
- `code/cli/tests/test_cli.py` — NEW
- `code/cli/README.md` — NEW
- `product/features/sdk/cli.md` — NEW
- `docs/cli/quickstart.mdx` — NEW
- `docs/cli/reference.mdx` — NEW (auto-generated if possible from Typer metadata)

## Acceptance Criteria

1. `cd code/cli && pip install -e . && sifter --help` shows all commands.
2. `sifter login` persists config, `sifter whoami` reads it back.
3. `sifter extract ./sample.pdf --instructions "client, date, total"` against a running server prints records.
4. `sifter records query $SIFT "total by client" --json | jq .` works.
5. `sifter records export $SIFT -o out.csv` produces a valid CSV.
6. `sifter mcp run` launches sifter-mcp with the current profile's credentials (stdio).
7. `uv run pytest code/cli/tests/` passes.
8. `uvx sifter --help` works without prior install.

## Out of Scope

- `sifter login --browser` device flow (future CR).
- Homebrew / scoop packaging (future CR).
- Interactive TUI (out of scope; this is a CLI).
- Admin / org commands (live in `sifter-cloud`'s CLI, not here).
