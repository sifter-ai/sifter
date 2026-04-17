---
title: "Sift default folder: direct sift upload creates and uses an automatic folder"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-16T00:00:00.000Z"
---

## Summary

Every sift has a **default folder** created automatically when the sift is created. Direct uploads to a sift (`POST /api/sifts/{id}/upload`) route files through this folder, going through the standard folder-document pipeline. The folder is visible in the folder browser like any other folder, and the sift detail panel shows a direct link to it.

The data model stays unchanged: documents always live in folders, sifts always extract from folders. Uploading to a sift is a shortcut that creates the folder automatically if it doesn't exist yet.

---

## 1. Motivation

The current `POST /api/sifts/{id}/upload` endpoint bypasses the folder system entirely:
- Files are saved to storage under `{sift_id}/` with no `Document` records created
- No `DocumentSiftStatus` is tracked
- Documents are invisible in the folder browser
- No automatic retry, no webhooks, no per-document status

At the same time, always requiring a folder selection before extracting is friction for users who want to get started quickly. The default folder solves both problems: uploads stay simple, and documents are always findable.

---

## 2. Data model — `Sift`

Add an optional field to the `Sift` model:

```python
default_folder_id: Optional[str] = None
```

This field is set at sift creation time and never changes (even if the sift is renamed). Pre-existing sifts will have `default_folder_id = None`; their folder will be created lazily on the first direct upload.

---

## 3. Backend — sift creation (`POST /api/sifts`)

After persisting the sift, in sequence:

1. Create a folder with the same name as the sift (no duplicate check — folder names are not unique):
   ```json
   { "name": "<sift.name>", "description": "", "document_count": 0 }
   ```
2. Link folder ↔ sift via `folder_extractors` (reuse `document_service.link_extractor(folder_id, sift_id)`)
3. Update the sift with `default_folder_id = folder_id`
4. The `POST /api/sifts` response already includes `default_folder_id` (added to the model)

---

## 4. Backend — sift upload (`POST /api/sifts/{id}/upload`)

Rewrite to route files through the standard folder pipeline:

1. Load the sift, read `default_folder_id`
2. If `default_folder_id` is None (pre-existing sift), create the folder lazily and update the `sifts` collection
3. For each uploaded file:
   - Save to storage under `{folder_id}/{filename}` (no longer `{sift_id}/{filename}`)
   - Create a `Document` record with `folder_id`, file metadata, and `storage_path`
   - Increment `folder.document_count`
   - Create a `DocumentSiftStatus(document_id, sift_id, status="pending")`
   - Add an entry to `processing_queue` for the worker
4. Response: `{ "uploaded": N, "files": [...], "folder_id": "..." }`

Files processed through this route gain all the benefits of the folder pipeline: automatic retry (max 3), webhooks (`sift.document.processed`, `sift.error`), per-document status tracking, concurrent processing via worker pool.

> **Note on storage paths:** legacy direct sift uploads (pre-CR) are stored under `{sift_id}/` and have no `Document` records. They cannot be migrated (no metadata exists). They will remain in blob storage but will not appear in any UI.

---

## 5. Backend — `GET /api/sifts/{id}`

No explicit change needed: `default_folder_id` added to the `Sift` model is returned automatically by the existing response.

---

## 6. Frontend — SiftDetailPage

In the "Sift Details" card (info section, above the Records/Query/Chat tabs), add a **Folder** row:

```
Folder:  [Folder name]  →  link to FolderBrowserPage with that folder selected
```

- If `sift.default_folder_id` is present: show folder name (fetch `GET /api/folders/{id}`) as a clickable link
- If absent (pre-existing sift, no upload yet): show nothing, or show "—"
- The link navigates to `/folders?folder={default_folder_id}` (verify existing FolderBrowserPage routing)

---

## 7. Frontend — `Sift` type in `api/types.ts`

```typescript
interface Sift {
  // ... existing fields
  default_folder_id?: string;
}
```

---

## 8. Edge cases

| Scenario | Behaviour |
|----------|-----------|
| Sift renamed | The folder keeps its original name. The link remains valid. |
| Sift deleted | The folder and its documents remain (standard folder behaviour). |
| Default folder manually deleted | `default_folder_id` points to a non-existent folder. On the next upload, create a new folder and update the field. |
| Documents uploaded via folder browser into the default folder | Identical behaviour to any other folder — processed by the sift normally. |
| Regular folder linked to the sift | Still possible. A sift can have N linked folders + 1 default folder. |

---

## Files to modify

### Backend (`code/server/`)

| File | Change |
|------|--------|
| `sifter/models/sift.py` | Add `default_folder_id: Optional[str] = None` |
| `sifter/api/sifts.py` | `POST /` → create folder + link + set default_folder_id; `POST /{id}/upload` → route through folder pipeline |
| `sifter/services/document_service.py` | No changes — reuse `save_document`, `link_extractor`, `enqueue` |

### Frontend (`code/frontend/`)

| File | Change |
|------|--------|
| `src/api/types.ts` | Add `default_folder_id?: string` to `Sift` |
| `src/pages/SiftDetailPage.tsx` | Show "Folder" row with link in the details card |
