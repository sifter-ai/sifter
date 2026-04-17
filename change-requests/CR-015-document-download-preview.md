---
title: "Document download and preview in DocumentDetailPage"
status: applied
author: "bruno.fortunato@applica.guru"
created-at: "2026-04-16T12:30:00.000Z"
---

# CR-015: Document Download and Preview

## Summary

Users need to download the original document and see an inline preview (PDF/image) directly
from the Document Detail page, without having to navigate elsewhere.

---

## 1. Backend — `GET /api/documents/{id}/download`

**File:** `code/server/sifter/api/documents.py`

Streams the file bytes from storage using the document's `storage_path`.

```python
@router.get("/{document_id}/download")
async def download_document(
    document_id: str,
    _: Principal = Depends(get_current_principal),
    db=Depends(get_db),
):
    svc = DocumentService(db)
    doc = await svc.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    storage = get_storage_backend()
    data = await storage.load(doc.storage_path)

    return Response(
        content=data,
        media_type=doc.content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{doc.original_filename}"'},
    )
```

---

## 2. Frontend — Download button

**File:** `code/frontend/src/pages/DocumentDetailPage.tsx`

Add a Download button in the header area. On click, call `GET /api/documents/{id}/download`
with auth header, create a blob URL, trigger download via `<a>` element.

Add `downloadDocument(documentId)` to `api/folders.ts`.

---

## 3. Frontend — Inline preview

**File:** `code/frontend/src/pages/DocumentDetailPage.tsx`

After the File Info card, add a preview section:

- **PDF** (`content_type === "application/pdf"`): render inside an `<iframe>` with a blob URL src
- **Images** (`content_type.startsWith("image/")`): render as `<img>` with object-fit contain
- **Other types**: show a "Preview not available" placeholder

Fetch blob on component mount (or on-demand via "Show Preview" toggle to avoid loading large files
automatically). Use `useState` + `useEffect` to load blob URL from the download endpoint.

---

## 4. Files to modify

| File | Change |
|------|--------|
| `code/server/sifter/api/documents.py` | Add `GET /{id}/download` endpoint |
| `code/frontend/src/api/folders.ts` | Add `downloadDocument()` |
| `code/frontend/src/pages/DocumentDetailPage.tsx` | Download button + preview section |
