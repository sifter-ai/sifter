---
title: "Filter discard: documents that don't match extraction conditions are discarded and reported"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-16T00:00:00.000Z"
---

## Summary

When a user writes extraction instructions that include matching conditions (e.g., "extract data only from invoices"), documents that don't satisfy those conditions are now **discarded** rather than stored as low-confidence results. The discard is surfaced to the user in the document detail view, along with the reason returned by the LLM.

The LLM infrastructure is already in place: `sift_agent.extract()` returns `matches_filter: bool` and `filter_reason: str`. This CR wires those signals into the processing pipeline, the status model, and the frontend.

---

## 1. Motivation

Currently, `matches_filter` and `filter_reason` returned by the LLM are silently ignored. A contract uploaded to a sift configured for invoices gets stored as a SiftResult with low confidence but no explanation. Users see results that don't belong and have no way to distinguish "extracted with low quality" from "wrong document type".

---

## 2. Data model — `DocumentSiftStatus`

### 2a. New status value

Add `DISCARDED` to `DocumentSiftStatusEnum` in `code/server/sifter/models/document.py`:

```python
class DocumentSiftStatusEnum(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    ERROR = "error"
    DISCARDED = "discarded"   # ← new
```

### 2b. New field `filter_reason`

Add an optional field to `DocumentSiftStatus`:

```python
filter_reason: Optional[str] = None
```

This field is populated when `status == DISCARDED` and carries the LLM's explanation (e.g., "Document is a service contract, not an invoice").

No migration needed — MongoDB is schemaless; existing documents simply lack the field and it defaults to `None`.

---

## 3. Service layer — `SiftService`

File: `code/server/sifter/services/sift_service.py`

### 3a. `process_single_document()` — folder/worker path

After calling `sift_agent.extract()`, check `result.matches_filter` before inserting a `SiftResult`:

```python
if not result.matches_filter:
    raise DocumentDiscardedError(reason=result.filter_reason)

# existing: store result, update schema, update counts
```

`DocumentDiscardedError` is a lightweight exception class defined in `sift_service.py` (or a shared `exceptions.py`):

```python
class DocumentDiscardedError(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason
```

### 3b. `process_documents()` — legacy direct-upload path

Same pattern: after `sift_agent.extract()`, skip `insert_result` and log the discard if `not result.matches_filter`. Do not count discarded documents in the error tally. Increment a `discarded` counter for the final log line.

---

## 4. Worker — `document_processor.py`

File: `code/server/sifter/services/document_processor.py`

In the `worker()` try/except block, add a specific handler for `DocumentDiscardedError` **before** the generic `Exception` handler:

```python
from .sift_service import DocumentDiscardedError

try:
    ...
    result = await ext_svc.process_single_document(...)
    await doc_svc.update_sift_status(
        document_id, sift_id, DocumentSiftStatusEnum.DONE, sift_record_id=result.id
    )
    ...
    await _dispatch_webhook(db, "sift.document.processed", {...}, sift_id)

except DocumentDiscardedError as e:
    await doc_svc.update_sift_status(
        document_id, sift_id, DocumentSiftStatusEnum.DISCARDED, filter_reason=e.reason
    )
    await db[COLLECTION].update_one(
        {"_id": task_doc["_id"]},
        {"$set": {"status": "done", "completed_at": datetime.now(timezone.utc)}},
    )
    logger.info("document_discarded", document_id=document_id, sift_id=sift_id, reason=e.reason)
    await _dispatch_webhook(
        db=db,
        event="sift.document.discarded",
        payload={"document_id": document_id, "sift_id": sift_id, "reason": e.reason},
        sift_id=sift_id,
    )

except Exception as e:
    ...  # existing error handling unchanged
```

Note: the processing queue task is marked `done` (not `error`) for discarded documents — the task completed successfully, the document was just out of scope.

---

## 5. Document service — `update_sift_status()`

File: `code/server/sifter/services/document_service.py`

Add `filter_reason: Optional[str] = None` to the `update_sift_status()` signature and include it in the `$set` payload when present:

