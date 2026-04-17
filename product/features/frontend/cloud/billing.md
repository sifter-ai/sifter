---
title: "Cloud: Billing & Usage Settings"
status: synced
cloud: true
---

# Billing & Usage — Frontend

Only rendered when `config.mode === "cloud"`.

## Routes

- `/settings/billing` — plan management
- `/settings/usage` — quota overview

## BillingPage

- `PlanBadge` — current plan name + status chip (active | past_due | trial)
- `TrialBanner` — yellow banner when `plan_code="pro_trial"`; shows days remaining
- `PlanCards` — Free / Pro ($49) / Business ($149) / Scale ($399); each with feature list, price, "Current" badge or "Upgrade" CTA
- `ManageBillingBtn` — `POST /api/billing/portal` → redirect to Stripe portal

**Upgrade flow:** click Upgrade → `POST /api/cloud/billing/checkout` with `{plan_code, success_url, cancel_url}` → redirect to `checkout_url`.

## UsagePage

- `UsageBar` — labeled progress bar with thresholds: green < 80%, amber < 100%, red ≥ 100%
- `DocUsageBar` — docs_processed / docs_limit (hide bar if limit null)
- `StorageUsageBar` — storage_bytes / storage_limit_mb
- `SiftsUsageBar` — sifts_count / sifts_limit (hide if unlimited)
- Note: "Alerts sent at 50%, 80%, 100% of quota"

## Trial banner (global)

When `plan === "pro_trial"` and `trial_end_at` is present: dismissible yellow top banner across all pages — "Your Pro trial ends in N days — upgrade to keep access." linking to `/settings/billing`.

## Sidebar

Add "Billing" and "Usage" links under Settings, cloud-only.

## Components

- `PlanCard.tsx`
- `UsageBar.tsx`
- `TrialBanner.tsx`

## API

| Action | Method | Path |
|--------|--------|------|
| Load subscription | GET | `/api/billing/subscription` |
| Load usage | GET | `/api/usage` |
| Open portal | POST | `/api/billing/portal` |
| Start checkout | POST | `/api/cloud/billing/checkout` |
