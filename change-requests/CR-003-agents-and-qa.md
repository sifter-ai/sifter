---
title: "Extraction Agents and Q&A: Auto-pipelines, Enhanced Aggregations, Conversational Q&A"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-13T00:00:00.000Z"
---

## Summary

Enhance the aggregation and chat/Q&A system: (1) Auto-generate MongoDB aggregation pipelines from natural language queries attached to an extraction, save them as named aggregations, and expose results via a clean REST API. (2) Enable persistent Q&A agents connected to an extraction — the agent has memory of the extraction schema and past conversation, and can answer questions by generating and running MongoDB queries on the fly.

## Changes to product/

### product/features/aggregations.md (NEW)

Create this file describing:

**Named Aggregations** — A named aggregation is a saved query tied to an extraction. It has: `id`, `name`, `description`, `extraction_id`, `organization_id`, `aggregation_query` (natural language), `pipeline` (generated MongoDB pipeline JSON), `created_at`, `last_run_at`, `status` (generating/ready/error).

**Auto-pipeline generation** — When a named aggregation is created, an LLM agent generates the MongoDB aggregation pipeline from the natural language query and the extraction's inferred schema. The pipeline is stored and can be re-run any time without re-generating.

**Aggregation result API** — `GET /api/aggregations/{id}/result` returns `{"results": [...], "pipeline": [...], "ran_at": "..."}`. Results are computed fresh on each call (not cached). The pipeline itself is cached (stored at creation).

**Live query** — `POST /api/extractions/{id}/query` accepts a natural language query, generates a pipeline on-the-fly (not saved), and returns results immediately. Useful for ad-hoc exploration.

**Frontend**: Aggregation list on the extraction detail page — create aggregation by typing a question, view results in a table, copy pipeline JSON.

### product/features/qa-agents.md (NEW)

Create this file describing:

**Q&A Agents** — A Q&A agent is a conversational assistant tied to an extraction. It has access to the extraction's schema and all extraction records. Users can ask questions in natural language; the agent:
1. Optionally generates a MongoDB aggregation pipeline to retrieve relevant data.
2. Synthesizes the data into a natural language answer.
3. Maintains conversation history for follow-up questions.

Agent sessions are ephemeral (not persisted) by default. Future: persistent sessions.

**Agent capabilities**:
- Answer schema questions ("what fields does this extraction have?")
- Run aggregate queries ("what's the total amount per client?")
- Filter and inspect records ("show me invoices over €10,000")
- Compare records ("which client had the most invoices last month?")

**Frontend**: Chat interface on extraction detail page — message thread, typing indicator, shows both the answer and (optionally) the pipeline that was used.

### product/features/chat.md (CHANGED)

Update to clarify: the existing `/api/chat` endpoint is a global chat that can reference any extraction. In addition, per-extraction Q&A agents (from qa-agents.md) provide a more focused experience scoped to one extraction with schema awareness.

## Changes to system/

### system/entities.md (CHANGED)

Update `Aggregation` entity to add: `pipeline` (stored JSON array), `last_run_at`, `status` (generating/ready/error), `error_message`.

### system/api.md (CHANGED)

Update aggregation endpoints:
- `POST /api/aggregations` — create named aggregation; body `{"name": ..., "extraction_id": ..., "aggregation_query": ...}`; pipeline is generated async; `status` starts as `generating`, becomes `ready` when pipeline is saved.
- `GET /api/aggregations/{id}` — get aggregation detail including stored pipeline.
- `GET /api/aggregations/{id}/result` — execute stored pipeline and return results. Returns `{"results": [...], "pipeline": [...], "ran_at": "..."}`.
- `POST /api/aggregations/{id}/regenerate` — re-generate the pipeline from scratch (e.g., if schema changed).
- `DELETE /api/aggregations/{id}` — delete aggregation.

Live query endpoint (already exists, confirm behavior):
- `POST /api/extractions/{id}/query` — one-shot NL query, generates pipeline, runs it, returns results. Not saved.

Add Q&A agent endpoints:
- `POST /api/extractions/{id}/chat` — send a message to the Q&A agent for this extraction. Body: `{"message": "...", "history": [...]}`. Returns: `{"response": "...", "data": [...] | null, "pipeline": [...] | null}`.

### system/architecture.md (CHANGED)

Add:
- **PipelineAgent** (already exists): `generate_pipeline(query, sample_records)` → pipeline JSON string. Used for both named aggregations and live queries.
- **Aggregation background task**: on `POST /api/aggregations`, immediately return the created aggregation with `status: generating`. Spawn an asyncio task to call `PipelineAgent.generate_pipeline()`, store result in DB, update status to `ready` (or `error`).
- **ExtractionQAAgent** (new service): `async def chat(extraction_id, message, history, org_id) -> QAResponse`. Steps: (1) load extraction schema + sample records, (2) decide if a pipeline is needed (LLM call), (3) if yes, generate pipeline, run it, get data, (4) synthesize answer. Uses `chat_agent.md` prompt.
- The existing `/api/chat` global chat calls `ExtractionQAAgent` with optional `extraction_id`. Unify implementation.

### system/frontend.md (CHANGED)

Add:
- Aggregation panel on extraction detail page: list of named aggregations, "New aggregation" button with NL query input, status indicator (generating spinner, ready checkmark, error badge), results table, "View pipeline" toggle.
- Q&A chat panel on extraction detail page: full chat UI (already exists as ChatInterface component), scoped to this extraction via `extraction_id`.
