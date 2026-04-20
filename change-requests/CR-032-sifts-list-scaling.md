---
title: "Sifts list: remove KPI strip, add toolbar, tighten sift card"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-20T00:00:00.000Z"
---

## Summary

Redesign the Sifts list page (`/`) to scale from a handful of sifts to 50–100+. Remove the 4-card KPI strip (`StatsStrip`) at the top, replace it with a search + sort toolbar, and tighten each `SiftCard` by removing redundant labels and switching the header date from `created_at` (static) to `updated_at` (activity signal).

## Motivation

Sifts are the core abstraction of the product — "define once, run on every document." The Sifts list is a primary surface, used every session. Today it prioritizes aggregate KPIs over list navigation. Three concrete problems:

1. **The KPI strip does not scale.** `Total sifts`, `Indexing now`, `Docs processed`, `Schema fields total` are aggregates that either duplicate information already on-screen (total count is visible in the grid) or grow linearly without informing any decision (summing schema fields across sifts is a vanity metric). At 100 sifts they become pure decoration and steal the most valuable horizontal band on the page.

2. **No way to find a sift at scale.** No search, no sort. With 10+ sifts the user is already scrolling; at 50+ it's unusable.

3. **The card footer is redundant.** `3 docs · 4 fields · Active` — the `4 fields` count duplicates the field pills above it, and `Active` duplicates the status dot in the header. The card header uses `created_at` (one-shot info) instead of `updated_at` (ongoing activity signal), labeled only as a bare relative date ("Yesterday") which is ambiguous on a page where users scan for "which sifts are alive."

The page should be optimized for two jobs: **find a sift** and **see at a glance if it's healthy**. KPIs serve neither job.

## Detailed Design

### 1. Remove `StatsStrip`

Delete the `StatsStrip` component and its render site in `SiftsPage`. No replacement KPI. No aggregate counts.

Rationale: quota/usage information (the only aggregate a user genuinely wants at-a-glance) already lives in the sidebar as `0 / 500 docs` on Starter; duplicating it here adds no value.

### 2. New `SiftsToolbar`

Between the editorial header and the card grid, add a single-row toolbar:

- **Search input** (left, grows to fill): placeholder `Search sifts…`. Client-side filter against `name`, `instructions`, `description`, and parsed schema field names. Debounced at 120 ms. Cleared with an `×` button when non-empty.
- **Sort dropdown** (right): options `Recent activity` (default, by `updated_at` desc) · `Alphabetical` (by `name`) · `Most docs` (by `processed_documents` desc) · `Newest` (by `created_at` desc). Persist selection in `localStorage` under `sifts.sort`.

Toolbar is **hidden** when the list is empty (empty state renders as today).

### 3. `SiftCard` changes

**Header row:**
- Replace `formatDate(sift.created_at)` with `formatDate(sift.updated_at)`. Keep the same small monospace style.
- Add a native `title` attribute on that element showing the full ISO timestamp on hover: `title={new Date(sift.updated_at).toLocaleString()}`.

**Footer row:**
- **Remove** the trailing status label (`Active` / `Indexing` / `Error` / `Paused`). The status dot in the header already carries this signal; the label is redundant.
- **Remove** the `· N fields` item. The schema field pills above already communicate count + content.
- **Keep** the doc count / indexing progress bar exactly as today. That's the one vitality signal we have from existing API data.

**Error state:** unchanged (AlertCircle + error message when `status === "error"`).

### 4. Doc update

Update `product/features/frontend/extraction.md` → `Sifts List (/)` section to describe the new layout:

- Editorial header (unchanged)
- Toolbar: search + sort dropdown
- Card grid (1 / 2 / 3 cols responsive)
- Card: status dot · name · multi-record icon · `updated_at` (relative, tooltip with full ISO); instructions preview; schema field pills (up to 6 + overflow); footer with doc count or indexing progress
- Empty state (unchanged)
- No KPI strip

## Files Changed

- `code/frontend/src/pages/SiftsPage.tsx` — remove `StatsStrip`, render `<SiftsToolbar>`, apply client-side filter + sort to the flattened `sifts` array before rendering, update `SiftCard` header date source and footer
- `code/frontend/src/components/SiftsToolbar.tsx` — NEW
- `product/features/frontend/extraction.md` — rewrite `Sifts List (/)` section

## Acceptance Criteria

1. `/` no longer renders the 4-card KPI strip (`Total sifts`, `Indexing now`, `Docs processed`, `Schema fields total` / errors).
2. A toolbar with a search input and a sort dropdown sits between the header and the card grid when the list is non-empty.
3. Typing in the search input filters the cards client-side against name, instructions, description, and schema field names (debounced).
4. Sort dropdown offers `Recent activity` (default), `Alphabetical`, `Most docs`, `Newest`; changing it reorders the cards; the choice survives a reload (localStorage).
5. Each `SiftCard` footer shows only the doc count / indexing progress — no `N fields`, no trailing status label.
6. Each `SiftCard` header date reflects `updated_at` (not `created_at`); hovering the date reveals the full ISO timestamp as a native tooltip.
7. Empty state is unchanged (no toolbar rendered when there are zero sifts).
8. `npx tsc --noEmit` passes in `code/frontend`.

## Out of Scope

- **Server-side search / sort.** Current implementation uses infinite-scroll pagination; client-side filter operates on already-fetched pages. When a user has >N sifts the UX degrades gracefully (you only filter what's loaded). Moving filter + sort into `GET /api/sifts` query params is a separate, larger change.
- **Folder grouping view** (grouping cards by `default_folder_id`).
- **Card ↔ compact list view toggle.**
- **Richer vitality signals on the card** (`last_record_at`, `record_count`, `avg_confidence`). These require enriching the `Sift` response on the server; deferred to a follow-up CR if/when the existing `updated_at` signal proves insufficient.
- **Bulk actions** (archive, clone, export spec).
