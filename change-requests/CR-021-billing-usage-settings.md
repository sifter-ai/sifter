---
title: "Cloud: Billing & Usage settings pages"
status: open
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
cloud-cr: "CR-017, CR-018"
---

## Summary

Add `/settings/billing` and `/settings/usage` pages to the React frontend. Show plan details, current usage with progress bars, a Checkout button for plan upgrades, and a Stripe Customer Portal link. Requires cloud backend (`mode: "cloud"` from `GET /api/config`).

## Motivation

Users on the cloud deployment need a self-service way to see their quota, upgrade their plan, and manage their Stripe subscription. The cloud backend exposes `GET /api/billing/subscription`, `POST /api/billing/portal`, and `POST /api/cloud/billing/checkout`; the frontend just needs to wire them up.

## Detailed Design

### `/settings/billing`

```
BillingPage
├── PlanBadge          — current plan name + status chip (active | past_due | trial)
├── TrialBanner        — visible when plan_code="pro_trial"; shows days remaining
├── PlanCards          — Free / Pro ($49) / Business ($149) / Scale ($399)
│   └── each card: feature list, price, "Current" badge or "Upgrade" CTA
├── ManageBillingBtn   — calls POST /api/billing/portal → redirect to Stripe portal
└── InvoiceNote        — "Invoices managed via Stripe"
```

**Upgrade flow:**
1. User clicks "Upgrade" on a plan card.
2. Frontend calls `POST /api/cloud/billing/checkout` with `{plan_code, success_url, cancel_url}`.
3. Redirect to `checkout_url` returned by backend.
4. On return, refetch subscription.

### `/settings/usage`

```
UsagePage
├── DocUsageBar        — docs_processed / docs_limit (hide bar if limit is null)
├── StorageUsageBar    — storage_bytes / storage_limit_mb
├── SiftsUsageBar      — sifts_count / sifts_limit (hide if unlimited)
└── UsageAlertNote     — "Alerts sent at 50 %, 80 %, 100 % of quota"
```

Data from `GET /api/usage`.

### Sidebar integration

Add "Billing" and "Usage" links to the existing Settings sidebar under an "Account" section. Only render when `config.mode === "cloud"`.

### Trial banner

When `plan === "pro_trial"` and `trial_end_at` is present, show a yellow banner at the top of all app pages: _"Your Pro trial ends in N days — upgrade to keep access."_ with a link to `/settings/billing`.

## Components

- `PlanCard.tsx` — reusable plan card (name, price, features, CTA)
- `UsageBar.tsx` — labeled progress bar (0..100%) with color thresholds (green < 80 %, amber < 100 %, red ≥ 100 %)
- `TrialBanner.tsx` — dismissible yellow alert

## API calls

| Action | Method | Path |
|--------|--------|------|
| Load plan + usage | GET | `/api/billing/subscription` |
| Load usage only | GET | `/api/usage` |
| Open portal | POST | `/api/billing/portal` |
| Start checkout | POST | `/api/cloud/billing/checkout` |

## Out of scope

- Actual Stripe.js integration (portal redirect is server-side)
- Invoice history table
- Coupon / promo code field
