---
title: "Cloud: Connectors Settings Page"
status: synced
cloud: true
---

# Connectors — Frontend

Route: `/settings/connectors`. Only rendered when `config.mode === "cloud"`.

## Page layout

Two sections: Gmail and Google Drive.

### Gmail section

- `ConnectBtn` — GET oauth-url → redirect
- Per connection: AccountEmail, StatusBadge (active=green/error=red/paused=amber), LabelSelect (from labels API), FolderSelect (Sifter folder picker), OptionsToggle (mark_as_read, include_pdf_only), SyncBtn, RevokeBtn
- Plan note if over connector_gmail_max

### Google Drive section

- Same structure, plus `FolderBrowserTree` — lazily loaded collapsible tree; clicking node calls browse API with parent_id

## OAuth callback

Route `/connectors/callback` → `ConnectorCallbackPage.tsx`. Reads `code` and `state` from URL. `state` JWT contains `connector_type` → calls appropriate callback endpoint.

## Components

- `ConnectorsPage.tsx`
- `ConnectorSection.tsx`
- `GmailConnectionCard.tsx`
- `GDriveConnectionCard.tsx`
- `FolderBrowserTree.tsx`
- `ConnectorCallbackPage.tsx`

## API

| Action | Method | Path |
|--------|--------|------|
| Gmail OAuth URL | GET | `/api/cloud/connectors/gmail/oauth-url` |
| Gmail callback | POST | `/api/cloud/connectors/gmail/oauth-callback` |
| Gmail labels | GET | `/api/cloud/connectors/gmail/:id/labels` |
| Gmail configure | POST | `/api/cloud/connectors/gmail/:id/configure` |
| Gmail list | GET | `/api/cloud/connectors/gmail` |
| Gmail sync | POST | `/api/cloud/connectors/gmail/:id/sync` |
| Gmail revoke | DELETE | `/api/cloud/connectors/gmail/:id` |
| Drive OAuth URL | GET | `/api/cloud/connectors/gdrive/oauth-url` |
| Drive callback | POST | `/api/cloud/connectors/gdrive/oauth-callback` |
| Drive browse | GET | `/api/cloud/connectors/gdrive/:id/browse` |
| Drive configure | POST | `/api/cloud/connectors/gdrive/:id/configure` |
| Drive list | GET | `/api/cloud/connectors/gdrive` |
| Drive sync | POST | `/api/cloud/connectors/gdrive/:id/sync` |
| Drive revoke | DELETE | `/api/cloud/connectors/gdrive/:id` |
