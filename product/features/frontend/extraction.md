---
title: "Frontend: Document Extraction (Sifts)"
status: synced
version: "1.2"
last-modified: "2026-04-16T12:00:00.000Z"
---

# Document Extraction — Frontend

## Pages

### Sifts List (`/`)

- Table of sifts: name, status badge, document count, created date
- "New Sift" button opens a dialog: name + instructions textarea
- Status badges: `active` (green), `indexing` (yellow spinner), `paused` (grey), `error` (red)
- Click a row to navigate to Sift Detail

### Sift Detail (`/sifts/:id`)

Header bar:
- Sift name (inline editable)
- Status badge
- Instructions text (collapsed/expanded toggle)
- Schema display (auto-inferred)
- **Folder:** name of the sift's default folder, shown as a clickable link that navigates to `/folders?folder={default_folder_id}`; hidden if `default_folder_id` is null
- Progress bar (`processed_documents / total_documents`) while indexing
- Action buttons: Reindex, Reset (error state), Delete

Four tabs:

#### Documents tab

- Table of all documents associated with this sift, sorted by upload date descending
- Columns: **Filename** (clickable link to `/documents/{document_id}`), **Status** (badge), **Completed** (timestamp or `—`), **Reason** (error or discard reason, shown in muted text)
- Status badges: `pending`, `processing`, `done`, `error`, `discarded`
- For `discarded` documents: `filter_reason` shown as reason text
- Empty state when no documents indexed yet
- Polls every 3 s while sift is indexing

#### Records tab

- Table with one column per extracted field (schema-driven)
- Sortable columns
- "Export CSV" button → calls `GET /api/sifts/{id}/records/csv`, triggers download
- Pagination for large record sets
- Empty state when no documents have been processed yet

#### Query tab

See `frontend/query.md` for the query panel and `frontend/aggregations.md` for the named aggregations panel.

#### Chat tab

See `frontend/chat.md` for the scoped chat interface.

## Polling

While a sift has `status: indexing`, the page polls `GET /api/sifts/{id}` every 3 seconds to update the status badge and progress bar. Polling stops when status becomes `active` or `error`.

The Documents tab and Records tab also poll at 3 s while indexing.
