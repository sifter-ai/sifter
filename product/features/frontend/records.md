---
title: "Frontend: Records Table"
status: synced
---

# Records Table — Frontend

The records table lives in the **Records tab** of the Sift Detail page (`/sifts/:id`).

## Search

A text input above the table filters rows client-side. Matches against filename, document_type, and any value in `extracted_data` (case-insensitive substring). A badge shows "X of Y records" when a filter is active.

## Column Sorting

Clicking a column header sorts by that column asc → desc → unsorted. An arrow indicator (↑/↓) shows the active sort column and direction. Sortable: Document, Type, Conf, and all extracted field columns.

## Record Detail Modal

Clicking any row opens a modal dialog (`RecordDetailModal`) showing:
- **Header:** filename, document_type badge, confidence bar
- **Fields:** one row per extracted field — label (formatted from snake_case), full value (no truncation), type-aware rendering (string, number, boolean, array, pretty-printed JSON for objects)
- **Metadata section:** record ID (copyable), document ID (link → `/documents/:id`), created_at, record_index

Closing: × button, Escape key, or clicking outside.

## Empty State

When no records exist: centered icon with "No records yet" message.
When search returns zero results: "No records match your search" with a clear button.
