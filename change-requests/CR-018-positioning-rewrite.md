---
title: "Positioning rewrite: 2-surface model + new personas"
status: open
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
---

## Summary

Rewrite `product/vision.md` and `product/users.md` to reflect the new 2-surface product model (Sifter App + Sifter Developer) with a Contact CTA for enterprise, replacing the previous 3-surface model (App / Developer / Enterprise tier). Minor updates to `system/roadmap.md` and `system/cloud.md` for consistency.

## Motivation

The original positioning tried to serve three personas simultaneously (Ops Manager, Developer, Analyst) with three product surfaces including a first-class Enterprise tier. In practice:

- The ops manager won't self-host — they reach Sifter via the cloud App or via a developer who set it up
- The analyst is not a separate persona: it's a mode of the business user (query/aggregations tab)
- Enterprise is not a product tier that can be self-served — it's a sales conversation (SSO, on-prem, BYOK LLM)

The new model focuses acquisition: cloud is the default entry for everyone. Self-host is available for developers with specific requirements. Enterprise is a CTA, not a SKU.

This repositioning is the foundation for Phase 3 (docs, landing, MCP) and must land before Cloud GA.

## Detailed Design

### New product surfaces

| Surface | Target | Entry |
|---------|--------|-------|
| Sifter App (cloud) | Business user (ops/finance/legal) | Signup → upload → table |
| Sifter Developer (API/SDK/MCP) | Developer / integrator | API key cloud → call API or SDK |
| Contact us | Enterprise buyer (SSO/on-prem/SLA) | `/enterprise` form |

### New personas (users.md)

1. **Business User** — cloud App only. Goal: structured table from PDFs. Pain: manual copy-paste, broken macros, expensive per-seat SaaS. Chat is secondary (ad-hoc questions), table+export is primary.
2. **Developer** — API/SDK/MCP. Cloud default, self-host optional. Embeds extraction in their own product or sets it up for a team.
3. **Enterprise Buyer** — not an operational persona. Procurement/IT lead who needs SSO/audit/on-prem. Reached via contact form, delivered as custom engagement.

### Files changed

- `product/vision.md` — rewrite with 2 surfaces, updated value props, MCP in the list
- `product/users.md` — 3 new personas replacing 3 old ones
- `system/roadmap.md` — Phase 3 added (positioning + docs + MCP), Phase 4 (cloud GA), Phase 5 (enterprise/scale)
- `system/cloud.md` — messaging alignment: `sifter-cloud` is "the managed offering", not a "tier"
- `system/mcp.md` — NEW: spec for MCP server

## Acceptance Criteria

1. `product/vision.md` names exactly 2 product surfaces + Contact CTA (no standalone Enterprise tier)
2. `product/users.md` has 3 personas: Business User, Developer, Enterprise Buyer
3. `system/roadmap.md` has Phase 3 with CR-018/019/020/021 items
4. `system/mcp.md` exists with tool list, config, and Claude Desktop snippet
5. No content in the updated files still refers to a self-service Enterprise tier or a 3-tier model

## Out of Scope

- Actual code changes (those are CR-019, CR-020, CR-021)
- Pricing page content (deferred to cloud GA)
