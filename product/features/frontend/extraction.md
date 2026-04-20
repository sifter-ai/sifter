---
title: "Frontend: Document Extraction (Sifts)"
status: changed
version: "1.3"
last-modified: "2026-04-20T00:00:00.000Z"
---

# Document Extraction — Frontend

## Pages

### Sifts List (`/`)

Layout top-to-bottom:

1. **Editorial header** — eyebrow (Workspace · Pipelines), greeting (`Hey, {firstName}` when logged in, else `Sifts`), tagline, and "New Sift" button (opens `SiftForm` dialog: name + instructions).
2. **Toolbar** — rendered only when at least one sift exists:
   - **Search input** — client-side filter across `name`, `instructions`, `description`, and parsed schema field names. Debounced at 120 ms. `×` button clears when non-empty.
   - **Sort dropdown** — `Recent activity` (default, `updated_at` desc) · `Alphabetical` (`name`) · `Most docs` (`processed_documents` desc) · `Newest` (`created_at` desc). Persisted in `localStorage` under key `sifts.sort`.
3. **Card grid** — responsive 1 / 2 / 3 columns; each card is a `SiftCard` (see anatomy below). Clicking anywhere on a card navigates to `/sifts/:id`.
4. **Load more** button when pagination has more pages.
5. **Empty state** — shown when zero sifts; "No sifts yet" + short explanation + "Create your first sift" button (opens `SiftForm`). Toolbar is hidden in this state.

The page **does not** render aggregate KPIs (no `Total sifts` / `Indexing now` / `Docs processed` / `Schema fields total` strip). Quota usage is surfaced in the sidebar, not here.

**SiftCard anatomy:**

- **Header row** — status dot · sift name · multi-record icon (if `multi_record`) · `updated_at` as a relative date (`Today` / `Yesterday` / `Nd ago` / `Nw ago` / absolute `Mon D`). A native `title` tooltip on the date shows the full local timestamp.
- **Instructions preview** — `instructions || description || "No description"`, single line, clamped.
- **Schema field pills** — up to 6 field names as monospace chips color-coded by type (`number` blue · `boolean` violet · `array` orange · `object` pink · default slate). If more than 6, a dashed `+N` overflow chip is appended. If `schema` is null, a single placeholder chip reads `schema inferred after first document`.
- **Error line** — only when `status === "error"`; red alert icon + the `error` message.
- **Footer** — shows the document count (`N doc` / `N docs` / `No documents yet`). While `status === "indexing"`, the count is replaced by a progress bar + `processed/total docs` in amber. The footer does **not** render a `N fields` label (the pills communicate that) and does **not** render a trailing status text like `Active` / `Indexing` / `Paused` (the status dot communicates that).

**Status dot** visuals: `active` green pulsing · `indexing` amber spinner · `error` red alert · `paused` grey pause · default muted check.

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
