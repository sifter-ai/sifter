---
title: "Landing page + enterprise contact"
status: synced
version: "1.0"
last-modified: "2026-04-17T00:00:00.000Z"
---

# Landing Page + Enterprise Contact

The public landing page and enterprise contact page for Sifter.

## LandingPage (`/`)

Sections in order:
1. **Navbar** — Logo, Docs, GitHub, Sign in, Get Started (primary CTA)
2. **Hero** — Headline + sub, code snippet (Python/cURL tab switcher), "Get Started" + "Read the Docs" CTAs
3. **How it works** — 3-step horizontal flow
4. **Pricing** — Free / Starter / Pro / Business / Scale cards (Stripe self-serve)
5. **Enterprise banner** — SSO, BYOK LLM, on-prem, custom SLA → `/enterprise`
6. **Footer** — GitHub, Docs, Pricing, Enterprise, Privacy, Terms

## EnterprisePage (`/enterprise`)

Contact form for enterprise inquiries:
- `name`, `email`, `company` (required)
- `use_case` select (Invoice / Contract / Receipt / Compliance / Other)
- `message` (optional textarea)
- `_honeypot` (hidden, anti-spam)
- Post-submit: inline thank-you (no redirect)

No backend endpoint needed for MVP — form can submit to a third-party form service (Formspree, Formspark) or be wired to the cloud email service later.
