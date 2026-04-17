---
title: "Cloud: Mail-to-Upload Folder Panel"
status: synced
cloud: true
---

# Mail-to-Upload — Frontend

Added as an "Inbound" tab in the folder settings page. Only rendered when `config.mode === "cloud"`.

## Panel layout

- `EnableToggle` — POST .../inbound/enable or .../inbound/disable
- `InboundAddress` — display-only email address with copy-to-clipboard button ("Copied!" tooltip 2s)
- `AllowedSenders` — tag input; supports wildcard patterns (*@acme.com); empty = org members only
- `Options` — allow_pdf_only toggle (default on), max_attachment_size_mb number input
- `SaveBtn` — PATCH .../inbound
- `RecentEvents` — last 10 events; columns: from_email, received_at, accepted (✓/✗), rejection_reason

## Loading state

Skeleton while loading. If 404: assume not enabled, show toggle in off position.

## Plan gate

Free plan: panel disabled with upgrade prompt.

## Components

- `InboundEmailPanel.tsx`
- `InboundEventRow.tsx`
- `TagInput.tsx` — reusable tag input

## API

| Action | Method | Path |
|--------|--------|------|
| Load policy | GET | `/api/cloud/folders/:id/inbound` |
| Enable | POST | `/api/cloud/folders/:id/inbound/enable` |
| Disable | POST | `/api/cloud/folders/:id/inbound/disable` |
| Update policy | PATCH | `/api/cloud/folders/:id/inbound` |
| Load events | GET | `/api/cloud/folders/:id/inbound/events` |
