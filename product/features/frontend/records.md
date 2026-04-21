---
title: "Frontend: Records Table"
status: synced
version: "1.2"
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

## Uncertain Filter

A filter control above the table (right side, near the search input) surfaces records that need human review.

**Toggle:** `☐ Show uncertain only`. When enabled, calls `GET /records?has_uncertain_fields=true` (replacing the current unfiltered fetch). When disabled, restores the unfiltered list. State is local — not persisted in the URL or user preferences.

**Count badge:** On tab mount, a separate `GET /records/count?has_uncertain_fields=true` call populates an amber badge (`bg-amber-50 text-amber-700`) next to the toggle showing "N uncertain". The badge is hidden when the count is 0.

**Row-level indicator:** In the `Conf` column, an amber warning dot (⚠) appears next to the confidence bar when `record.has_uncertain_fields === true`. Tooltip on hover: "One or more fields have low confidence — click to review".

No change to the record detail modal — per-field trust view is already handled there.

## Correction Flow

The `RecordDetailModal` supports an **edit mode** for correcting wrong extracted values.

### Edit mode toggle

A pencil icon button ("Edit record") appears in the modal header. Clicking it switches each scalar field row from read-only to editable. `array` and `object` fields stay read-only in v1 — no edit control is shown for them.

### Field inputs per type

| Field type | Input |
|------------|-------|
| `string` | `<input type="text">` |
| `number` / `integer` | `<input type="number">` |
| `boolean` | `<select>` with true / false options |
| `date` | `<input type="date">` (ISO yyyy-mm-dd) |
| `datetime` | `<input type="datetime-local">` |
| `array` / `object` | read-only, no edit control |

Dirty fields (value changed from current) show a light amber background on the input row.

### Save dialog

Clicking "Save corrections" opens a compact overlay **before** the PATCH is sent. The dialog shows the list of changed field names and two scope options:

```
Apply corrections to:
  ◉ Only this record
  ○ This record + all future matching values in this sift
      (Creates a correction rule for each changed field)

[Cancel]  [Save]
```

Both options always write the local override. The second option additionally creates a `CorrectionRule` for each changed field. After save, the modal returns to read-only mode.

### `edited` pill

Corrected fields show a small `edited` pill (dark, muted) **replacing** the confidence badge — visually distinct from the LLM confidence colours. Hovering the pill shows a tooltip:

> "Corrected by \<user\> on \<date\> · [Reset to original]"

**Reset to original**: clicking "Reset to original" removes the field from `user_overrides` and `corrected_fields` (sends `PATCH` with `value: null, scope: "reset"`). The LLM-extracted value and original confidence badge are restored.

### Correction rules tab

A new **Correction rules** tab is added inside the Sift Detail page (alongside Records, Documents, Dashboard, Chat). It is only shown when the sift has at least one rule.

Table columns: Field, Match value → Replace value, Created by, Created at, Applied count, Actions.

**Actions:**
- **Backfill** — calls `POST /correction-rules/{id}/backfill`; shows a toast "Applied to N records".
- **Delete** — soft-deletes the rule (`active: false`). Existing record overrides from that rule are untouched.

## Empty State

When no records exist: centered icon with "No records yet" message.
When search returns zero results: "No records match your search" with a clear button.
