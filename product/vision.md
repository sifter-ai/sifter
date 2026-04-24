---
title: Vision
status: synced
version: "3.1"
last-modified: "2026-04-24T00:00:00.000Z"
---

# Vision

Sifter is an open-source document intelligence engine that turns unstructured documents — invoices, contracts, receipts, CVs, utility bills, any document collection — into a structured, queryable database. It ships as a self-contained stack (REST API, Python SDK, TypeScript SDK, CLI, MCP server, chat, dashboards, webhook infrastructure) that developers embed into their own products, internal tools, or AI agents — and that small teams can also use directly via the bundled UI.

**Tagline:** *"Structure any document. Query it like a database. Build on top via API."*

Positioning: **structured RAG** — typed outputs, aggregation queries, verifiable citations down to the bounding box. Not semantic soup.

## Problem

Developers building document-aware products repeatedly reinvent the same layers: PDF parsing, LLM orchestration, schema inference, result storage, querying over extracted data, a chat interface for verification, a dashboard for the business user next door. The existing landscape forces a choice between locked-down SaaS (per-page fees, opaque models) and low-level primitives (raw OCR, raw LLM calls) that still require weeks of plumbing plus a whole UI layer. Neither is a complete developer product.

## Solution

Sifter OSS provides the complete extraction-to-query-to-verify stack as open-source software:

- **Engine** — upload a document, define extraction rules in natural language, get structured records back. Schema is auto-inferred from the first processed document.
- **Public REST API** — stable surface for every capability (extract, query, aggregate, citations, webhooks).
- **Native SDKs** — Python and TypeScript, with typed schemas generated per sift.
- **CLI** — `sifter` command for scripting, CI, and quick evaluation.
- **MCP server (stdio)** — first-class Model Context Protocol integration for AI agents (Claude Desktop, Cursor, custom agents), with read and write tools.
- **Chat** — simple NL Q&A over your sifts, with inline citations that drill down to source record + page + bounding box.
- **Spec-driven dashboards** — a short natural-language spec (e.g. *"Costi per fornitore"*) auto-generates a board: KPI cards, breakdowns, tables, time series. No drag-and-drop builder, no widget picker — the spec IS the dashboard. One spec, one board, rerun on new data.
- **Webhook infrastructure** — subscribe to extraction events with HMAC signing and retry policy. First-class primitive, not an afterthought.
- **Admin UI** — a React frontend covering folders, sifts, records, schema, documents, chat, dashboards, webhooks, settings. Complete enough to be used as a product by a small technical team; not a replacement for a polished prosumer SaaS.

Self-hostable end-to-end under MIT. Bring your own LLM API key; run on any server with MongoDB.

## What Sifter OSS is

A **complete document intelligence stack** with a developer-first contract. The primary surface is designed for someone who can write code: API endpoints, SDKs, CLI, MCP tools, webhooks. The UI (chat, dashboards, admin) is a first-class companion — not a demo afterthought — but it stays opinionated and non-extensible by design.

Target use cases:
- Embedding document extraction into a larger product (SaaS, internal tool, vertical AI agent).
- Driving an AI agent that needs to ingest and query documents via MCP.
- Self-hosting a small team's document pipeline with chat and dashboards included.
- Compliance / data-residency / cost-at-scale requirements that rule out SaaS.

## What Sifter OSS is not

Sifter OSS is not a hosted multi-tenant service. It does not manage billing, does not expose an authenticated remote MCP endpoint, does not OAuth into Google Drive for you, does not run a mail-inbound service. Those operational surfaces live in **Sifter Cloud** (`sifter-cloud`), a separate commercial product built on the same public APIs this repo exposes.

The split is simple: if a feature runs in-process against your Mongo and your LLM key, it lives in OSS. If a feature requires exposing an internet endpoint that we operate, or holds a managed account with an external provider on your behalf, it lives in Cloud.

## Why LLM-based extraction matters

