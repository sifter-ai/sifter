---
title: "Landing page + enterprise contact"
status: synced
version: "1.2"
last-modified: "2026-05-05T12:00:00.000Z"
---

# Landing Page + Enterprise Contact

The public landing page and enterprise contact page for Sifter.

## LandingPage (`/`)

Sections in order:

1. **Navbar**
2. **Hero**
3. **Social proof bar**
4. **Why LLM extraction**
5. **See it in action**
6. **Why not RAG**
7. **How it works**
8. **USP — Chat / Query / Build**
9. **Features**
10. **Use cases**
11. **MCP / Integrations**
12. **OSS section**
13. **Pricing**
14. **Two ways to run**
15. **Final CTA**
16. **Footer**

---

### 1. Navbar

Sticky, blurred background, `z-50`.

- Left: logo icon + "Sifter" wordmark
- Right links (hidden on mobile): Docs → `https://docs.sifter.run`, GitHub → `https://github.com/sifter-ai/sifter`, Sign in → `https://app.sifter.run/login`
- Primary CTA button: **"Try free →"** → `https://app.sifter.run/register`

---

### 2. Hero

Two-column layout (`md:grid-cols-[1fr_1.1fr]`).

**Left column**

Badge (pill, monospace, uppercase): `MIT open source · Bring your own LLM`

**Headline:**
> Your documents are
> **a dark database.**

(`"a dark database."` is in `text-primary`.)

**Sub (two lines):**

First line (small, `font-medium`):
> Here is how to turn the lights on.

Second line (body):
> Extract structured records from any file — PDFs, contracts, photos, receipts, scans, images. Filter, aggregate, and query with API, SDK, or MCP. No templates. No layout rules.

**Teaser box** (retrieval vs aggregation, `border rounded-xl bg-muted/30`, font mono `text-[12px]`):
- ✗ `"Find my January bill"` → `retrieval, use search`
- ✓ `"How much did I spend on energy last year?"` → `Sifter`

**CTAs:**
- Primary: **"Try Sifter Cloud →"** → `https://app.sifter.run/register`
- Secondary: **"View on GitHub ↗"** → `https://github.com/sifter-ai/sifter`

Under CTAs: `Free tier forever. No credit card required. Read the docs →`

**Code snippet** (Python only, no tab switcher, dark `#111113` bg):

```python
from sifter import Sifter

s = Sifter(api_key="sk-...")
# PDFs, photos, scans — any file
records = s.sift("./documents/", "brand, model, condition, location")
# [{"brand": "CAT", "model": "320 GC", ...}]
```

**Right column**

Hero image: `/images/hero.png` (white card, `rounded-2xl`, `shadow-2xl`).

Floating badge bottom-left (visible `md+`):
- Label: `Works via`
- Value: `UI · API · SDK · MCP`

---

### 3. Social proof bar

Thin strip, `border-t border-b bg-muted/20`.

```
Open source · MIT licensed · Self-hostable
```

Monospace, uppercase, small tracking.

---

### 4. Why LLM extraction

Two-column layout (`md:grid-cols-2`), `border-t`.

**Label (mono, uppercase):** `Why LLM extraction`

**Heading:** `Works on real-world documents, not ideal ones.`

**Body:** Traditional extractors break when the layout changes — a new invoice supplier, a CV with an unusual format, a contract with non-standard clause ordering. Sifter uses an LLM as the extraction engine, so it reads documents contextually, like a human would. The same sift handles 50 CVs from 50 different candidates, or utility bills from 10 different providers, without per-layout configuration.

**Right visual (two cards):**
- 🔴 Template extractor — `Layout A ✓ · Layout B ✗ · Layout C ✗`
- 🟢 Sifter — `Layout A ✓ · Layout B ✓ · Layout C ✓`

---

### 5. See it in action

Full-width card (`border rounded-2xl`), `border-b`.

**Label (mono, uppercase):** `See it in action`

**Heading:** `Drop a document. Get structured data.`

Two-panel layout (`md:grid-cols-2 divide-x`):

**Left — Input:**
- File: `warehouse_b_machine_047.jpg` / `photo · 2.1 MB`
- Schema box: `Extract: brand, model, serial_number, year, condition, location`
- CTA: **"Try free →"**

**Right — Output** (dark `#111113` bg):
JSON preview:
```json
{
  "brand": "Caterpillar",
  "model": "320 GC",
  "serial_number": "CAT0320GC00482",
  "year": 2019,
  "condition": "good",
  "location": "Warehouse B – Bay 4",
  "last_service": "2024-02-10"
}
```
Label: `7 fields`

---

### 6. Why not RAG

Full-width dark section (`bg-[#0a0a0b] text-white`), dot-grid pattern overlay.

**Label (mono, amber):** `Why not RAG?`

**Heading:**
> RAG fails on
> homogeneous collections.

**Body:** You have 500 invoices. They all look alike to a similarity search. Now ask a real business question.

**Diagram card** (white bg): image `/images/docs-to-records.jpeg` with captions `RAG · similarity, uncertain` and `Sifter · structured, exact`.

