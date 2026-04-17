---
title: "Cloud: Live Dashboard editor + viewer"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
cloud-cr: "CR-013"
---

## Summary

Add a dashboard editor and viewer to the frontend. Users can create dashboards from sifts, add widgets (big_number, table, chart), arrange them with drag-and-drop, and see them auto-refresh via SSE. Requires cloud backend (`/api/cloud/dashboards/*`, `/api/cloud/widgets/*`).

## Motivation

Business users need a persistent, shareable view of aggregated data that updates automatically as new documents arrive. The backend handles pipeline execution and SSE push; the frontend renders the grid and handles live updates.

## Detailed Design

### Routes

- `/dashboards` — list all org dashboards
- `/dashboards/:id` — view + edit dashboard
- `/dashboards/new` — create dialog (name + sift picker)

### Dashboard list page

Grid of cards: name, sift count, last updated, "Open" CTA, kebab menu (rename, delete, set as default).

### Dashboard viewer/editor

```
DashboardPage
├── DashboardHeader    — name, sift badges, EditToggle, ShareBtn
├── WidgetGrid         — react-grid-layout; edit mode enables drag + resize
│   └── WidgetCard (per widget)
│       ├── WidgetTitle
│       ├── WidgetContent  — renders snapshot via BlockRenderer (chart/table/big_number)
│       ├── RefreshBtn     — POST /api/cloud/widgets/:id/refresh
│       └── DrillDownBtn   — visible on chart bars/table rows; calls GET /api/cloud/widgets/:id/drill-down
└── AddWidgetPanel     — slide-out; pick sift, kind, pipeline builder (JSON editor + validate)
```

### Auto-refresh via SSE

On mount, open `GET /api/cloud/dashboards/:id/stream` (EventSource). On `widget_updated` event, update the matching widget's snapshot in state without full re-render.

### Widget creation flow

1. User opens "Add Widget" panel.
2. Selects sift + widget kind (big_number | table | chart).
3. Enters aggregation pipeline (JSON editor with syntax highlight).
4. Clicks "Preview" → `POST /api/cloud/widgets/:id/refresh` returns snapshot.
5. Saves → `POST /api/cloud/widgets`.

### Drill-down

When user clicks a bar/row, call `GET /api/cloud/widgets/:id/drill-down?bucket_key=...`. Response is `{record_ids: [...]}`. Open a slide-over showing records via `POST /api/sifts/:sift_id/records/batch` (OSS endpoint).

### Plan gate

If `plan.dashboard_autorefresh === false` (Free), render dashboards as static (no SSE). Show an upgrade prompt on the SSE section.

## Components

- `DashboardListPage.tsx`
- `DashboardPage.tsx`
- `WidgetCard.tsx`
- `AddWidgetPanel.tsx`
- `DrillDownSheet.tsx`
- `PipelineEditor.tsx` — JSON textarea + validate button

## Dependencies

- `react-grid-layout` — drag-and-drop grid
- `recharts` — chart rendering (shared with CR-023)
- `@tanstack/react-table`

## API calls

| Action | Method | Path |
|--------|--------|------|
| List dashboards | GET | `/api/cloud/dashboards` |
| Create dashboard | POST | `/api/cloud/dashboards` |
| Get dashboard | GET | `/api/cloud/dashboards/:id` |
| Update dashboard | PATCH | `/api/cloud/dashboards/:id` |
| Delete dashboard | DELETE | `/api/cloud/dashboards/:id` |
| SSE stream | GET | `/api/cloud/dashboards/:id/stream` |
| Create widget | POST | `/api/cloud/widgets` |
| Update widget | PATCH | `/api/cloud/widgets/:id` |
| Delete widget | DELETE | `/api/cloud/widgets/:id` |
| Refresh widget | POST | `/api/cloud/widgets/:id/refresh` |
| Drill-down | GET | `/api/cloud/widgets/:id/drill-down` |
| Batch records | POST | `/api/sifts/:id/records/batch` |

## Out of scope

- Dashboard templates
- Widget comments/annotations
- PDF export of full dashboard (covered by CR-028 Share)
