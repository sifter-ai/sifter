---
title: "Frontend: Folders & Document Management"
status: synced
---

# Folders & Document Management — Frontend

## Pages

### Folder Browser (`/folders`)

Two-column layout:

**Left panel — folder list:**
- "All Documents" item (shows all docs across folders)
- One item per folder: icon, name, document count
- "New Folder" button at bottom — opens dialog with name + description fields
- Active folder highlighted

**Right panel:**
- Toolbar: page title, Upload button, search input
- When "All Documents" selected: shows all documents across all folders
- When a folder is selected:
  - **Linked Sifts section** (above document list): shows linked sifts with their status, Link/Unlink controls
  - **Document list**: rows with filename, size, upload date, per-sift status badges, Chat button, More menu

**Document row actions (More menu):**
- Open → `/documents/:id`
- Reprocess (re-triggers all sift extractions for this document)

**Upload modal:**
- Drag-and-drop area + file picker
- Folder selector (defaults to current folder)
- File list with sizes
- Confirm button — calls `POST /api/folders/{id}/documents` for each file

### Document Detail (`/documents/:id`)

- Header: filename, size, content type, uploaded by, uploaded at
- Per-sift results table:
  - Each row: sift name, status badge, completed timestamp, error message (if any), Reprocess button
  - Status badges: `pending`, `processing`, `done`, `error`
- Reprocess button → calls `POST /api/documents/{id}/reprocess`

## Status Badge Polling

Document detail and document list poll every 3 seconds while any `(document, sift)` pair has `status: pending` or `status: processing`. Polling stops when all are `done` or `error`.
