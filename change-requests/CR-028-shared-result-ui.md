---
title: "Cloud: Shared Result — Share button, dialog, settings page, public viewer"
status: open
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
cloud-cr: "CR-019"
---

## Summary

Add share functionality to the frontend: a Share button on aggregations/chat messages/dashboards, a share creation dialog, a Shares settings page for managing existing shares, and a public viewer page at `/s/:slug`. Requires cloud backend (`/api/cloud/shares/*`, `/public/shares/*`).

## Motivation

Cloud users need to share analysis results with stakeholders who may not have a Sifter account. The backend handles slug generation, access control (private link / org-only / password), PDF rendering, and email delivery; the frontend needs to surface these capabilities.

## Detailed Design

### Share button placement

Add a `ShareBtn` component (icon + "Share") in three locations:

| Source | Location |
|--------|----------|
| Aggregation result | Aggregation result card toolbar |
| Chat message | `ActionBar` in `AssistantMessage` (CR-023) |
| Dashboard | `DashboardHeader` (CR-024) |

### Share creation dialog (`ShareDialog.tsx`)

```
ShareDialog
├── TitleField           — auto-filled from source title
├── AccessSelect         — private_link | org_only | password
│   └── PasswordField    — shown when access=password
├── ExpiryPicker         — optional date picker
├── CreateBtn            — POST /api/cloud/shares
└── (after creation)
    ├── LinkCopyField    — {base_url}/s/{slug}
    ├── SendEmailBtn     — opens EmailModal
    └── DownloadPDFBtn   — GET /api/cloud/shares/:id/pdf → download
```

### Email modal

```
EmailModal
├── RecipientsField  — comma-separated or tag input
├── SubjectField     — default: "Shared: {title}"
├── MessageField     — optional note
└── SendBtn          — POST /api/cloud/shares/:id/email
```

### Shares settings page (`/settings/shares`)

```
SharesPage
├── SharesTable
│   ├── title
│   ├── kind chip      — aggregation | chat_message | dashboard_view
│   ├── access badge   — private_link | org_only | password
│   ├── view_count
│   ├── expires_at
│   └── actions: copy link | revoke | delete
└── EmptyState
```

Load from `GET /api/cloud/shares`.

### Public viewer (`/s/:slug`)

```
PublicViewerPage
├── (if access=password && not unlocked)
│   └── PasswordForm    — POST /public/shares/:slug/unlock → stores view JWT
├── (if unlocked or public)
│   ├── ShareHeader     — title, created_by org name, created_at
│   └── BlockRenderer   — renders source_snapshot blocks (same as chat CR-023)
│       ├── charts via Recharts
│       ├── tables via TanStack Table
│       └── text / big_number / records_list
└── (if revoked or expired)
    └── GoneMessage     — "This link has expired or been revoked"
```

The public viewer requires no authentication. The view JWT (returned by `/unlock`) is stored in sessionStorage and sent as `Authorization: Bearer <view_jwt>` on subsequent calls if needed.

### Plan gate

If `plan.shares_max` is reached, disable the Share button with tooltip "Upgrade to share more results".

If `plan.share_pdf === false`, disable DownloadPDFBtn with upgrade prompt.

If `plan.share_email === false`, disable SendEmailBtn with upgrade prompt.

## Components

- `ShareBtn.tsx`
- `ShareDialog.tsx`
- `EmailModal.tsx`
- `SharesPage.tsx`
- `SharesTable.tsx`
- `PublicViewerPage.tsx`
- `PasswordUnlockForm.tsx`

## Routes

| Path | Component |
|------|-----------|
| `/settings/shares` | `SharesPage` |
| `/s/:slug` | `PublicViewerPage` (no auth required) |

## API calls

| Action | Method | Path |
|--------|--------|------|
| Create share | POST | `/api/cloud/shares` |
| List shares | GET | `/api/cloud/shares` |
| Update share | PATCH | `/api/cloud/shares/:id` |
| Revoke | POST | `/api/cloud/shares/:id/revoke` |
| Delete | DELETE | `/api/cloud/shares/:id` |
| Download PDF | GET | `/api/cloud/shares/:id/pdf` |
| Send email | POST | `/api/cloud/shares/:id/email` |
| Public view | GET | `/public/shares/:slug` |
| Unlock | POST | `/public/shares/:slug/unlock` |

## Out of scope

- QR code for public link
- Embed iframe code
- Analytics per share (beyond view_count)
