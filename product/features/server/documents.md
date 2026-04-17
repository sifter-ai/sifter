---
title: "Server: Folders & Document Management"
status: synced
---

# Folders & Document Management — Server

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/folders` | List folders |
| POST | `/api/folders` | Create folder |
| GET | `/api/folders/{folder_id}` | Folder detail + linked sifts |
| PATCH | `/api/folders/{folder_id}` | Update folder (name, description) |
| DELETE | `/api/folders/{folder_id}` | Delete folder and all documents |
| GET | `/api/folders/{folder_id}/extractors` | List linked sifts |
| POST | `/api/folders/{folder_id}/extractors` | Link sift: `{ "sift_id": str }` |
| DELETE | `/api/folders/{folder_id}/extractors/{sift_id}` | Unlink sift |
| GET | `/api/folders/{folder_id}/documents` | List documents with per-sift status |
| POST | `/api/folders/{folder_id}/documents` | Upload document (multipart); triggers processing |
| GET | `/api/documents/{document_id}` | Document detail + per-sift statuses |
| DELETE | `/api/documents/{document_id}` | Delete document + all extraction results |
| POST | `/api/documents/{document_id}/reprocess` | Re-trigger extraction; optional `{ "sift_id": str }` |

## Data Model

**Folder**: named container for documents. Has name, description, document_count.

**Document**: uploaded file. Has filename, content type, size, upload timestamp, uploaded_by. Stored via the configured `StorageBackend`.

**FolderSift link**: many-to-many between folders and sifts. When a document is uploaded to a folder, it is automatically enqueued for processing by every linked sift.

**DocumentSiftStatus**: per `(document_id, sift_id)` pair. Statuses: `pending` → `processing` → `done` | `error`.

## Background Processing Queue

- MongoDB-backed polling queue
- `SIFTER_MAX_WORKERS` (default: 4) concurrent worker coroutines
- Each worker: claims task atomically, reads file, runs sift agent, saves result, updates status record, fires webhook
- Stale `processing` tasks (claimed_at > 10 min ago) are automatically reclaimed for retry
- Max retries per task: configurable via `SIFTER_MAX_ATTEMPTS` (default: 3)

## Storage Backend

Abstracted behind `StorageBackend` protocol. Selected by `SIFTER_STORAGE_BACKEND`:

| Value | Class | Notes |
|-------|-------|-------|
| `filesystem` (default) | `FilesystemBackend` | Saves to `SIFTER_STORAGE_PATH/{org_id}/{folder_id}/` |
| `s3` | `S3Backend` | `aioboto3`; requires `SIFTER_S3_*` vars |
| `gcs` | `GCSBackend` | `google-cloud-storage`; requires `SIFTER_GCS_*` vars |

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `POST /api/folders/{id}/documents` | 30 requests / minute |
