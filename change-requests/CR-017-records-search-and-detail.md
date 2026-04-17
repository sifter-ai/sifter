---
title: "Records: search/sort and record detail view"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-16T00:00:00.000Z"
---

## Summary

Add a general-purpose search box and column sorting to the records table, and allow clicking a record row to open a detail panel showing all extracted fields with full values.

## Motivation

The records table currently shows all rows with no way to filter or sort. As the number of records grows this becomes hard to navigate. Users also need to inspect individual records fully — cell values are truncated in the table and there is no way to see the raw extraction data.

## Detailed Design

### Search

A text input above the table filters records client-side (all records are already loaded). The search matches against:
- `filename`
- `document_type`
- Any value in `extracted_data` (stringified)

Matching is case-insensitive substring. A badge shows the filtered count ("X of Y records").

### Column Sorting

Clicking any column header toggles asc → desc → unsorted for that column. Sort key + direction stored in local state. Sortable columns:
- Document (filename)
- Type (document_type)
- Conf (confidence)
- Any extracted_data field

### Record Detail Drawer

Clicking a row opens a right-side sheet/drawer (`RecordDetailDrawer`) showing:
- **Header:** filename, document_type badge, confidence bar
- **Fields table:** one row per extracted field — field name (formatted), value (full, not truncated), proper rendering per type (string, number, boolean, array, object as pretty JSON)
- **Metadata:** record ID (monospace, copyable), document ID (link to document detail), created_at, record_index (if multi-record)

Closing the drawer returns to the table. No navigation change — drawer is a local state overlay.

## Acceptance Criteria

1. Search input filters rows in real time
2. Empty search shows all records
3. Clicking a column header sorts by that column; clicking again reverses; clicking a third time resets
4. Active sort column shows an arrow indicator (↑/↓)
5. Clicking a row opens the detail drawer
6. The drawer shows all fields with full (non-truncated) values
7. Closing the drawer (×, Escape, click outside) returns to normal table state
8. Record count badge updates when filtering is active

## Out of Scope

- Server-side filtering/pagination (can be added later when record counts are large)
- Editing field values in the drawer
- Exporting a single record
