---
title: "Frontend: Records Table"
status: synced
version: "1.1"
last-modified: "2026-04-21T00:00:00.000Z"
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
- **Fields:** one row per extracted field — label (formatted from snake_case), full value (no truncation), type-aware rendering (string, number, boolean, array, pretty-printed JSON for objects), plus the per-field trust view (see below)
- **Metadata section:** record ID (copyable), document ID (link → `/documents/:id`), created_at, record_index

Closing: × button, Escape key, or clicking outside.

## Per-field trust view

Each field row in the detail modal exposes the source evidence alongside the extracted value, enabling a "scan & trust" verification pattern without opening the original document.

**Layout per field:**
```
LABEL         VALUE                              [CONF BADGE]
              ┌ snippet ────────────────────────────────────┐
              │ "…Total amount: 1500 EUR…"                  │
              │ page 1                              (PDF only)│
              └─────────────────────────────────────────────┘
```

**Confidence badge** (right-aligned with the value):
- `confidence ≥ 0.85` → green · `High`
- `0.60 ≤ confidence < 0.85` → amber · `Medium`
- `confidence < 0.60` OR `inferred: true` → red triangle · `Low`
- citation entry absent → muted info icon · `Unverified` (tooltip: "Source not located in document")

**Snippet block** (below value, collapsible after 120 characters):
- Rendered when citation has `source_text`.
- Monospace, muted border, small type, word-wrap.
- Footer: `page N` when `page` is present (PDF); no footer for other formats.
- For non-PDF formats the snippet is shown but there is no `page N` footer and no `inferred` indicator.

**Missing citation**: only the `Unverified` badge, no snippet block.

**Reindex banner**: when the citations map is entirely empty (pre-CR records, or LLM returned no spans), a one-line banner appears at the top of the modal: "Reindex this sift to populate citations" with an action button that calls `POST /api/sifts/{id}/reindex`. The banner is dismissed once the record is reindexed.

The records table (non-detail view) is unchanged — confidence stays a document-level column there.

## Empty State

When no records exist: centered icon with "No records yet" message.
When search returns zero results: "No records match your search" with a clear button.
