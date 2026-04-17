---
title: "Document detail page missing folder breadcrumb and filter_reason in API response"
status: resolved
author: "bruno.fortunato@applica.guru"
created-at: "2026-04-16T12:30:00.000Z"
---

## Description

Two bugs in the document detail page:

### BUG 1: `filter_reason` missing from `GET /api/documents/{id}` response

`code/server/sifter/api/documents.py` — the `get_document` endpoint serializes `DocumentSiftStatus`
without including `filter_reason`. This field was added to the model in CR-013 but was not added
to this serialization. As a result, the "Discarded" alert in `DocumentDetailPage` never shows
the discard reason even when present.

**Fix:** add `"filter_reason": s.filter_reason` to the sift_statuses dict in `get_document`.

### BUG 2: No folder breadcrumb in DocumentDetailPage

`code/frontend/src/pages/DocumentDetailPage.tsx` — the page shows only a generic "Back" button
(browser history). There is no indication of which folder the document belongs to. When navigating
directly to `/documents/{id}` (e.g. from the sift Documents tab), the user has no way to know
the document's folder or navigate to it.

The API already returns `folder_id`. A folder name breadcrumb linking to `/folders?folder={id}`
should be shown below the filename.

**Fix:** fetch the folder name using `GET /api/folders/{folder_id}` and render a breadcrumb.

## Affected files

- `code/server/sifter/api/documents.py` — missing `filter_reason` in serialization
- `code/frontend/src/pages/DocumentDetailPage.tsx` — missing folder breadcrumb
