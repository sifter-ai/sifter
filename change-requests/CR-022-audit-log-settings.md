---
title: "Cloud: Audit Log settings page"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
cloud-cr: "CR-018"
---

## Summary

Add `/settings/audit` page to the React frontend. Displays a filterable, paginated table of audit events for the authenticated org. Only rendered when `config.mode === "cloud"`.

## Motivation

Businesses on Pro+ plans need visibility into who did what in their org — who invited users, who deleted sifts, billing changes, connector configurations, etc. The cloud backend exposes `GET /api/cloud/audit?action=&since=&limit=`.

## Detailed Design

### Page layout

```
AuditLogPage
├── FilterBar
│   ├── ActionFilter    — dropdown: all | billing.* | sift.* | user.* | connector.* | api_key.*
│   ├── SincePicker     — date picker (ISO datetime)
│   └── SearchInput     — filters displayed rows client-side by actor_id or target_id
├── EventTable
│   ├── timestamp       — relative (e.g. "2 hours ago") with absolute on hover
│   ├── actor           — actor_type + actor_id (user email when available)
│   ├── action          — monospace chip
│   ├── target          — target_type + target_id
│   └── ip              — truncated, full on hover
└── LoadMoreBtn         — appends next page (limit=100 each fetch)
```

### Filtering

- `action` and `since` are sent as query params to `GET /api/cloud/audit`.
- Client-side text search on `actor_id` and `target_id` (no extra API call).
- Load more increments `since` to the oldest visible event's `created_at`.

### Empty state

Show "No audit events found" with an icon when the list is empty.

### Plan gate

If the org is on Free plan, show a locked state: _"Audit log is available on Pro and above"_ with an upgrade link.

## Components

- `AuditEventRow.tsx` — single table row
- `ActionChip.tsx` — monospace badge with category-based colour (billing=blue, sift=green, user=amber, connector=purple)

## API calls

| Action | Method | Path |
|--------|--------|------|
| Load events | GET | `/api/cloud/audit?action=&since=&limit=100` |

## Out of scope

- Export to CSV
- Webhook/SIEM integration
- Per-user audit trail