**Example query bar (mono):**
> "How much did I invoice to Acme Corp in September 2026?"

**Two panels side by side:**

| | RAG · similarity search | Sifter · structured aggregation |
|---|---|---|
| Status | 🔴 animate-pulse | 🟢 |
| Result | Chunk snippets with wrong clients/months | Table: client, date, total → exact SUM |
| Answer | "Approximately €12,400–€20,000 based on available context" | `✓ exact · complete · filter(client=Acme Corp, month=2026-09)` |

Footer note: `"Total invoiced per client per month" is an aggregation query, not a retrieval query. RAG was built for retrieval. Sifter was built for this.`

---

### 7. How it works

Three-step horizontal flow with connecting line (`border-t`).

**Label:** `How it works`
**Heading:** `Up and running in minutes`

| # | Title | Description |
|---|-------|-------------|
| 1 | Describe | Name a sift and describe what to extract in natural language. |
| 2 | Upload | Drag documents or connect a folder — every upload is processed automatically. |
| 3 | Query & export | Filter, aggregate, and export — or ask questions in natural language. |

---

### 8. USP — Chat / Query / Build

Three-card grid (`md:grid-cols-3`), `border-t bg-muted/20`.

**Heading:** `Everything you need to work with documents at scale.`

| Card | Icon | Title | Body |
|------|------|-------|------|
| 1 | MessageSquare | Chat | Ask questions about your documents in plain language. Get structured answers, not just text blobs. Works with Claude, ChatGPT, or any MCP-compatible client. |
| 2 (accent/primary bg) | Search | Query | Define a schema. Sifter extracts exactly those fields — every time. Filter, sort, export. Your documents, like a database. |
| 3 | Plug | Build | Python SDK. REST API. Webhooks. MCP server. Integrate Sifter into any stack, any language, any workflow. Open source, self-hostable, no vendor lock-in. |

---

### 9. Features

Nine-card grid (`md:grid-cols-3`), `border-t`.

**Label:** `Features`
**Heading:** `Built for developers. Usable by everyone.`

| Icon | Title | Description |
|------|-------|-------------|
| Filter | Schema-driven extraction | Define your data model in natural language or JSON. Sifter extracts exactly those fields — every time. |
| Shield | Verifiable citations | Every extracted field is anchored to a page number and source text. No hallucinations you can't trace. |
| Cpu | Multi-LLM support | Works with OpenAI, Anthropic, Gemini, Mistral, and 50+ providers via LiteLLM. Bring your own key. |
| Folder | Multi-document pipelines | Link folders to multiple extractors. Every upload triggers all linked sifts automatically. |
| Database | NL query | Query extracted records in plain English. "Contracts expiring in 90 days." "Machines in poor condition by location." |
| Code2 | Python + TypeScript SDK | Full async Python SDK and TypeScript client with typed schemas generated per sift. |
| Terminal | MCP native | Sifter speaks MCP out of the box. Connect Claude Desktop, Cursor, or any MCP-compatible tool. |
| Webhook | Webhooks + dashboards | Trigger automations on every extraction. Visualize results in real-time dashboards. |
| Server | Self-hostable | Full Docker Compose stack. Your data, your infrastructure, your keys. MIT licensed. |

---

### 10. Use cases

Five use-case cards + 1 catch-all card (`md:grid-cols-3`), `border-t bg-muted/20`.

Each card has icon, title, description, and a mono example query box.

**Label:** `Use cases`
**Heading:** `Any homogeneous document collection.`

| Icon | Title | Description | Example query |
|------|-------|-------------|---------------|
| 📋 | Contracts | Extract parties, renewal dates, obligations, and governing law from contracts of any structure. | "Contracts expiring in the next 60 days?" |
| 📷 | Equipment photos | Photograph machines, vehicles, or assets in the field. Sifter extracts brand, model, serial, condition, and location from each photo. | "Machines in poor condition in Warehouse B?" |
| 📄 | CVs / Resumes | Turn a folder of candidates into a queryable talent database — works across any CV layout. | "Candidates with Python and 5+ years exp?" |
| 🧾 | Receipts & expenses | Capture merchant, category, totals from paper or digital receipts — any language, any format. | "Category spend over the last 3 months?" |
| 💡 | Utility bills | Parse electricity, gas, water, and phone bills across all providers into a single dataset. | "Total energy spend by month last year?" |

**Catch-all card** (dashed border `border-2 border-dashed border-primary/25`):
- Icon: 📂
- Title: `Your documents`
- Body: If you have a collection of similar documents and want to query across them, Sifter works. Describe what to extract in plain language — no templates, no training.
- Query box: `"What field do you want to extract?"`

---

### 11. MCP / Integrations

Two-column layout (`md:grid-cols-2`), `border-t`.

**Badge:** `MCP native`
**Heading:** `Your LLM can now read your documents.`
**Body:** Sifter exposes an MCP server — the protocol that lets Claude, ChatGPT, Cursor, and other AI tools access external data. Point it at Sifter Cloud and your LLM gets instant, structured access to every document you've uploaded.

