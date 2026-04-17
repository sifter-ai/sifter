---
title: "Cloud: Audit Log Settings Page"
status: synced
cloud: true
---

# Audit Log — Frontend

Route: `/settings/audit`. Only rendered when `config.mode === "cloud"`.

## Page layout

- `FilterBar`
  - `ActionFilter` — dropdown: all | billing.* | sift.* | user.* | connector.* | api_key.*
  - `SincePicker` — date picker (ISO datetime)
  - `SearchInput` — client-side filter on actor_id / target_id
- `EventTable` columns: timestamp (relative, absolute on hover), actor, action chip, target, ip
- `LoadMoreBtn` — appends next page

## Filtering

`action` and `since` sent as query params. Client-side text search. Load more increments `since` to oldest visible event's `created_at`.

## Empty state

"No audit events found" with icon.

## Plan gate

Free plan: locked state — "Audit log is available on Pro and above" with upgrade link.

## Components

- `AuditEventRow.tsx`
- `ActionChip.tsx` — monospace badge, category colors: billing=blue, sift=green, user=amber, connector=purple

## API

`GET /api/cloud/audit?action=&since=&limit=100`
