---
title: Users
status: synced
version: "2.0"
last-modified: "2026-04-17T00:00:00.000Z"
---

# Users

Sifter OSS is a developer-first product. Its primary and secondary personas are technical. Non-technical business users are served by **Sifter Cloud** (`sifter-cloud`), a separate product — they are intentionally out of scope for this repo.

## Primary Persona: Developer / AI Agent Builder

**Who**: A software developer, technical founder, or ML/AI engineer building a product, internal tool, or agent that needs to ingest and query documents. Comfortable with REST APIs, SDKs, and the command line. Owns the integration end-to-end.

**Goal**: Embed document extraction into a larger system without managing LLM orchestration, PDF parsing, or a result storage layer. Ship a feature, not a plumbing project.

**Behavior**:
- Evaluates Sifter from the terminal: `docker run` or `uvx sifter`, then `sifter extract sample.pdf` inside 60 seconds.
- Authenticates via API key; writes against the REST API, Python SDK, or TypeScript SDK.
- Creates extractors programmatically, uploads documents, polls or webhooks for completion, consumes typed records.
- Generates typed models (Pydantic, TS interfaces) from each sift's inferred schema.
- Wires the MCP server into Claude Desktop, Cursor, or a custom agent for conversational / agent-driven workflows.
- Uses citations (page + bbox + source text) to build their own trust/drill-down UI in their product.
- Forwards events through webhooks or the Zapier app to downstream destinations.

**Pain points solved**: No custom LLM prompts. No PDF parsing code. No result storage. No bespoke query layer. No reinventing citations. MCP gives AI agents a direct, structured channel into extracted records.

**Entry**: CLI (`uvx sifter`) → SDK / API → optional self-host via Docker.

---

## Secondary Persona: Self-Hoster / Technical Team

**Who**: A technical team at a company with data-residency, cost-at-scale, or private-VPC requirements that preclude SaaS. Typically a platform engineer, SRE, or solo technical founder. Prefers open-source, auditable stacks.

**Goal**: Run Sifter inside their own infrastructure, integrated with their existing observability, secrets management, and storage.

**Behavior**:
- Deploys via `docker-compose` (single-node) or Kubernetes (multi-node, external MongoDB).
- Configures LLM provider (OpenAI, Anthropic, Azure OpenAI, self-hosted model via LiteLLM).
- Points `SIFTER_STORAGE_BACKEND` at S3 / GCS / MinIO; monitors via standard Prometheus-compatible endpoints as they are added.
- Manages API keys for their own users; may front with their existing auth proxy.
- Follows releases on GitHub; upgrades on their own cadence.

**Pain points solved**: Full control over data flow and infrastructure. No per-document SaaS fees. Source-available codebase they can patch if needed. No vendor lock-in beyond their chosen LLM provider.

**Entry**: `ghcr.io/sifter-ai/sifter` image → `docker-compose.yml` → production deployment docs.

---

## Tertiary Target: Enterprise Buyer (contact-driven)

Not a day-to-day persona — a procurement, security, or IT decision-maker evaluating Sifter for organization-wide deployment with compliance requirements (SSO/SAML/SCIM, audit log, RBAC, BYOK LLM, custom SLA).

**Needs**: Dedicated deployment (on-premises or private cloud), compliance certifications, custom SLA.

**Entry**: `/enterprise` contact form on the website → sales conversation → dedicated deployment (often a layered OSS + custom services engagement; commercial terms handled by `sifter-cloud`).

These features are on the roadmap but are not part of the standard OSS product — they are delivered as custom engagements.

---

## Out of scope for this repo: Business User

Non-technical business users (finance ops, procurement, legal, SME operations) are served by **Sifter Cloud**. Their journey — sign up, upload, dashboard, citations drill-down, export, share — is a separate commercial product that consumes the OSS public APIs.

The OSS repo does not attempt to deliver a business-user product, because serving both audiences from one surface dilutes each. See `product/vision.md` for the architectural rule ("Cloud has no private APIs") and the `sifter-cloud` repo for the business-user persona and product documentation.
