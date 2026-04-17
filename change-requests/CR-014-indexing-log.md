---
title: "Indexing log: per-document processing history in the sift detail view"
status: applied
author: "bruno.fortunato@applica.guru"
created-at: "2026-04-16T09:52:21.202Z"
---

# CR-014: Indexing Log

## Summary

Users need to inspect the processing outcome of every document indexed by a sift — including
successes, errors, and discards — without having to navigate to the folder browser.
This CR adds a new **Documents** tab to the Sift Detail page that shows a live table of all
documents associated with the sift, their status, timestamps, and error/discard reasons, with
a link to the document detail page.

---

## 1. Motivation

Currently, per-document processing status is only visible in `DocumentDetailPage` (reached via the
folder browser). There is no way to see, from a sift's perspective, which documents were
processed, which failed, and which were discarded. This makes debugging indexing problems slow
and forces the user to cross-reference two separate sections of the UI.

The `document_sift_statuses` collection already tracks per-document outcomes; this CR exposes
that data via a dedicated API endpoint and surfaces it in the UI.

---

## 2. New API endpoint — `GET /api/sifts/{id}/documents`

**File:** `code/server/sifter/api/sifts.py`

Returns all documents associated with the sift, joined with their `DocumentSiftStatus`.

### Response schema

```json
{
  "items": [
    {
      "document_id": "abc123",
      "filename": "invoice-2024-01.pdf",
      "folder_id": "folder456",
      "size_bytes": 204800,
      "uploaded_at": "2026-04-16T10:00:00Z",
      "status": "done",
      "started_at": "2026-04-16T10:00:05Z",
      "completed_at": "2026-04-16T10:00:08Z",
      "error_message": null,
      "filter_reason": null,
      "sift_record_id": "rec789"
    }
  ],
  "total": 42
}
```

`status` values: `pending` | `processing` | `done` | `error` | `discarded`

### Implementation

Query `document_sift_statuses` for `{"sift_id": sift_id}`, then for each status row fetch the
corresponding document from the `documents` collection via `document_id`. Return joined rows
sorted by `uploaded_at` descending. Support `?limit=50&offset=0` pagination.

```python
@router.get("/{sift_id}/documents")
async def list_sift_documents(
    sift_id: str,
    limit: int = 50,
    offset: int = 0,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    ...
```

---

## 3. Frontend — new "Documents" tab in `SiftDetailPage`

**File:** `code/frontend/src/pages/SiftDetailPage.tsx`

Add a `Documents` tab alongside `Records`, `Query`, and `Chat`.

### Tab trigger

```tsx
<TabsTrigger value="documents">
  Documents {extraction.total_documents > 0 && `(${extraction.total_documents})`}
</TabsTrigger>
```

### Table columns

| Column | Source |
|--------|--------|
| Filename | `filename` — clickable link to `/documents/{document_id}` |
| Status | `status` — rendered as a `StatusBadge` |
| Completed | `completed_at` formatted as local date/time, or `—` |
| Error / Reason | `error_message` or `filter_reason` — shown as small muted text below status if present |

Sort: most recently uploaded first (server-side).

### Polling

The Documents tab should poll at the same interval as the sift status when `status === "indexing"`.
Use `refetchInterval: isIndexing(extraction.status) ? 3000 : false`.

### Hook

Add `useSiftDocuments(siftId, options?)` to `useExtractions.ts`:

```typescript
export const useSiftDocuments = (siftId: string, options?: { refetchInterval?: number | false }) =>
  useQuery({
    queryKey: ["sift-documents", siftId],
    queryFn: () => fetchSiftDocuments(siftId),
    refetchInterval: options?.refetchInterval,
    enabled: !!siftId,
  });
```

Add `fetchSiftDocuments(siftId)` to `api/extractions.ts`.

---

## 4. Frontend type

**File:** `code/frontend/src/api/types.ts`

```typescript
export interface SiftDocument {
  document_id: string;
  filename: string;
  folder_id: string;
  size_bytes: number;
  uploaded_at: string;
  status: "pending" | "processing" | "done" | "error" | "discarded";
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  filter_reason: string | null;
  sift_record_id: string | null;
}
```

---

## 5. Files to modify

| File | Change |
|------|--------|
| `code/server/sifter/api/sifts.py` | Add `GET /{sift_id}/documents` endpoint |
| `code/frontend/src/api/types.ts` | Add `SiftDocument` interface |
| `code/frontend/src/api/extractions.ts` | Add `fetchSiftDocuments()` |
| `code/frontend/src/hooks/useExtractions.ts` | Add `useSiftDocuments()` hook |
| `code/frontend/src/pages/SiftDetailPage.tsx` | Add Documents tab with table and polling |

---

## 6. Edge cases

| Scenario | Behaviour |
|----------|-----------|
| Document deleted after processing | Status row still exists; filename lookup returns null — show `(deleted)` as filename |
| Sift has no documents yet | Empty state: "No documents indexed yet." |
| Document is discarded (CR-013) | Status shows `discarded` badge; `filter_reason` shown as reason text |
| Many documents (>50) | Paginated; show total count in tab label |
