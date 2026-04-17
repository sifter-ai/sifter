---
title: "CR-016: Folder Management — Deletion & Subfolders"
status: applied
---

# CR-016: Folder Management — Deletion & Subfolders

## Motivation

Folders currently cannot be deleted, and the folder hierarchy is flat (no nesting). Users need to:
1. Remove folders that are no longer needed (with safe cascade handling).
2. Organise documents in a tree structure (e.g. `Invoices / 2025 / Q1`).

---

## 1. Folder Deletion

### Backend

**Model** — no change required.

**Service** (`FolderService`): add `delete(folder_id: str) -> bool`
- Delete all `DocumentSiftStatus` records for all documents in the folder.
- Delete all `ProcessingTask` records for all documents in the folder.
- Delete all `Document` records in the folder (and their storage files via the storage backend).
- Delete all `FolderExtractor` links for this folder.
- Delete the `Folder` document itself.
- Return `True` if the folder existed, `False` otherwise.

**API**: add `DELETE /api/folders/{id}`
- Returns `204 No Content` on success.
- Returns `404` if folder not found.

### Frontend

**FolderBrowserPage**:
- Add a **Delete** button in the folder toolbar (trash icon, `variant="ghost"`, `text-destructive`).
- Visible only when a folder is selected (`folderId` is set).
- Confirm dialog: *"Delete folder '{name}' and all its documents? This cannot be undone."*
- On success: navigate to `/folders` (root).
- Show loading state on button while mutation is pending.

---

## 2. Subfolders

### Data Model

**Folder** — add field:
```python
"parent_id": str | None   # ObjectId string; null = root folder
```

All existing folders default to `parent_id = null` (root). No migration needed (MongoDB schemaless; missing field reads as `None`).

**Indexes**: add index on `parent_id`.

### Backend

**`FolderService`**:
- `create(name, description, parent_id=None)` — accept `parent_id`.
- `list_children(parent_id: str | None) -> list[Folder]` — list folders with that parent (null = root).
- `get_path(folder_id: str) -> list[Folder]` — walk `parent_id` chain from root to folder (for breadcrumbs). Max depth 10.
- `delete(folder_id)` — cascade-delete all children recursively before deleting the folder itself.

**API**:
- `POST /api/folders` — accept optional `parent_id` in request body.
- `GET /api/folders` — add optional `?parent_id=` query param. If omitted, returns all folders (flat list, backward-compatible). If `parent_id=root`, returns root folders (`parent_id == null`). If `parent_id={id}`, returns direct children.
- `GET /api/folders/{id}/path` — returns ordered list of ancestor folders from root to (but not including) the current folder, for breadcrumb rendering.

**Folder response model** — add `parent_id: str | None` field.

### Frontend

**API client** (`api/folders.ts`):
- `fetchFolders(parentId?: string | null)` — pass `?parent_id=` when provided.
- `createFolder(name, description, parentId?: string)` — pass `parent_id` in body.
- `fetchFolderPath(folderId: string) -> Folder[]` — new, hits `/api/folders/{id}/path`.
- `deleteFolder(folderId: string)` — new, hits `DELETE /api/folders/{id}`.

**Types** (`api/types.ts`):
- `Folder.parent_id: string | null`

**FolderBrowserPage** — significant changes:
- Left sidebar shows a **tree** instead of a flat list.
  - Root folders are shown at top level.
  - Folders with children show a `ChevronRight` expand toggle.
  - Expanded folders reveal children indented by `pl-4`.
  - Active folder is highlighted with left-border accent (as today).
  - "New Folder" at root; "New Subfolder" action inside a folder (creates with `parent_id = current folder`).
- **Toolbar breadcrumb**: instead of just the folder name, show clickable path segments: `My Documents / Invoices / 2025` navigating to each ancestor.
- **Subfolder section** in right panel: when a folder is selected, show direct subfolders as cards above the document list (click to navigate into them).

**Folder sidebar tree component**: new `FolderTree` component, recursive, handles expand/collapse state locally.

---

## Acceptance Criteria

- [ ] `DELETE /api/folders/{id}` deletes the folder, all documents, their sift statuses, processing tasks, and storage files.
- [ ] Deleting a folder with subfolders recursively deletes all descendants first.
- [ ] `GET /api/folders?parent_id=root` returns only root-level folders.
- [ ] `GET /api/folders?parent_id={id}` returns direct children of that folder.
- [ ] `POST /api/folders` with `parent_id` creates a subfolder.
- [ ] `GET /api/folders/{id}/path` returns the ancestor chain for breadcrumbs.
- [ ] Frontend sidebar renders a tree with expand/collapse.
- [ ] Frontend toolbar shows breadcrumb path.
- [ ] Delete button in toolbar removes folder and navigates to parent (or root).
- [ ] Existing folders (no `parent_id`) behave as before — backward compatible.

---

## Agent Notes

- Keep `GET /api/folders` without `?parent_id` returning ALL folders (flat) for backward compatibility with existing API clients and the SDK.
- Deletion must remove storage files via `storage.delete(storage_path)` for each document — not just the DB records.
- Depth limit: enforce max nesting depth of 10 in the `create` endpoint to prevent runaway hierarchies.
- The `FolderTree` component must handle the case where folders have not yet loaded children (lazy-load children on expand).
