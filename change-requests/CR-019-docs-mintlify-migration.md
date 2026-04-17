---
title: "Docs site: migrate to Mintlify with new structure"
status: open
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
---

## Summary

Migrate the developer documentation site from VitePress (`docs/`) to Mintlify, restructuring the sidebar to match the PageIndex docs model: Overview → Concepts → Integrations → Self-hosting → Resources.

## Motivation

The current VitePress site has the right content but a flat structure that doesn't guide a developer through evaluation → integration → production. Mintlify provides:
- Hosted deployment with zero infra (subdomain `docs.sifter.ai`)
- Built-in components (`<Card>`, `<Tabs>`, `<CodeGroup>`, `<Steps>`) that make quickstarts and API references cleaner
- Better search, responsive design, and analytics out of the box

The new structure separates concerns clearly: a new developer can go Quickstart → Python SDK in 10 minutes without reading about self-hosting or aggregation pipelines first.

## Detailed Design

### Sidebar structure

```
Overview
  introduction.mdx       ← concept-first: what is a sift, what does Sifter do
  quickstart.mdx         ← 5-liner Python: API key → create sift → upload → get records
  pricing.mdx            ← cloud plans + link to /enterprise

Concepts
  sifts.mdx
  folders.mdx
  records.mdx
  aggregations.mdx
  queries-and-chat.mdx
  webhooks.mdx

Integrations
  python-sdk.mdx         ← install, Sifter client, SiftHandle, FolderHandle, polling, callbacks
  rest-api.mdx           ← auth, endpoints, pagination, error codes
  mcp-server.mdx         ← install, config, Claude Desktop snippet, tool reference
  webhooks-reference.mdx ← event types, payload schemas, wildcard patterns, signature verification

Self-hosting
  docker-compose.mdx
  configuration.mdx      ← full SIFTER_* env vars table
  storage-backends.mdx   ← FS / S3 / GCS
  llm-providers.mdx      ← LiteLLM, model strings, BYO key

Resources
  cookbook/
    invoices-to-excel.mdx
    contracts-clauses.mdx
    receipts-bulk.mdx
    pdf-batch-csv.mdx
  tutorials/
    gmail-to-sifter.mdx
    webhook-pipeline.mdx
  changelog.mdx
```

### Migration mapping (existing → new)

| Current file | New location |
|---|---|
| `docs/index.md` | `docs/overview/introduction.mdx` |
| `docs/getting-started.md` | `docs/overview/quickstart.mdx` |
| `docs/concepts.md` | split → `docs/concepts/*.mdx` (6 files) |
| `docs/api.md` | `docs/integrations/rest-api.mdx` |
| `docs/sdk.md` | `docs/integrations/python-sdk.mdx` |
| `docs/self-hosting.md` | `docs/self-hosting/docker-compose.mdx` + `docs/self-hosting/configuration.mdx` |
| `docs/webhooks.md` | `docs/integrations/webhooks-reference.mdx` |

New files (scaffold with TODO content for now):
- `docs/integrations/mcp-server.mdx` — MCP tools reference (completed alongside CR-021)
- `docs/overview/pricing.mdx`
- `docs/self-hosting/storage-backends.mdx`
- `docs/self-hosting/llm-providers.mdx`
- All cookbook and tutorial pages

### Quickstart target (5-liner Python)

```python
from sifter import Sifter

s = Sifter(api_key="sk-...")
sift = s.create_sift(name="Invoices", instructions="client, date, total amount")
sift.upload("./invoices/").wait()
print(sift.records())
```

## Technical Notes

- Archive current VitePress in `docs-vitepress-archive/` (removed once Mintlify is live)
- Initialize with `mintlify init` in `docs/`
- `mint.json` configures sidebar, colors (`#18181B` primary), logo
- CI: add GitHub Action with `mintlify broken-links` check on PRs touching `docs/`
- Deploy: Mintlify GitHub integration → auto-deploy on push to `main`. Custom domain `docs.sifter.ai` when DNS is configured.

## Acceptance Criteria

1. `mintlify dev` runs without errors from `docs/`
2. All 7 existing content files are migrated (content intact, no dead links)
3. Sidebar matches the structure above
4. Quickstart page has runnable Python 5-liner
5. MCP page exists (may be scaffold/TODO at this stage)
6. `mintlify broken-links` passes in CI
7. VitePress files are removed or archived

## Out of Scope

- Full content rewrite of existing pages (migrate only, improve incrementally)
- Video embeds / Loom tutorials
- Internationalization
