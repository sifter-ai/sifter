---
title: "Frontend: Named Aggregations"
status: synced
---

# Named Aggregations — Frontend

The aggregations panel lives in the **Query tab** of the Sift Detail page (`/sifts/:id`), above the ad-hoc query panel.

## Named Aggregations List

Each row shows:
- Aggregation name
- Status badge: spinner for `generating`, checkmark for `ready`, error badge for `error`
- Last ran timestamp (if ever executed)
- Action buttons: Run, Regenerate, Delete

**"New Aggregation" button** opens a dialog:
- Name field
- Natural language query textarea
- Submit → calls `POST /api/aggregations` with `sift_id`

## Status Polling

While any aggregation in the list has `status: generating`, the panel polls `GET /api/aggregations?sift_id=<id>` every 2 seconds. Polling stops when all are `ready` or `error`.

## Run Aggregation

"Run" button → calls `GET /api/aggregations/{id}/result` → results displayed in a table below the list row (inline expansion) or in a modal.

The result always reflects current data (fresh execution each time).

## Regenerate

"Regenerate" → calls `POST /api/aggregations/{id}/regenerate` → status returns to `generating`, polling resumes.

## User Flow

1. User clicks "New Aggregation", enters name + query
2. Row appears immediately with `generating` spinner
3. When `ready`, "Run" button activates
4. User clicks "Run" — results expand inline
5. User can save multiple aggregations for repeated use (e.g. "Revenue by month", "Top clients", "Error rate by supplier")
