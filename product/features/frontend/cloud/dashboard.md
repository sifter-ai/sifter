---
title: "Cloud: Live Dashboard Editor + Viewer"
status: synced
cloud: true
---

# Live Dashboard — Frontend

Cloud-only. Routes: `/dashboards` (list), `/dashboards/:id` (view/edit), `/dashboards/new` (create dialog).

## Dashboard list page

Grid of cards: name, sift count, last updated, "Open" CTA, kebab (rename, delete, set as default).

## Dashboard viewer/editor

```
DashboardPage
├── DashboardHeader — name, sift badges, EditToggle, ShareBtn (CR-028)
├── WidgetGrid — react-grid-layout; edit mode enables drag + resize
│   └── WidgetCard
│       ├── WidgetTitle, WidgetContent (BlockRenderer snapshot)
│       ├── RefreshBtn — POST /api/cloud/widgets/:id/refresh
│       └── DrillDownBtn — opens DrillDownSheet
└── AddWidgetPanel — slide-out; sift picker, kind, pipeline JSON editor + validate
```

## Auto-refresh via SSE

`GET /api/cloud/dashboards/:id/stream` (EventSource). On `widget_updated` event: update matching widget snapshot in state.

## Widget creation

1. Pick sift + kind (big_number | table | chart)
2. Enter pipeline JSON (editor + Preview button)
3. Preview → POST .../refresh returns snapshot
4. Save → POST /api/cloud/widgets

## Drill-down

Click bar/row → GET /api/cloud/widgets/:id/drill-down?bucket_key= → {record_ids} → DrillDownSheet shows records.

## Plan gate

Free: dashboards static (no SSE). Show upgrade prompt on SSE section.

## Components

- `DashboardListPage.tsx`
- `DashboardPage.tsx`
- `WidgetCard.tsx`
- `AddWidgetPanel.tsx`
- `DrillDownSheet.tsx`
- `PipelineEditor.tsx`

## Dependencies

- `react-grid-layout` — drag-and-drop grid
- `recharts` — charts (shared with CR-023)
- `@tanstack/react-table`

## API

| Action | Method | Path |
|--------|--------|------|
| List dashboards | GET | `/api/cloud/dashboards` |
| Create | POST | `/api/cloud/dashboards` |
| Get | GET | `/api/cloud/dashboards/:id` |
| Update | PATCH | `/api/cloud/dashboards/:id` |
| Delete | DELETE | `/api/cloud/dashboards/:id` |
| SSE stream | GET | `/api/cloud/dashboards/:id/stream` |
| Create widget | POST | `/api/cloud/widgets` |
| Update widget | PATCH | `/api/cloud/widgets/:id` |
| Delete widget | DELETE | `/api/cloud/widgets/:id` |
| Refresh widget | POST | `/api/cloud/widgets/:id/refresh` |
| Drill-down | GET | `/api/cloud/widgets/:id/drill-down` |
