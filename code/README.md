# Sifter — monorepo

This directory contains all Sifter code packages.

| Package | Path | Registry |
|---------|------|----------|
| `sifter-server` | `server/` | Self-hostable FastAPI backend |
| `sifter-ai` | `sdk/` | Python SDK (`pip install sifter-ai`) |
| `@sifter-ai/sdk` | `sdk-ts/` | TypeScript SDK (`npm install @sifter-ai/sdk`) |
| `@sifter-ai/cli` | `cli/` | CLI (`npm install -g @sifter-ai/cli`) |
| `sifter-mcp` | `mcp/` | MCP server (`pip install sifter-mcp`) |
| `frontend` | `frontend/` | React web UI (Vite + shadcn/ui) |

Examples: `examples/` (Python), `examples-ts/` (TypeScript).

---

## Development

Requirements: [`uv`](https://docs.astral.sh/uv/), `npm`, `docker`

```bash
# Start full stack (MongoDB + backend + frontend)
./run.sh
```

- Backend: `http://localhost:8000` (OpenAPI at `/docs`)
- Frontend: `http://localhost:3000`

```bash
# Tests (requires MongoDB on localhost:27017)
cd server && uv run pytest

# Frontend type check
cd frontend && npx tsc --noEmit

# TypeScript SDK tests
cd sdk-ts && npm test

# MCP server tests
cd mcp && uv run pytest
```

---

## Packages

### `sifter-server`

FastAPI backend. Handles extraction, sifts, folders, records, aggregations, webhooks, and auth. Mounts the MCP ASGI app at `/mcp` when `sifter-mcp` is installed.

```bash
cd server
uv sync --extra mcp
uv run sifter-server
```

### `sifter-ai` (Python SDK)

```bash
pip install sifter-ai
```

```python
from sifter import Sifter

s = Sifter(api_key="sk-...")
records = s.sift("./invoices/", "client, date, total amount")
```

### `@sifter-ai/sdk` (TypeScript SDK)

```bash
npm install @sifter-ai/sdk
```

```ts
import { SifterClient } from "@sifter-ai/sdk";

const client = new SifterClient({ apiKey: "sk-..." });
const sift = await client.getSift("sift-id");
const records = await sift.records();
```

### `@sifter-ai/cli` (CLI)

```bash
npm install -g @sifter-ai/cli
# or zero-install:
npx @sifter-ai/cli sifts list
```

```bash
export SIFTER_API_KEY=sk-...
sifter extract ./invoices/ --instructions "client, date, total" --json
sifter sifts list
sifter records query $SIFT "total by supplier"
```

### `sifter-mcp` (MCP server)

Exposes sifts and records to Claude Desktop, Cursor, and AI agents via the Model Context Protocol.

**stdio (self-hosted):**
```json
{
  "mcpServers": {
    "sifter": {
      "command": "uvx",
      "args": ["sifter-mcp", "--base-url", "http://localhost:8000"],
      "env": { "SIFTER_API_KEY": "sk-dev" }
    }
  }
}
```

**HTTP (cloud):**
```json
{
  "mcpServers": {
    "sifter": {
      "url": "https://api.sifter.ai/mcp",
      "headers": { "Authorization": "Bearer <your-api-key>" }
    }
  }
}
```

---

## License

Apache 2.0. Created by [Bruno Fortunato](https://github.com/bfortunato).
