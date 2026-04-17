---
title: "Cloud: Shared Result — Share button, dialog, settings, public viewer"
status: synced
cloud: true
---

# Shared Results — Frontend

## Share button placement

`ShareBtn` (icon + "Share") added in: aggregation result card toolbar, chat ActionBar (CR-023), DashboardHeader (CR-024). Cloud-only.

## ShareDialog

- TitleField (auto-filled from source)
- AccessSelect: private_link | org_only | password; PasswordField shown when access=password
- ExpiryPicker — optional date
- CreateBtn → POST /api/cloud/shares
- After creation: LinkCopyField `{base_url}/s/{slug}`, SendEmailBtn, DownloadPDFBtn

## EmailModal

RecipientsField (tag input), SubjectField (default: "Shared: {title}"), MessageField, SendBtn → POST /api/cloud/shares/:id/email

## Shares settings page (`/settings/shares`)

Table: title, kind chip (aggregation|chat_message|dashboard_view), access badge, view_count, expires_at, actions (copy link, revoke, delete). Empty state.

## Public viewer (`/s/:slug`) — no auth required

- If password-protected and not unlocked: PasswordForm → POST /public/shares/:slug/unlock → store view JWT in sessionStorage
- If unlocked: ShareHeader + BlockRenderer (same components as chat CR-023)
- If revoked/expired: "This link has expired or been revoked"

## Plan gate

Disable ShareBtn with tooltip when shares_max reached. Disable DownloadPDFBtn / SendEmailBtn with upgrade prompt based on plan flags.

## Components

- `ShareBtn.tsx`
- `ShareDialog.tsx`
- `EmailModal.tsx`
- `SharesPage.tsx`
- `SharesTable.tsx`
- `PublicViewerPage.tsx`
- `PasswordUnlockForm.tsx`

## Routes

| Path | Component | Auth |
|------|-----------|------|
| `/settings/shares` | `SharesPage` | required |
| `/s/:slug` | `PublicViewerPage` | none |

## API

| Action | Method | Path |
|--------|--------|------|
| Create | POST | `/api/cloud/shares` |
| List | GET | `/api/cloud/shares` |
| Update | PATCH | `/api/cloud/shares/:id` |
| Revoke | POST | `/api/cloud/shares/:id/revoke` |
| Delete | DELETE | `/api/cloud/shares/:id` |
| PDF | GET | `/api/cloud/shares/:id/pdf` |
| Email | POST | `/api/cloud/shares/:id/email` |
| Public view | GET | `/public/shares/:slug` |
| Unlock | POST | `/public/shares/:slug/unlock` |