```python
async def update_sift_status(
    self,
    document_id: str,
    sift_id: str,
    status: DocumentSiftStatusEnum,
    sift_record_id: Optional[str] = None,
    error_message: Optional[str] = None,
    filter_reason: Optional[str] = None,   # ← new
) -> None:
```

---

## 6. Webhook event

New event type: `sift.document.discarded`

Payload:
```json
{
  "document_id": "...",
  "sift_id": "...",
  "reason": "Document is a service contract, not an invoice"
}
```

No schema changes needed — webhooks are already schemaless (arbitrary `payload` dict).

---

## 7. Frontend — types (`api/types.ts`)

```typescript
// DocumentSiftStatus status values
type DocumentSiftStatusValue = "pending" | "processing" | "done" | "error" | "discarded";

interface DocumentSiftStatus {
  // ... existing fields
  filter_reason?: string;   // ← new
}
```

---

## 8. Frontend — `DocumentDetailPage.tsx`

File: `code/frontend/src/pages/DocumentDetailPage.tsx`

### 8a. `statusVariant()` — add discarded

```typescript
case "discarded": return "secondary";
```

### 8b. `statusLabel()` — add discarded

```typescript
case "discarded": return "Discarded";
```

### 8c. Show filter reason

Below the existing error block, add a discard block:

```tsx
{s.status === "discarded" && (
  <Alert className="py-2">
    <AlertDescription className="text-xs">
      {s.filter_reason
        ? `Discarded: ${s.filter_reason}`
        : "This document did not match the extraction filter."}
    </AlertDescription>
  </Alert>
)}
```

### 8d. Polling — include discarded in "settled" statuses

The `refetchInterval` already stops when no statuses are `processing` or `pending`. `discarded` is already handled correctly because it is neither — no change needed.

### 8e. Reprocess button — enable for discarded

In the `disabled` condition for the Reprocess button:

```tsx
disabled={reprocessMutation.isPending || s.status === "processing" || s.status === "pending"}
```

`discarded` is not in the disabled list, so the button is already enabled for discarded documents. No change needed.

---

## 9. SDD docs

If `.sdd/` documents reference `DocumentSiftStatus` or its status values, update them to include `discarded` and `filter_reason`.

---

## Files to modify

### Backend (`code/server/`)

| File | Change |
|------|--------|
| `sifter/models/document.py` | Add `DISCARDED` to `DocumentSiftStatusEnum`; add `filter_reason: Optional[str] = None` to `DocumentSiftStatus` |
| `sifter/services/sift_service.py` | Define `DocumentDiscardedError`; in `process_single_document()` raise it when `not result.matches_filter`; in `process_documents()` skip insert and log discard |
| `sifter/services/document_processor.py` | Catch `DocumentDiscardedError`, set status DISCARDED, mark queue task done, dispatch `sift.document.discarded` webhook |
| `sifter/services/document_service.py` | Add `filter_reason` param to `update_sift_status()` |

### Frontend (`code/frontend/`)

| File | Change |
|------|--------|
| `src/api/types.ts` | Add `"discarded"` to status union; add `filter_reason?: string` to `DocumentSiftStatus` |
| `src/pages/DocumentDetailPage.tsx` | Handle `discarded` in `statusVariant`/`statusLabel`; show filter reason alert |

---

## 10. Edge cases

| Scenario | Behaviour |
|----------|-----------|
| User reprocesses a discarded document after updating instructions | Status resets to `pending`, document re-enters queue. If now matches, status becomes `done` with a SiftResult. |
| Instructions have no filter condition | LLM returns `matchesFilter: true` for all documents (per extraction prompt). No discards. |
| LLM returns `matchesFilter: false` with empty `filterReason` | Stored as discard with generic UI message: "This document did not match the extraction filter." |
| Legacy `process_documents()` path (direct sift upload) | Also skips insert when `not matches_filter`. No `DocumentSiftStatus` row exists in this path — discard is only logged. |
