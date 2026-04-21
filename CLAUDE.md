# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Sifter

Sifter is an AI-powered document extraction engine. It takes homogeneous document collections (invoices, contracts, receipts) and extracts structured fields into MongoDB, making them queryable with natural language. It is **not** a RAG system — it generates exact MongoDB aggregation pipelines, not similarity-based results.

## Monorepo Structure

All packages live under `code/`:

| Package | Path | Language |
|---------|------|----------|
| Backend API | `code/server/` | Python (FastAPI) |
| Frontend | `code/frontend/` | TypeScript (React + Vite) |
| Python SDK | `code/sdk/` | Python |
| TypeScript SDK | `code/sdk-ts/` | TypeScript |
| CLI | `code/cli/` | TypeScript (Commander.js) |
| MCP Server | `code/mcp/` | Python |

## Commands

### Backend (`code/server/`)
```bash
uv sync                        # install dependencies
uv run sifter-server           # start FastAPI on port 8000
uv run pytest                  # run all tests (requires MongoDB on localhost:27017)
uv run pytest tests/test_foo.py::test_bar  # run single test
```

### Frontend (`code/frontend/`)
```bash
npm install
npm run dev          # Vite dev server on port 3000
npm run build
npm run lint         # ESLint
npx tsc --noEmit     # type check
npm test             # Vitest
```

### TypeScript SDK (`code/sdk-ts/`)
```bash
npm test             # Vitest
```

### MCP Server (`code/mcp/`)
```bash
uv run pytest
```

### Full Stack (Docker)
```bash
# from code/ directory, after creating .env from server/.env.example
docker compose up -d
```

The backend serves the built frontend as static files, so `docker compose` gives a single unified deployment.

## Backend Architecture

**Entry:** `server/sifter/server.py` — creates the FastAPI app, registers routers, starts background workers, optionally mounts MCP at `/mcp`.

**Key layers:**

- `sifter/api/` — FastAPI routers (sifts, documents, aggregations, chat, folders, auth, webhooks, dashboards, keys, config)
- `sifter/services/` — business logic; the most important services are:
  - `SiftService` — sift lifecycle (create, schema inference, extraction orchestration)
  - `DocumentProcessor` — async background queue that dispatches extraction jobs
  - `SiftAgent` / `ExtractionAgent` — LLM agents that extract fields from documents
  - `AggregationService` / `PipelineAgent` — converts natural language queries to MongoDB aggregation pipelines
  - `DashboardService` — auto-generates dashboard specs from sift data
- `sifter/models/` — Pydantic models (Sift, Document, SiftResult, Extraction, User)
- `sifter/prompts/` — LLM system prompts used by agents
- `sifter/db.py` — Motor async MongoDB client
- `sifter/storage.py` — abstract file storage (filesystem / S3 / GCS)

**LLM integration:** uses LiteLLM, configured via `SIFTER_LLM_API_KEY` and `SIFTER_LLM_MODEL` env vars.

## Frontend Architecture

React SPA, mounted at root. Key structure:

- `src/App.tsx` — router, layout, org switching
- `src/pages/` — one file per route (SiftsPage, SiftDetailPage, ChatPage, DocumentDetailPage, FolderBrowserPage, LoginPage, SettingsPage, etc.)
- `src/api/` — typed HTTP client functions (thin wrappers over fetch)
- `src/context/` — React context for auth and org state
- `src/hooks/` — custom hooks (React Query wrappers)
- `src/components/` — UI components (shadcn/ui + Recharts for charts)

## SDK Design

The Python SDK (`sdk/sifter/client.py`) and TypeScript SDK (`sdk-ts/src/client.ts`) are intentionally minimal — they expose a `Sifter`/`SifterClient` class that wraps the REST API with no heavy dependencies (only `httpx` for Python, no external deps for TypeScript).

The CLI (`cli/src/index.ts`) shells out to the TypeScript SDK via a local path reference.

## Configuration

Backend requires `.env` in `code/server/` — copy from `.env.example`. Required vars:
- `SIFTER_LLM_API_KEY` — API key for the LLM provider
- `MONGODB_URI` — defaults to `mongodb://localhost:27017`

## Cloud Extension

`sifter-cloud/` (sibling directory, separate repo) extends the OSS server with multi-tenancy, Stripe billing, and team management. It imports the OSS FastAPI app and adds org-scoped routing on top.
