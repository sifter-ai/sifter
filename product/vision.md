---
title: Vision
status: synced
version: "2.0"
last-modified: "2026-04-17T00:00:00.000Z"
---

# Vision

Sifter is an open-source, developer-first document extraction engine that turns unstructured documents — invoices, contracts, receipts, reports — into a structured, queryable database. It ships as a self-contained stack (REST API, Python SDK, TypeScript SDK, CLI, MCP server) that developers embed into their own products, internal tools, or AI agents.

## Problem

Developers building document-aware products repeatedly reinvent the same layers: PDF parsing, LLM orchestration, schema inference, result storage, querying over extracted data. The existing landscape forces a choice between locked-down SaaS (per-page fees, opaque models) and low-level primitives (raw OCR, raw LLM calls) that still require weeks of plumbing. Neither is a complete developer product.

## Solution

Sifter OSS provides the complete extraction-to-query stack as open-source software:

- **Engine** — upload a document, define extraction rules in natural language, get structured records back. Schema is auto-inferred from the first processed document.
- **Public API** — a stable REST surface for every capability (extract, query, aggregate, citations).
- **Native SDKs** — Python and TypeScript, with typed schemas generated per sift.
- **CLI** — `sifter` command for scripting, CI, and quick evaluation.
- **MCP server** — first-class Model Context Protocol integration for AI agents (Claude Desktop, Cursor, custom agents), with read and write tools.
- **Minimal admin UI** — a React frontend for verification, manual exploration, and debugging. Business-facing UX is *not* the focus of OSS.

Self-hostable end-to-end under Apache-2.0. Bring your own LLM API key; run on any server with MongoDB.

## What Sifter OSS is

A **developer tool**. The surface is designed for someone who can write code: API endpoints, SDKs, CLI, MCP tools, webhook primitives. The admin UI exists for verification and manual ops, not as the paying product.

Target use cases:
- Embedding document extraction into a larger product (SaaS, internal tool, vertical AI agent).
- Driving an AI agent that needs to ingest and query documents via MCP.
- Self-hosting for compliance / data-residency / cost-at-scale requirements.

## What Sifter OSS is not

Sifter OSS is not a finished product for non-technical business users. Dashboards, citations drill-down UIs, proactive chat with suggestions and inline actions, ingress adapters (Google Drive, email-to-upload), team sharing, and billing live in **Sifter Cloud** (`sifter-cloud`), a separate commercial product that consumes the same public APIs this repo exposes.

This split is intentional: OSS is the defensible engine and dev experience; Cloud is the business-user product and commercial surface.

## Core Value Propositions

- **Zero-config extraction** — describe what to extract in plain language; the schema is inferred automatically, and typed models (Pydantic, TypeScript) are generated per sift.
- **Multi-document pipelines** — organize documents into folders linked to one or more extractors; every upload triggers all linked sifts automatically.
- **Queryable results** — natural-language queries generate inspectable MongoDB aggregation pipelines; structured filters, cursor pagination, and aggregation endpoints for programmatic consumers.
- **Citations** — every extracted field is anchored to its source: document, page, bounding box, source text. Trust is a public primitive, not a UI feature.
- **MCP-native** — AI agents can create sifts, upload documents, query records, and aggregate data via the Model Context Protocol, without custom integration code.
- **Typed SDKs** — Python and TypeScript clients with first-class typing, matching the ergonomics developers expect from modern dev tools.
- **CLI** — `sifter extract`, `sifter sifts`, `sifter records` for terminal workflows and CI.
- **Self-hostable** — `docker run` evaluation path; `docker-compose` production path; Apache-2.0 license.

## Licensing & Distribution

- License: **Apache-2.0**.
- Source: this repository (`sifter`).
- Distribution:
  - `pip install sifter-ai` — Python SDK
  - `npm install @sifter-ai/sdk` — TypeScript SDK
  - `npm install -g @sifter-ai/cli` / `npx @sifter-ai/cli` — CLI
  - `pip install sifter-mcp` / `uvx sifter-mcp` — MCP server
  - `docker run ghcr.io/sifter-ai/sifter` — all-in-one evaluation image (upcoming)
  - `docker-compose` — production self-host

Users pay only for their LLM provider API key. No per-document fees, no usage tracking imposed by OSS.

## Relationship to Sifter Cloud

Sifter Cloud is a separate commercial product built on top of this engine. Cloud consumes the same public APIs that every developer can consume — there are no private endpoints. Every capability Cloud adds (dashboards, citations UI, structured chat, Drive / email ingress, teams, billing) sits on top of this OSS, not inside it.

For developers who need a hosted, multi-tenant, business-ready product, Cloud is the fast path. For developers who need the raw engine — to embed, self-host, or agent-integrate — OSS is the product.

## Long-term Direction

Sifter OSS aims to be the standard backend for document intelligence workflows: embeddable via API or SDK, scriptable via CLI, accessible to AI agents via MCP, and self-hostable with minimal friction. The commercial cloud product extends the same engine without fragmenting the developer contract.