**Integration tags:** Claude Desktop · ChatGPT · Cursor · Continue · Zed

**Links:**
- "Get your MCP URL →" → `https://app.sifter.run/register`
- "Read the MCP guide ↗" → `https://docs.sifter.run/integrations/mcp-server`

**Right: code block** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "sifter": {
      "type": "http",
      "url": "https://api.sifter.run/mcp/sk-..."
    }
  }
}
```
Caption: `Paste this in Claude Desktop → Settings → MCP. That's it.`

---

### 12. OSS section

Two-column layout (`md:grid-cols-2`), `border-t bg-muted/20`.

**Badge:** `MIT · Self-hostable`
**Heading:** `Open source at the core.`
**Body:** Sifter is MIT-licensed and fully open source. Self-host the complete stack — chat, dashboards, webhooks, SDK, and MCP stdio — with a single Docker Compose command. No features crippled, no artificial limitations.

**Metric:** 📦 MIT / license

**Links:**
- "View on GitHub ↗" → `https://github.com/sifter-ai/sifter`
- "Read the docs ↗" → `https://docs.sifter.run/self-hosting/docker-compose`

**Right: code block:**
```bash
# self-host in two commands
$ git clone https://github.com/sifter-ai/sifter
$ docker compose up
```

---

### 13. Pricing

Five-column card grid (`lg:grid-cols-5`), `border-t`.

**Label:** `Pricing`
**Heading:** `Start free. Scale when you need to.`
**Sub:** All paid plans include the same features — API access, MCP remote, Google Drive connector, advanced chat, live dashboards, and webhooks. The only difference is the number of extractions per month. 1 extraction = 1 document processed by a sift (up to 10 pages).

| Plan | Price | Extractions | Sifts | Highlighted features |
|------|-------|-------------|-------|----------------------|
| Free | $0 / forever | 10/mo | 3 | Web UI, 7-day retention. No API/MCP access. |
| Starter | $19 / mo | 500/mo | 10 | Full REST API, MCP remote, Google Drive, Mail-to-upload, CSV export, unlimited retention. |
| **Pro** ⭐ | $49 / mo | 3,000/mo | ∞ | Everything in Starter + SSO (Google), audit log. |
| Business | $149 / mo | 15,000/mo | ∞ | Everything in Pro + PDF report export, advanced webhooks, unlimited shares. |
| Scale | $399 / mo | 50,000/mo | ∞ | Everything in Business + share via email + PDF, priority support. |

Pro is highlighted ("Most popular").

Footer links:
- "Or self-host for free. Docker setup guide →"
- "Enterprise — custom SLA, BYOK LLM, on-prem →" → `/enterprise`

---

### 14. Two ways to run

Two-card layout (`md:grid-cols-2`), `border-t bg-muted/20`.

**Label:** `Deployment`
**Heading:** `Two ways to run Sifter`

| | Sifter Cloud | Sifter Self-hosted |
|---|---|---|
| Badge | "Recommended" | — |
| Style | Light gradient | Dark `#111113` |
| Sub | Sign up and start in minutes | Open source · MIT |
| Body | No infrastructure to manage. Web UI, REST API, Python SDK, and MCP — all on Sifter's hosted platform. | Run on your own infrastructure. Bring your own LLM API key. Full control over data, storage, and scaling. |
| CTA | "Get started free →" → `https://app.sifter.run/register` | `docker compose up -d` + "Read the docs →" |

---

### 15. Final CTA

Dark section (`bg-[#0a0a0b] text-white`), dot-grid overlay, `border-t`.

**Label (mono, `text-primary`):** `Your documents are a dark database.`
**Heading:** `Here is how to turn the lights on.`
**Sub:** `Free tier forever. Self-host anytime. No credit card required.`

**CTAs:**
- Primary: **"Try Sifter Cloud →"** → `https://app.sifter.run/register`
- Secondary: **"View on GitHub ↗"** → `https://github.com/sifter-ai/sifter`

Contact: `hello@sifter.ai`

---

### 16. Footer

Five-column grid (`md:grid-cols-5`), `border-t`.

**Brand column:** logo + "Open-source document intelligence. MIT licensed."

| Column | Links |
|--------|-------|
| Product | Features (#features), Pricing (#pricing), Changelog, Roadmap (GitHub issues), Enterprise |
| Developers | Docs, SDK reference, MCP guide, API reference, Self-hosting |
| Company | GitHub ↗, Twitter ↗, Discord ↗, Blog |
| Legal | Privacy, Terms, Cookie policy |

Bottom bar: `© 2025 Sifter. MIT Licensed.` · `hello@sifter.ai`

---

## EnterprisePage (`/enterprise`)

Contact form for enterprise inquiries:
- `name`, `email`, `company` (required)
- `use_case` select (Invoice / Contract / Receipt / Compliance / Other)
- `message` (optional textarea)
- `_honeypot` (hidden, anti-spam)
- Post-submit: inline thank-you (no redirect)

No backend endpoint needed for MVP — form submits to a third-party form service (Formspree, Formspark) or wired to the cloud email service later.
