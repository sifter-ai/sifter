---
title: "Docs site: migrate to Mintlify with new structure"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
---

## Summary

Migrate the developer documentation site from VitePress (`docs/`) to Mintlify, restructuring the sidebar to match the PageIndex docs model: Overview → Concepts → Integrations → Cloud → Self-hosting → Resources.

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
  overview/introduction.mdx    ← concept-first: what is a sift, what does Sifter do
  overview/quickstart.mdx      ← 5-liner Python: API key → create sift → upload → get records
  overview/pricing.mdx         ← cloud plans + link to /enterprise

Concepts
  concepts/sifts.mdx
  concepts/folders.mdx
  concepts/records.mdx
  concepts/citations.mdx
  concepts/dashboards.mdx
  concepts/queries-and-chat.mdx
  concepts/webhooks.mdx
  concepts/connectors.mdx

Integrations
  integrations/python-sdk.mdx        ← install, SifterClient, SiftHandle, polling, callbacks
  integrations/typescript-sdk.mdx    ← Node/browser SDK, same surface as Python
  integrations/rest-api.mdx          ← auth, endpoints, pagination, error codes
  integrations/mcp-server.mdx        ← install, config, Claude Desktop snippet, tool reference
  integrations/webhooks-reference.mdx ← event types, payload schemas, wildcard patterns, signature verification
  integrations/google-drive.mdx      ← connect Drive, connector setup, sync behavior
  integrations/cli.mdx               ← sifter-cli install, commands, config

Cloud
  cloud/overview.mdx           ← cloud vs self-hosted, feature table
  cloud/billing.mdx            ← plans, usage, Stripe portal
  cloud/mail-to-upload.mdx     ← inbound email ingestion
  cloud/shares.mdx             ← public share links
  cloud/audit-log.mdx          ← event log, export
  cloud/sso.mdx                ← Google SSO, org-level enforcement

Self-hosting
  self-hosting/docker-compose.mdx   ← single-command setup
  self-hosting/configuration.mdx    ← full SIFTER_* env vars table
  self-hosting/storage-backends.mdx ← FS / S3 / GCS
  self-hosting/llm-providers.mdx    ← LiteLLM, model strings, BYO key

Resources
  resources/cookbook/invoices-to-excel.mdx
  resources/cookbook/contracts-clauses.mdx
  resources/cookbook/receipts-bulk.mdx
  resources/cookbook/pdf-batch-csv.mdx
  resources/cookbook/resumes-to-json.mdx
  resources/cookbook/mcp-claude-desktop.mdx
  resources/tutorials/drive-to-sifter.mdx
  resources/tutorials/webhook-pipeline.mdx
  resources/changelog.mdx
```

### Mintlify configuration (`docs/docs.json`)

```json
{
  "$schema": "https://mintlify.com/docs.json",
  "theme": "mint",
  "name": "Sifter",
  "colors": {
    "primary": "#18181B",
    "light": "#71717A",
    "dark": "#18181B"
  },
  "redirects": [{ "source": "/", "destination": "/overview/introduction" }],
  "navigation": { "groups": [...] },
  "navbar": {
    "links": [{ "label": "GitHub", "href": "https://github.com/bfortunato/sifter" }],
    "primary": { "type": "button", "label": "Get Started", "href": "https://sifter.ai/register" }
  }
}
```

### Migration mapping (VitePress → Mintlify)

| Original VitePress file | New Mintlify location |
|---|---|
| `docs/index.md` | `docs/overview/introduction.mdx` |
| `docs/getting-started.md` | `docs/overview/quickstart.mdx` |
| `docs/concepts.md` | split → `docs/concepts/*.mdx` (8 files) |
| `docs/api.md` | `docs/integrations/rest-api.mdx` |
| `docs/sdk.md` | `docs/integrations/python-sdk.mdx` |
| `docs/self-hosting.md` | `docs/self-hosting/docker-compose.mdx` + `docs/self-hosting/configuration.mdx` |
| `docs/webhooks.md` | `docs/integrations/webhooks-reference.mdx` |

New files added beyond original scope:
- `docs/integrations/typescript-sdk.mdx` — TypeScript/Node SDK (added alongside CR-024)
- `docs/integrations/cli.mdx` — CLI tool reference (added alongside CR-025)
- `docs/integrations/google-drive.mdx` — Google Drive connector (added alongside CR-025-connectors)
- `docs/cloud/*.mdx` — Cloud-only features section
- `docs/concepts/citations.mdx`, `dashboards.mdx`, `connectors.mdx` — concepts added as features shipped
- `docs/resources/cookbook/resumes-to-json.mdx`, `mcp-claude-desktop.mdx` — additional cookbook entries

### Quickstart target (5-liner Python)

```python
from sifter import Sifter

s = Sifter(api_key="sk-...")
sift = s.create_sift(name="Invoices", instructions="client, date, total amount")
sift.upload("./invoices/").wait()
print(sift.records())
```

## Technical Notes

- Initialize with `mintlify init` in `docs/`; config lives in `docs/docs.json`
- VitePress files removed after Mintlify is confirmed working
- CI: GitHub Action with `mintlify broken-links` check on PRs touching `docs/`
- Deploy: Mintlify GitHub integration → auto-deploy on push to `main`
- Custom domain `docs.sifter.ai` when DNS is configured
- Logos: `logo-light.svg`, `logo-dark.svg` in `docs/` root; favicon = `logo.svg`
- `docs/images/` holds `hero.png`, `sifter-demo.gif`, `why-not-rag.png` used across pages

## Acceptance Criteria

1. `mintlify dev` runs without errors from `docs/`
2. All original VitePress content pages migrated with content intact, no dead internal links
3. Sidebar matches the structure above (Overview → Concepts → Integrations → Cloud → Self-hosting → Resources)
4. Overview/quickstart has runnable Python 5-liner
5. Cloud section covers billing, SSO, audit log, shares, mail-to-upload
6. Self-hosting section covers docker-compose, configuration (full env table), storage backends, LLM providers
7. Cookbook has at least 4 complete, copy-pasteable recipes
8. `mintlify broken-links` passes in CI
9. VitePress files are removed or archived before launch

## Out of Scope

- Full content rewrite of existing pages (migrate only, improve incrementally)
- Video embeds / Loom tutorials
- Internationalization
- OpenAPI-generated REST reference (manual page is sufficient for now)
