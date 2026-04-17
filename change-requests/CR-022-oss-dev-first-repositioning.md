---
title: "OSS dev-first repositioning: engine + API + SDK + MCP"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
---

## Summary

Reposition Sifter OSS as a developer-first extraction engine. Separate concerns between OSS (`sifter`) and Cloud (`sifter-cloud`): OSS owns the engine, public APIs, SDKs, MCP, and a minimal admin UI; Cloud owns the business-user product (dashboard, citations UI, evolved chat, ingress adapters, sharing, billing).

This CR rewrites `product/vision.md`, `product/users.md`, and `system/roadmap.md` to reflect the new boundary. No code changes — the CR realigns the documentation that downstream capability CRs (CR-023..CR-030) consume.

## Motivation

1. **Coherent execution.** The vision already dictates Business User as primary persona, but Phases 1–3 delivered dev-first capability (SDK, MCP, docs Mintlify). The product promise is not matched by the current surface, and the mismatch blocks both target segments.

2. **Commercial differentiation.** Under the current contract, `sifter-cloud` only adds multi-tenancy, billing, and hosting over an OSS that contains the complete product. A self-hoster gets the business product for free — there is no reason to pay $79–249/month for "hosting".

3. **Architectural clarity.** Drawing the boundary at the API level (OSS = primitives, Cloud = consumer) means Cloud has no "private APIs". Every capability Cloud needs becomes a public OSS API, benefiting all developers. This is the open-core pattern used by GitLab, Grafana, and Sentry.

4. **Defensibility.** Document extraction is becoming commodity (Gemini, Claude, Mistral OCR). The defensible layer is the business application on top — dashboards, trust/citations, workflow integrations, sharing. Placing that layer in Cloud builds the commercial moat without weakening the OSS dev experience.

## Detailed Design

### New positioning

- **Sifter OSS** (this repo) — "document extraction engine for developers". Apache-2.0. Complete product for the developer target: engine, REST API, Python SDK, TypeScript SDK, CLI, MCP server (read + write), minimal admin UI for verification. Self-hostable end-to-end.

- **Sifter Cloud** (`sifter-cloud` repo) — "turn your documents into a live dashboard". Proprietary. Complete product for the business-user target: dashboard of saved aggregations, citations drill-down UI, structured chat with suggestions and actions, Drive / email ingress, team + sharing, billing. Consumes the same OSS APIs it would use self-hosted.

### Personas realignment

| Target | Repo | Primary persona |
|--------|------|-----------------|
| Developer + AI agent builder | `sifter` OSS | Primary |
| Self-hoster / technical team (data residency, cost-at-scale) | `sifter` OSS | Secondary |
| Business user (finance / ops SME) | `sifter-cloud` | *(out of scope for this repo)* |
| Enterprise buyer | `sifter-cloud` + OSS on-prem | *(contact-driven, unchanged)* |

### Phase 4 redefined

Phase 4 OSS becomes "developer experience consolidation", not "cloud GA". The "Cloud GA" phase previously in `system/roadmap.md` moves to `sifter-cloud`'s own roadmap.

New Phase 4 OSS scope (each capability = its own CR):

1. MCP write tools (CR-023)
2. TypeScript SDK (CR-024)
3. CLI (CR-025)
4. Query NL API + structured query enhancements (CR-026)
5. Citations API (CR-027)
6. Typed schema generation (CR-028)
7. Zero-friction self-host (CR-029)
8. Zapier app (CR-030, low priority)

### Files changed

**`product/vision.md`** — rewrite:
- Remove "Product Surfaces" section listing App / Developer / Enterprise — OSS has one surface.
- Replace with "What Sifter OSS is / is not" making clear it is the engine + developer tooling.
- Remove the "Pricing Model" section entirely — pricing lives in `sifter-cloud`.
- Keep Core Value Propositions but rephrase for dev target (embeddable, typed SDK, MCP-native, self-hostable).
- Keep "Long-term Direction" but point at two distinct products.

**`product/users.md`** — rewrite:
- Primary persona: Developer (currently secondary).
- Secondary persona: Self-hoster / Technical team with data-residency or cost-at-scale requirements.
- Remove Business User (moves to `sifter-cloud/product/users.md`).
- Keep Enterprise as tertiary contact-driven target — unchanged.

**`system/roadmap.md`** — rewrite:
- Keep Phases 1–3 as historical record.
- Replace current Phase 4 ("Cloud GA") with the new dev-first Phase 4 scope listed above. Add a note that Cloud GA work tracks in `sifter-cloud`'s roadmap.
- Phase 5 OSS: evaluation / benchmark tooling, SSE streaming for extraction status, performance, BYOK LLM, self-host hardening, eventual MCP v3.

### Explicit non-changes (for clarity)

- No existing code is removed or moved in this CR.
- No UI in `code/frontend/` is removed — it stays as "admin minimal" until `sifter-cloud` is ready to host the business UI. Future evolution of the business UI happens in `sifter-cloud`.
- Feature docs under `product/features/` are not touched by this CR (they describe current capability and remain valid for OSS).
- The landing page (`code/frontend/src/pages/LandingPage.tsx`) is covered by a follow-up CR once positioning is settled — not part of this CR.

## Files

- `product/vision.md` — CHANGED
- `product/users.md` — CHANGED
- `system/roadmap.md` — CHANGED

## Acceptance Criteria

1. `product/vision.md` declares OSS as a developer-first engine; pricing tiers and business-user product surface removed.
2. `product/users.md` has Developer as primary persona and Self-hoster as secondary; Business User no longer listed.
3. `system/roadmap.md` Phase 4 lists the eight dev-first capabilities and points at `sifter-cloud` for Cloud GA work.
4. `sdd validate` passes with no broken references.
5. All three files carry `status: changed` until implementation of downstream CRs sync them.

## Out of Scope

- Rewriting `sifter-cloud` documentation (separate session in that repo).
- Landing page rewrite (follow-up CR).
- Any code changes (all downstream CRs).
- Removing existing frontend features (they remain as admin UI).
