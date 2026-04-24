---
title: "Landing page + enterprise contact"
status: synced
version: "1.1"
last-modified: "2026-04-24T00:00:00.000Z"
---

# Landing Page + Enterprise Contact

The public landing page and enterprise contact page for Sifter.

## LandingPage (`/`)

Sections in order:
1. **Navbar** — Logo, Docs, GitHub, Sign in, Get Started (primary CTA)
2. **Hero** — Headline + sub, code snippet (Python/cURL tab switcher), "Get Started" + "Read the Docs" CTAs
3. **Why LLM extraction** — short callout explaining the structural advantage over template-based extractors (see below)
4. **How it works** — 3-step horizontal flow
5. **Use cases** — concrete examples of heterogeneous collections that Sifter handles well (see below)
6. **Pricing** — Free / Starter / Pro / Business / Scale cards (Stripe self-serve)
7. **Enterprise banner** — SSO, BYOK LLM, on-prem, custom SLA → `/enterprise`
8. **Footer** — GitHub, Docs, Pricing, Enterprise, Privacy, Terms

### Hero copy

**Headline:** *"Structure any document. Query it like a database."*

**Sub:** *"Upload invoices, CVs, contracts, utility bills — any document collection. Sifter extracts structured data with an LLM, stores it in MongoDB, and gives you a REST API, Python/TypeScript SDKs, and natural-language queries. No template configuration. No layout rules."*

### Why LLM extraction section

A short 2-column layout (text left, visual right) placed between Hero and How it works:

**Heading:** *"Works on real-world documents, not ideal ones."*

**Body:** Traditional extractors break when the layout changes — a new invoice supplier, a CV with an unusual format, a contract with non-standard clause ordering. Sifter uses an LLM as the extraction engine, so it reads documents contextually, like a human would. The same sift handles 50 CVs from 50 different candidates, or utility bills from 10 different providers, without per-layout configuration.

**Visual:** a simple before/after — "Template extractor: layout A ✓, layout B ✗" vs "Sifter: layout A ✓, layout B ✓".

### Use cases section

Replaces or augments the "How it works" section. A grid of 6 use-case cards, each with an icon, a one-line title, and a 2-line description:

| Icon | Title | Description |
|------|-------|-------------|
| 🧾 | **Invoices** | Extract supplier, amounts, VAT, line items from any invoice format. |
| 📄 | **CVs / Resumes** | Turn a folder of candidates into a queryable talent database — works across any CV layout. |
| 📋 | **Contracts** | Pull parties, dates, governing law, and key obligations from contracts of any structure. |
| 💡 | **Utility bills** | Parse electricity, gas, water, and phone bills across all providers into a single dataset. |
| 🧾 | **Receipts** | Capture merchant, items, totals, and payment method from paper or digital receipts. |
| 🏦 | **Bank statements** | Extract transactions, balances, and period from statements regardless of bank format. |

These are illustrative, not exhaustive. Copy should make clear that any homogeneous document collection works.

## EnterprisePage (`/enterprise`)

Contact form for enterprise inquiries:
- `name`, `email`, `company` (required)
- `use_case` select (Invoice / Contract / Receipt / Compliance / Other)
- `message` (optional textarea)
- `_honeypot` (hidden, anti-spam)
- Post-submit: inline thank-you (no redirect)

No backend endpoint needed for MVP — form can submit to a third-party form service (Formspree, Formspark) or be wired to the cloud email service later.
