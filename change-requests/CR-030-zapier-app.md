---
title: "Zapier app: triggers and actions over Sifter API"
status: pending
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
---

## Summary

Publish a public Zapier app that exposes Sifter as a citizen of the Zapier ecosystem: triggers for "record created" and "sift completed", actions for "upload document" and "run extraction". Consumes only the existing public REST API + webhooks — no new server logic. One build, thousands of destinations.

Priority is explicitly lower than the other Phase 4 CRs because Zapier certification takes 4–6 calendar weeks; this CR gets started in parallel but does not block adoption of the core OSS capabilities.

## Motivation

For a dev-first product, Zapier is the cheapest leverage for last-mile output integration. The existing webhook primitive (`api/webhooks.py`) already lets power users forward events anywhere, but non-technical users — including those of `sifter-cloud` — never write webhook receivers. A published Zapier app lets them route "new invoice extracted" into Google Sheets, Airtable, Notion, Slack, or an email without any code.

Crucially, this CR addresses Cloud-friendly leverage from the OSS side: the Zapier app authenticates against the public REST API with an API key; Cloud users benefit automatically. OSS self-hosters with a public URL can point their own Zaps at their instance.

## Detailed Design

### Platform

Zapier Platform CLI app (JavaScript/TypeScript). Code lives at `code/zapier/`.

```
code/zapier/
├── package.json
├── index.ts                    app registration (triggers, actions, auth)
├── authentication.ts           API key auth + test request
├── triggers/
│   ├── record_created.ts       polling + hook variants
│   ├── sift_completed.ts
│   └── document_processed.ts
├── creates/
│   ├── upload_document.ts
│   ├── create_sift.ts
│   └── run_extraction.ts
├── searches/
│   ├── find_records.ts
│   └── get_record.ts
├── samples/                    sample payloads shown in the Zapier editor
└── test/
    └── *.test.ts               zapier-platform-core test harness
```

### Authentication

- Type: **API Key**.
- Fields: `api_url` (default `https://api.sifter.ai`, overridable for self-host) and `api_key`.
- Test request: `GET {api_url}/api/sifts?limit=1` with `X-API-Key` header. Zapier displays the connection as "Sifter · {api_url}".

### Triggers

| Trigger | Type | How |
|---------|------|-----|
| Record Created | Hook (preferred) + polling fallback | On subscribe: `POST /api/webhooks { events: ["sift.document.processed"], url: <zap hook url> }`. On unsubscribe: `DELETE /api/webhooks/{id}`. Polling fallback: `GET /api/sifts/{id}/records?limit=100&sort=-created_at`. |
| Sift Completed | Hook | Same pattern, event `sift.completed`. |
| Document Processed | Hook | Same pattern, event `sift.document.processed` or `sift.document.discarded`. |

Hook triggers are preferred because Zapier charges users per polled task; webhooks are real-time and free.

### Actions (Creates)

| Action | Call |
|--------|------|
| Upload Document | `POST /api/folders/{folder_id}/documents` with multipart file. Supports URL input (Zapier fetches and forwards) or direct file data. |
| Create Sift | `POST /api/sifts` with `name`, `instructions`. |
| Run Extraction | `POST /api/sifts/{sift_id}/reindex` for a folder, or `POST /api/sifts/{sift_id}/extract` on a specific document (once CR-023 lands). |

### Searches

| Search | Call |
|--------|------|
| Find Records | Wraps `GET /api/sifts/{id}/records?q=...&filter=...` (the structured query from CR-026). Used in "Find + Create" patterns. |
| Get Record | `GET /api/sifts/{id}/records/{record_id}` — single record lookup. |

### Field dynamic dropdowns

Triggers and actions include dynamic dropdowns for `sift_id` and `folder_id`. Zapier calls `GET /api/sifts` / `GET /api/folders` to populate them; the user picks from a list instead of typing an ID.

### Sample payloads

Each trigger has a `samples/` file with a representative JSON payload. Zapier shows these in the editor so users can map fields before running a live test.

### Tests

`zapier-platform-core` provides a test harness. Tests:
- Auth connection test passes with a mock API.
- Each trigger subscribes / unsubscribes correctly.
- Polling fallback returns items in descending order.
- Actions send the expected HTTP request.

### Submission + certification

- `zapier register` — register the app in the Zapier developer portal.
- `zapier push` — push code to Zapier.
- `zapier validate` — run lint + manifest checks.
- Submit for public review; Zapier performs certification over ~4–6 weeks.

### Listing content (outside repo but tracked)

- App icon, description, screenshots, example Zaps — authored in the Zapier portal, not in code.
- This CR includes only a placeholder icon at `code/zapier/assets/icon.png`; final artwork comes from the design/branding track.

### Documentation

- `docs/integrations/zapier.mdx` — setup steps, list of triggers/actions, example recipes (Invoice → Google Sheet; Contract → Slack alert).

## Files

- `code/zapier/package.json` — NEW
- `code/zapier/index.ts` — NEW
- `code/zapier/authentication.ts` — NEW
- `code/zapier/triggers/*.ts` — NEW
- `code/zapier/creates/*.ts` — NEW
- `code/zapier/searches/*.ts` — NEW
- `code/zapier/samples/*.json` — NEW
- `code/zapier/test/*.test.ts` — NEW
- `code/zapier/assets/icon.png` — NEW (placeholder)
- `docs/integrations/zapier.mdx` — NEW
- `system/architecture.md` — CHANGED (add Zapier under integrations)

## Acceptance Criteria

1. `cd code/zapier && npm install && npm test` passes.
2. `zapier validate` reports no errors.
3. Local invocation via `zapier invoke trigger record_created` returns sample records from a dev Sifter instance.
4. `zapier push` publishes to the developer portal without errors.
5. Hook subscribe / unsubscribe round-trip registers + deletes a webhook on the server.
6. Documentation page `docs/integrations/zapier.mdx` exists with at least two example recipes.
7. App submitted for Zapier certification (certification itself is off-repo; tracking via the developer portal).

## Out of Scope

- Make.com / n8n / Pipedream connectors — separate CRs if demand emerges (same shape, small lift once the Zapier one is done).
- Custom Zapier premium features (built-in filters, paths) — v1 uses standard features only.
- Official integration with `sifter-cloud`'s billing for Zapier-initiated tasks — tracked in cloud repo.
