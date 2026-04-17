---
title: "MCP server v1: read-only tools for Claude Desktop / Cursor"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
---

## Summary

Create a new `sifter-mcp` Python package in `code/mcp/` that exposes Sifter's read access via the Model Context Protocol (MCP). Uses the existing `sifter-ai` SDK — no HTTP duplication. Distributed via PyPI (`pip install sifter-mcp` / `uvx sifter-mcp`).

## Motivation

MCP is a fast-growing distribution channel for data tools in 2026. Providing a first-class MCP server means:

1. Developers can point Claude Desktop or Cursor at their Sifter instance and query extracted records in natural language without writing any integration code.
2. AI agents can use `list_records` + `query_sift` as retrieval tools over document datasets, bypassing the need to build RAG on top of raw PDFs.
3. It positions Sifter alongside other MCP-native data tools (databases, APIs) in the Claude tool ecosystem.

v1 is read-only by design — lower risk, faster to ship, sufficient for the primary use case.

## Detailed Design

### Package structure

```
code/mcp/
├── pyproject.toml          sifter-mcp package, depends on sifter-ai + mcp
├── sifter_mcp/
│   ├── __init__.py
│   ├── server.py           FastMCP app + all tool definitions
│   └── __main__.py         entry point: python -m sifter_mcp (stdio transport)
└── tests/
    └── test_tools.py       mock Sifter SDK, verify each tool
```

### Tools

All tools are pure wrappers over `sifter-ai` SDK methods:

```python
@mcp.tool()
async def list_sifts() -> list[dict]:
    """List all sifts with name, instructions, and document/record counts."""

@mcp.tool()
async def get_sift(sift_id: str) -> dict:
    """Get sift metadata and inferred extraction schema."""

@mcp.tool()
async def list_records(sift_id: str, limit: int = 20, offset: int = 0) -> list[dict]:
    """Get extracted records from a sift."""

@mcp.tool()
async def query_sift(sift_id: str, natural_language: str) -> dict:
    """Run a natural language query over a sift's extracted records."""

@mcp.tool()
async def list_folders() -> list[dict]:
    """List all folders."""

@mcp.tool()
async def get_folder(folder_id: str) -> dict:
    """Get folder metadata, linked sifts, and document list."""
```

### Resources (optional v1)

```python
@mcp.resource("sift://{sift_id}/records")
async def sift_records_resource(sift_id: str) -> str:
    """Records for a sift as a JSON resource."""
```

### Auth + config

```python
import os
from sifter import Sifter

_client = Sifter(
    base_url=os.environ["SIFTER_BASE_URL"],
    api_key=os.environ["SIFTER_API_KEY"],
)
```

`SIFTER_BASE_URL` defaults to `http://localhost:8000`. Error at startup if `SIFTER_API_KEY` is missing.

### Transport

stdio only (v1). Entry point:

```python
# __main__.py
from sifter_mcp.server import mcp
mcp.run(transport="stdio")
```

### pyproject.toml

```toml
[project]
name = "sifter-mcp"
version = "0.1.0"
dependencies = ["sifter-ai>=0.1.0", "mcp>=1.0.0"]

[project.scripts]
sifter-mcp = "sifter_mcp.__main__:main"
```

### Claude Desktop configuration snippet

```json
{
  "mcpServers": {
    "sifter": {
      "command": "uvx",
      "args": ["sifter-mcp"],
      "env": {
        "SIFTER_API_KEY": "sk-your-key",
        "SIFTER_BASE_URL": "https://api.sifter.ai"
      }
    }
  }
}
```

### Tests

`tests/test_tools.py`:
- Mock `Sifter` class with a `unittest.mock.AsyncMock`
- Call each tool function directly and assert it calls the expected SDK method with correct arguments
- Test error propagation (SDK raises → tool raises MCP error)

## Files

- `code/mcp/pyproject.toml` — NEW
- `code/mcp/sifter_mcp/__init__.py` — NEW
- `code/mcp/sifter_mcp/server.py` — NEW
- `code/mcp/sifter_mcp/__main__.py` — NEW
- `code/mcp/tests/test_tools.py` — NEW
- `system/mcp.md` — NEW (spec, already created in CR-018)
- `docs/integrations/mcp-server.mdx` — NEW (docs page, created in CR-019)

## Acceptance Criteria

1. `pip install -e code/mcp` installs without errors
2. `python -m sifter_mcp` starts and outputs MCP initialization to stderr
3. Each tool can be called and returns the expected shape
4. Tests pass: `uv run pytest code/mcp/tests/`
5. Claude Desktop can connect to the server and list sifts from a running Sifter instance
6. `docs/integrations/mcp-server.mdx` has the Claude Desktop config snippet and tool reference table
7. `uvx sifter-mcp` works (zero-install path)

## Out of Scope (v2)

- Write tools: `create_sift`, `upload_document`, `delete_sift`
- SSE transport
- Prompt templates
- Sampling callbacks
