---
title: Technical Roadmap
status: synced
version: "2.0"
last-modified: "2026-04-17T00:00:00.000Z"
---

# Technical Roadmap

Priority order for Sifter OSS. Grouped by phase. This roadmap covers only this repo; `sifter-cloud` maintains its own roadmap for the commercial business-user product.

---

## Phase 1 — Production Baseline

*Target: safe to deploy, data won't be lost*

- [ ] **MongoDB-backed task queue** — replace `asyncio.Queue` with persistent `processing_queue` collection. Tasks survive restarts. Auto-retry on failure (max 3 attempts).
- [ ] **Rate limiting** — `slowapi` on auth and upload endpoints. 10 req/min on login, 20 req/min on uploads.
- [ ] **Real health check** — `GET /health` verifies DB connectivity, reports queue depth and worker count. Returns HTTP 503 if DB is unreachable.
- [ ] **Pagination** — `limit`/`offset` on all list endpoints. Default limit 50. Frontend pagination controls.
- [ ] **S3-compatible storage** — abstract storage backend. Add `S3Backend` alongside existing `FilesystemBackend`. Activated via `SIFTER_STORAGE_BACKEND=s3`.

---

## Phase 2 — Hardening

*Target: production-grade reliability and security*

- [ ] **Input validation** — Pydantic validators on all request bodies: email format, password strength, URL format (webhooks).
- [ ] **LLM retry logic** — exponential backoff with jitter on `litellm.acompletion()` calls. Max 3 retries on transient errors.
- [ ] **Webhook delivery tracking** — record delivery attempts, response status, and timestamp. Retry failed deliveries up to 3 times with exponential backoff.
- [ ] **Graceful shutdown** — on SIGTERM, stop accepting new tasks, wait up to 30s for in-progress workers to finish before cancelling.
- [ ] **Request tracing** — inject `X-Request-ID` header, propagate through structlog context. Log request path, status, and latency.
- [ ] **Startup validation** — refuse to start if `SIFTER_JWT_SECRET` is the default dev value in non-dev environments.

---

## Phase 3 — Positioning, Docs & MCP (CR-018–021)

*Target: coherent developer story before cloud GA*

- [x] **Product repositioning** (CR-018) — 2-surface model (App + Developer) with Contact CTA for enterprise. *(Superseded by CR-022: full dev-first repositioning)*
- [x] **Docs site → Mintlify** (CR-019).
- [x] **Landing redesign + enterprise page** (CR-020).
- [x] **MCP server v1** (CR-021) — read-only tools: `list_sifts`, `get_sift`, `list_records`, `query_sift`, `list_folders`, `get_folder`.

---

## Phase 4 — Dev-First Consolidation (CR-022–030)

*Target: OSS becomes a complete developer product. Repositioning + the eight capabilities below are the consolidated "Phase 4" for this repo. `sifter-cloud` tracks its own Phase 4 (Cloud GA, dashboard, citations UI, Drive, email-in) in its own repo.*

- [ ] **OSS dev-first repositioning** (CR-022) — rewrite `product/vision.md`, `product/users.md`, `system/roadmap.md` as developer-first; move Business User persona and pricing to `sifter-cloud`. Draw the architectural rule: Cloud has no private APIs.
- [ ] **MCP write tools** (CR-023) — extend the MCP server with `create_sift`, `upload_document`, `run_extraction`, `get_extraction_status`, `aggregate_sift`, `find_records`. Promotes MCP from read-only demo to first-class agent surface.
- [ ] **TypeScript SDK** (CR-024) — `@sifter-ai/sdk` on npm. Feature parity with the Python SDK. ESM, zero runtime deps, Node 18+ / browser / edge.
- [ ] **CLI** (CR-025) — `sifter` command (Typer + Rich). Subcommands: `login`, `sifts`, `folders`, `extract`, `records`, `mcp`. JSON + table output; shell completion.
- [ ] **Query NL API + structured queries** (CR-026) — stabilize `POST /api/sifts/{id}/query`, add `POST /api/sifts/{id}/aggregate`, extend `GET /api/sifts/{id}/records` with filter DSL / cursor / projection / full-text. SDK `find`, `aggregate`, `records_count`, `records_by_ids`.
- [ ] **Citations API** (CR-027) — per-field `document_id`, `page`, `bbox`, `source_text`. Page-rendering endpoint for drill-down. Powers trust UIs both in OSS consumers and in `sifter-cloud`.
- [ ] **Typed schema generation** (CR-028) — `GET /api/sifts/{id}/schema.pydantic|.ts|.json`; `schema_version` + `sift.schema.changed` webhook; SDK `model=` kwarg; CLI `sifter sifts schema --watch`.
- [ ] **Zero-friction self-host** (CR-029) — all-in-one Docker image, guided `/setup` screen, `docker run -p 8000:8000 -e SIFTER_LLM_API_KEY=... ghcr.io/sifter-ai/sifter`. Docker-compose remains the production path.
- [ ] **Zapier app** (CR-030, low priority) — public Zapier integration with triggers (record created, sift completed, document processed) and actions (upload, create sift, run extraction). Runs in parallel because Zapier certification takes 4–6 weeks.

### Explicitly moved to `sifter-cloud`

The Cloud GA scope previously tracked here (Stripe billing, org invitations, password reset, admin dashboard, Google/GitHub OAuth, usage dashboard) now lives in `sifter-cloud`'s roadmap. OSS exposes the primitives via public APIs; Cloud layers the business product on top.

---

## Phase 5 — Scalability, Observability, Enterprise

*Target: 10k+ documents/month, enterprise compliance, deeper dev observability*

- [ ] **Distributed workers** — separate worker process/container polling the same `processing_queue`. Multiple instances in parallel.
- [ ] **Indexes audit** — compound indexes for common query patterns. `explain()` tests.
- [ ] **API versioning** — `/api/v1/` prefix. Legacy `/api/` deprecated after one release.
- [ ] **Streaming upload** — chunked upload for files > 50 MB.
- [ ] **SSE for extraction status** — live progress channel for client UIs; webhook remains for server-to-server.
- [ ] **Evaluation / benchmarking tooling** — `sifter eval <fixtures/>` to compare extraction output against ground-truth. Dev-visible accuracy metrics.
- [ ] **SAML / SCIM** — enterprise SSO and user provisioning (paired with `sifter-cloud`).
- [ ] **Audit log** — append-only log of all resource mutations.
- [ ] **GDPR tooling** — data export per user, right-to-erasure endpoint.
- [ ] **Data retention policies** — per-org configurable retention with auto-archival.
- [ ] **BYOK LLM endpoints** — Azure OpenAI or any OpenAI-compatible endpoint per org.
- [ ] **Role-based access control** — resource-level permissions (folder-level read/write per user).
- [ ] **MCP v2** — prompt templates, sampling callbacks, richer resource model.

---

## Deferred / not planned for OSS

- Native business-user UX (dashboards, structured chat with inline actions, sharing, Drive connector, email-to-upload). → `sifter-cloud`.
- Per-document billing, metered usage, Stripe integration. → `sifter-cloud`.
- Consumer chat interfaces (Telegram / WhatsApp bots). → the ecosystem via webhooks / Zapier; not a first-party OSS surface.