Traditional document extractors rely on fixed templates or positional rules — they break the moment a layout changes. Sifter uses an LLM as the extraction engine, which means it reads documents the way a human would: understanding context, coping with layout variation, and filling in fields even when the document's structure doesn't match a template. This is what makes it work on real-world heterogeneous collections — a folder of CVs from 50 different candidates, utility bills from 10 different providers, contracts with wildly different clause structures — without requiring per-layout configuration.

This is a deliberate architectural choice, not a side effect. The LLM handles the structural ambiguity; Sifter handles the rest: storage, schema inference, querying, webhooks, SDKs.

## Core Value Propositions

- **Zero-config extraction** — describe what to extract in plain language; the schema is inferred automatically, and typed models (Pydantic, TypeScript) are generated per sift.
- **Multi-document pipelines** — organize documents into folders linked to one or more extractors; every upload triggers all linked sifts automatically.
- **Queryable results** — natural-language queries generate inspectable MongoDB aggregation pipelines; structured filters, cursor pagination, and aggregation endpoints for programmatic consumers.
- **Citations as a primitive** — every extracted field is anchored to its source: document, page, bounding box, source text. Available from API, chat, dashboards, and MCP alike — not trapped in a UI.
- **MCP-native** — AI agents can create sifts, upload documents, query records, and aggregate data via the Model Context Protocol, without custom integration code.
- **Typed SDKs** — Python and TypeScript clients with first-class typing per sift, matching the ergonomics developers expect from modern dev tools.
- **CLI** — `sifter extract`, `sifter sifts`, `sifter records` for terminal workflows and CI.
- **Chat + spec-driven dashboards bundled** — verify the pipeline, show your teammates the data, without writing a frontend first.
- **Self-hostable** — `docker run` evaluation path; `docker-compose` production path; MIT license.

## Licensing & Distribution

- License: **MIT**.
- Source: this repository (`sifter`).
- Distribution:
  - `pip install sifter-ai` — Python SDK (exposes OSS + Cloud surfaces; Cloud methods raise `NotAvailableError` when pointed at a self-hosted server)
  - `npm install @sifter-ai/sdk` — TypeScript SDK (same contract)
  - `npm install -g @sifter-ai/cli` / `npx @sifter-ai/cli` — CLI
  - `pip install sifter-mcp` / `uvx sifter-mcp` — MCP server (stdio)
  - `docker run ghcr.io/sifter-ai/sifter` — all-in-one evaluation image (upcoming)
  - `docker-compose` — production self-host

Users pay only for their LLM provider API key. No per-document fees, no usage tracking imposed by OSS.

## Relationship to Sifter Cloud

Sifter Cloud is a separate commercial product built on top of this engine. Cloud consumes the same public APIs that every developer consumes — there are no private endpoints. Cloud does **not** add chat, dashboards, webhooks, citations or any user-facing feature that OSS doesn't already ship. What Cloud adds is **operational surface**:

- Fully managed multi-tenant hosting (no Mongo, no ops).
- Managed LLM routing (no Vertex / OpenAI account on your side).
- **Authenticated remote MCP endpoint** (`https://sifter.run/mcp`) — agents authenticate with an API key; no local install.
- **Google Drive connector** — OAuth + polling, one click.
- **Mail-to-upload** — per-folder inbound email address; forward an invoice, it lands in the folder.
- Organizations, team invites, per-org hashed API keys, billing via Stripe.
- Enterprise extensions (SSO, BYOK LLM, audit log, on-prem) via contact.

For developers who need the raw engine — to embed, self-host, or agent-integrate — OSS is the product. For teams who want the same engine without operating any of it, Cloud is the fast path.

## Long-term Direction

Sifter OSS aims to be the standard backend for document intelligence workflows: embeddable via API or SDK, scriptable via CLI, accessible to AI agents via MCP, operable via chat and spec-driven dashboards, and self-hostable with minimal friction. The commercial cloud product extends the same engine with managed operations — it never forks the developer contract.
