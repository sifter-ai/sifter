---
title: "Cloud: Mail-to-Upload folder settings panel"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
cloud-cr: "CR-015"
---

## Summary

Add an "Inbound Email" panel to the folder settings page. Shows the deterministic inbound email address, lets users enable/disable the feature, configure allowed senders, and view recent inbound events. Requires cloud backend (`/api/cloud/folders/:folder_id/inbound/*`).

## Motivation

The mail-to-upload feature assigns each Sifter folder a unique inbound address (`inbox-{folder_id}+{token}@ingest.sifter.app`). Business users need a UI to discover their address, control who can send to it, and debug inbound activity.

## Detailed Design

### Location

Added as a new tab ("Inbound") in the existing folder settings modal/page (wherever folder settings currently live).

### Panel layout

```
InboundEmailPanel
├── EnableToggle        — POST .../inbound/enable or .../inbound/disable
├── InboundAddress      — display-only, copy-to-clipboard button
│   └── "Send PDF attachments to: inbox-abc123@ingest.sifter.app"
├── AllowedSenders      — tag input; supports wildcard patterns (*@acme.com)
│   └── "Leave empty to allow org members only"
├── Options
│   ├── allow_pdf_only  — toggle (default: on)
│   └── max_attachment_size_mb — number input (default: 10)
├── SaveBtn             — PATCH .../inbound
└── RecentEvents        — last 10 events from GET .../inbound/events
    └── EventRow: from_email, received_at, accepted (✓/✗), rejection_reason
```

### Loading state

Show skeleton while `GET /api/cloud/folders/:folder_id/inbound` loads. If 404, assume not yet enabled; show the toggle in off position.

### Copy button

Click copies the inbound address to clipboard. Show a "Copied!" tooltip for 2 seconds.

### Plan gate

If `plan.inbound_email === false` (Free), render the panel disabled with an upgrade prompt.

## Components

- `InboundEmailPanel.tsx` — added to folder settings
- `InboundEventRow.tsx`
- `TagInput.tsx` — reusable if not already present

## API calls

| Action | Method | Path |
|--------|--------|------|
| Load policy | GET | `/api/cloud/folders/:id/inbound` |
| Enable | POST | `/api/cloud/folders/:id/inbound/enable` |
| Disable | POST | `/api/cloud/folders/:id/inbound/disable` |
| Update policy | PATCH | `/api/cloud/folders/:id/inbound` |
| Load events | GET | `/api/cloud/folders/:id/inbound/events` |

## Out of scope

- Webhook outbound for each received email
- Bulk event export
- Custom inbound domain per org
