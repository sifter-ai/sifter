---
title: "Advanced Document Management: Folders, Multi-Extractor Pipelines"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-13T00:00:00.000Z"
---

## Summary

Replace the flat extraction model with a proper document management hierarchy: Organizations → Folders → Documents. A Folder can be connected to one or more Extractors (Extractions). When a document is uploaded to a folder, it is automatically processed by all linked extractors. Documents have metadata, status tracking, and can be re-processed.

## Changes to product/

### product/features/documents.md (NEW)

Create this file describing:

**Folders** — A Folder is a named container for documents within an organization. Folders have: `id`, `name`, `description`, `organization_id`, `created_at`. A folder can be linked to multiple extractors. Documents uploaded to a folder are automatically processed by all linked extractors.

**Documents** — A Document represents a file stored in Sifter. Fields: `id`, `filename`, `original_filename`, `content_type`, `size_bytes`, `folder_id`, `organization_id`, `uploaded_by`, `uploaded_at`, `storage_path`. Documents are stored as binary blobs in MongoDB GridFS or on the filesystem (configurable).

**Document processing status** — Each `(document_id, extraction_id)` pair has a `DocumentExtractionStatus` record: `status` (pending/processing/done/error), `started_at`, `completed_at`, `error_message`.

**Folder-Extractor links** — `FolderExtractor`: `folder_id`, `extraction_id`, `created_at`. When a new document arrives in a folder, Sifter automatically enqueues it for each linked extractor.

**Frontend pages**:
- Folders list page — create/delete folders, view folder contents
- Folder detail page — document list with status per extractor, upload new documents, manage linked extractors
- Document detail page — view extracted data per extractor, re-trigger extraction

### product/features/extraction.md (CHANGED)

Update to note: Extractions (extractors) are now independent of document storage. They define *what* to extract. Documents are uploaded to folders, and folders are linked to extractors. An extractor can be linked to multiple folders.

Remove: direct file upload on the extraction endpoint (file upload moves to folder/document API).

Keep: extraction schema, instructions, field definitions, and result records. Results are still stored as `ExtractionRecord` with `document_id`, `extraction_id`, `extracted_data`.

## Changes to system/

### system/entities.md (CHANGED)

Add entities:
- `Folder`: `id`, `name`, `description`, `organization_id`, `created_at`, `document_count`
- `Document`: `id`, `filename`, `original_filename`, `content_type`, `size_bytes`, `folder_id`, `organization_id`, `uploaded_by`, `uploaded_at`, `storage_path`
- `FolderExtractor`: `folder_id`, `extraction_id`, `created_at` (many-to-many link)
- `DocumentExtractionStatus`: `document_id`, `extraction_id`, `status` (pending/processing/done/error), `started_at`, `completed_at`, `error_message`, `extraction_record_id`

Update `ExtractionRecord`: keep `document_id`, `extraction_id`, `extracted_data`, `confidence`, `created_at`. Remove `file_path` (replaced by `document_id` reference).

### system/api.md (CHANGED)

Add folder endpoints:
- `GET /api/folders` — list folders for current org
- `POST /api/folders` — create folder
- `GET /api/folders/{folder_id}` — folder detail with document list
- `DELETE /api/folders/{folder_id}` — delete folder and all documents

Add folder-extractor link endpoints:
- `GET /api/folders/{folder_id}/extractors` — list linked extractors
- `POST /api/folders/{folder_id}/extractors` — link extractor to folder (`{"extraction_id": "..."}`)
- `DELETE /api/folders/{folder_id}/extractors/{extraction_id}` — unlink

Add document endpoints:
- `POST /api/folders/{folder_id}/documents` — upload document (multipart), triggers processing by all linked extractors
- `GET /api/folders/{folder_id}/documents` — list documents with per-extractor status
- `GET /api/documents/{document_id}` — document detail
- `DELETE /api/documents/{document_id}` — delete document and its extraction records
- `POST /api/documents/{document_id}/reprocess` — re-trigger extraction by all linked extractors (or specific `extraction_id` in body)

Update extraction endpoints: remove file upload from `POST /api/extractions/{id}/process`. The extraction endpoint now manages schema/instructions only; processing is triggered by document upload.

### system/architecture.md (CHANGED)

Add:
- **Document storage**: configurable between GridFS (MongoDB) and local filesystem. Config key `SIFTER_STORAGE_BACKEND` (`gridfs` or `filesystem`), `SIFTER_STORAGE_PATH` for filesystem mode.
- **Background processing**: document upload enqueues a processing task. Use an in-process async task queue (asyncio queue + worker). One worker per document-extractor pair runs concurrently (configurable `SIFTER_MAX_WORKERS`, default 4).
- **Processing flow**: `DocumentProcessor` service — given `(document_id, extraction_id)`, reads file, runs `FileProcessor` → `ExtractionAgent`, saves `ExtractionRecord`, updates `DocumentExtractionStatus`.

### system/frontend.md (CHANGED)

Add:
- Folder list and detail pages
- Document upload component (drag-and-drop + file picker, shows upload + processing progress)
- Per-document status badges showing processing state for each linked extractor
- "Link extractor" UI on folder detail page (select from existing extractors)
- Re-process button on document detail
