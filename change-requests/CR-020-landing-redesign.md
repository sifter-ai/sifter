---
title: "Landing page redesign + enterprise contact page"
status: open
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
---

## Summary

Redesign `LandingPage.tsx` to reflect the 2-surface product model. Add a new `/enterprise` page with a feature list and contact form. Add `POST /api/enterprise/contact` backend endpoint that stores leads and sends a notification email.

## Motivation

The current landing page communicates Sifter as a single product with a generic hero. It doesn't distinguish the App experience (for business users) from the Developer path (API/SDK/MCP), and there is no path for enterprise inquiries. With the repositioning in CR-018, the landing needs to reflect the new surfaces clearly and give each persona a visible entry point.

## Detailed Design

### LandingPage.tsx — new section order

1. **Navbar** — Logo | Docs | GitHub | Sign in | Get Started (primary)
2. **Hero** — "Turn documents into structured data — instantly." Subtext updated to mention SDK + MCP. CTAs: "Get Started" (cloud signup) + "Read the Docs"
3. **Product cards** (2 cards, side by side):
   - *Sifter App* — icon, "For teams and business users", "Upload, extract, query — no code required." → "Try for free"
   - *Sifter Developer* — icon, "For developers and integrators", "REST API · Python SDK · MCP server" → "Read the docs"
4. **Code snippet** — Python 5-liner (same as quickstart in docs). Tab switcher for Python vs cURL.
5. **How it works** — 3-step horizontal flow: (1) Describe in plain English → (2) Upload documents → (3) Query & export
6. **Features grid** — 6 cards: Zero-config extraction, Multi-document pipelines, Queryable results, Python SDK, MCP server, Self-hostable
7. **Enterprise banner** — "Need SSO, on-prem, or a custom SLA?" + "Contact us" → `/enterprise`
8. **Footer** — GitHub · Docs · Pricing · Enterprise · Changelog · Status

### EnterprisePage.tsx (new, route `/enterprise`)

**Sections**:
1. Hero — "Enterprise document intelligence" — brief positioning
2. Features list (with icons):
   - SSO (SAML / SCIM)
   - Audit log
   - Role-based access control
   - BYOK LLM (Azure OpenAI, custom endpoints)
   - On-premises or dedicated cloud deployment
   - Custom SLA and support
3. Contact form:
   - `name` (text, required)
   - `email` (email, required)
   - `company` (text, required)
   - `use_case` (select: Invoice processing / Contract review / Receipt management / Compliance reporting / Other)
   - `message` (textarea, optional)
   - `_honeypot` (hidden, anti-spam)
   - Submit button: "Get in touch"
4. Post-submit state: inline thank-you message (no redirect)

### Backend: `POST /api/enterprise/contact`

**File**: `code/server/sifter/api/enterprise.py`

Request body (Pydantic):
```python
class EnterpriseContactRequest(BaseModel):
    name: str
    email: EmailStr
    company: str
    use_case: str
    message: str = ""
    _honeypot: str = ""  # must be empty
```

Behavior:
1. Reject if `_honeypot` is non-empty (bot detection) → 400
2. Validate fields (email format via Pydantic `EmailStr`)
3. Store in MongoDB collection `enterprise_leads`: `{name, email, company, use_case, message, created_at, ip_address}`
4. Call `email_sender.send_enterprise_lead(to=settings.sales_email, lead=lead)` — noop in OSS, Resend in cloud
5. Return `{"status": "ok"}`

**Rate limiting**: 3 req/hour/IP (slowapi, existing middleware).

**New config**: `SIFTER_SALES_EMAIL` env var (default `""`; if empty, skips email send silently).

**EmailSender protocol extension** (`code/server/sifter/services/email.py`):
```python
async def send_enterprise_lead(self, to: str, lead: dict) -> None: ...
```
Default `NoopEmailSender` implementation: no-op.

**Router registration** in `code/server/sifter/main.py`:
```python
from sifter.api import enterprise
app.include_router(enterprise.router)
```

### New MongoDB collection

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | auto |
| `name` | str | |
| `email` | str | |
| `company` | str | |
| `use_case` | str | |
| `message` | str | may be empty |
| `created_at` | datetime | UTC |
| `ip_address` | str | from request |

## Files Changed

- `code/frontend/src/pages/LandingPage.tsx` — section rewrite
- `code/frontend/src/pages/EnterprisePage.tsx` — NEW
- `code/frontend/src/App.tsx` — add route `/enterprise`
- `code/server/sifter/api/enterprise.py` — NEW
- `code/server/sifter/services/email.py` — add `send_enterprise_lead` to protocol
- `code/server/sifter/config.py` — add `SIFTER_SALES_EMAIL`
- `code/server/sifter/main.py` — register enterprise router

## Acceptance Criteria

1. Landing page shows 2 product cards with separate CTAs
2. Code snippet visible on landing (Python 5-liner)
3. "Contact us" / enterprise banner visible, links to `/enterprise`
4. `/enterprise` page loads with feature list + form
5. Submitting the form with valid data → 200 OK → inline thank-you state; lead stored in MongoDB `enterprise_leads`
6. Submitting with filled `_honeypot` → form rejected
7. Rate limit: 4th submission from same IP within 1 hour → 429
8. `SIFTER_SALES_EMAIL` configured → email sent on submit (tested with mock sender in tests)
9. `npx tsc --noEmit` passes in frontend

## Out of Scope

- CRM integration (HubSpot, Pipedrive)
- Admin UI for viewing leads (accessible directly in MongoDB or via future admin dashboard)
- A/B testing on landing sections
