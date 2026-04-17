---
title: "Cloud: Connectors settings page (Gmail + Google Drive)"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
cloud-cr: "CR-014, CR-016"
---

## Summary

Add a `/settings/connectors` page showing Gmail and Google Drive connectors. Users can connect accounts via OAuth, configure sync settings (label/folder), trigger manual syncs, and revoke connections. Requires cloud backend (`/api/cloud/connectors/gmail/*`, `/api/cloud/connectors/gdrive/*`).

## Motivation

The cloud connectors run background sync workers that pull attachments from Gmail and files from Google Drive into Sifter folders. The frontend needs to surface connection status, let users configure which label/folder to watch, and handle the OAuth redirect flow.

## Detailed Design

### Route

`/settings/connectors`

### Page layout

```
ConnectorsPage
├── ConnectorSection (Gmail)
│   ├── ConnectBtn      — GET /api/cloud/connectors/gmail/oauth-url → redirect
│   ├── ConnectionCard (per active connection)
│   │   ├── AccountEmail
│   │   ├── StatusBadge  — active | error | paused
│   │   ├── LabelSelect  — populated from GET /api/cloud/connectors/gmail/:id/labels
│   │   ├── FolderSelect — destination Sifter folder picker
│   │   ├── OptionsToggle — mark_as_read, include_pdf_only
│   │   ├── SyncBtn      — POST /api/cloud/connectors/gmail/:id/sync
│   │   └── RevokeBtn    — DELETE /api/cloud/connectors/gmail/:id
│   └── PlanNote         — "Gmail connector available on Pro+" if over limit
└── ConnectorSection (Google Drive)
    ├── ConnectBtn       — GET /api/cloud/connectors/gdrive/oauth-url → redirect
    └── ConnectionCard (per active connection)
        ├── AccountEmail
        ├── StatusBadge
        ├── FolderBrowser — tree from GET /api/cloud/connectors/gdrive/:id/browse
        ├── SifterFolderSelect
        ├── OptionsToggle — recursive
        ├── SyncBtn      — POST /api/cloud/connectors/gdrive/:id/sync
        └── RevokeBtn    — DELETE /api/cloud/connectors/gdrive/:id
```

### OAuth redirect handling

The OAuth callback URL (`SIFTER_CLOUD_GOOGLE_OAUTH_REDIRECT_URI`) points to `https://app.sifter.app/connectors/callback`. This route reads the `code` and `state` params from the URL and calls:
- Gmail: `POST /api/cloud/connectors/gmail/oauth-callback`
- Drive: `POST /api/cloud/connectors/gdrive/oauth-callback`

The `state` JWT contains `connector_type` so the frontend knows which endpoint to call.

### Folder browser (Drive)

Collapsible tree loaded lazily: clicking a folder node calls `GET /api/cloud/connectors/gdrive/:id/browse?parent_id=<id>`. Selected folder stored in state; "Confirm" triggers `POST /api/cloud/connectors/gdrive/:id/configure`.

### Status badges

| Status | Colour | Tooltip |
|--------|--------|---------|
| `active` | green | "Syncing normally" |
| `error` | red | `last_error` value |
| `paused` | amber | "Manual sync available" |

### Plan gate

Show a locked card with upgrade CTA if the org has reached `connector_gmail_max` or `connector_gdrive_max` for their plan.

## Components

- `ConnectorsPage.tsx`
- `ConnectorSection.tsx` — reusable section shell
- `GmailConnectionCard.tsx`
- `GDriveConnectionCard.tsx`
- `FolderBrowserTree.tsx`
- `ConnectorCallbackPage.tsx` — handles OAuth redirect

## API calls

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

## Out of scope

- Outlook / OneDrive connectors
- Sync history / error log UI
- Connector-level webhook notifications
