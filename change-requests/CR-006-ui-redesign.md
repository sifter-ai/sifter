---
title: "UI Redesign: left sidebar layout + pageindex-style document browser"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-13T00:00:00.000Z"
---

## Summary

Replace the current top-navbar layout with a persistent left sidebar (à la mem0/pageindex). Redesign the Folders + Documents view into a unified document browser. Keep all existing functionality — this is a layout and visual restructuring, not a feature change.

## Motivation

Reference screenshots in `product/features/screenshots/`:
- **mem0-1, mem0-2** — general design language: left sidebar navigation, clean white panels, subtle borders, settings as sectioned forms, API keys as a simple table
- **pageindex-1, pageindex-2** — document browser pattern: folders listed in sidebar, documents as rows with inline action buttons, upload modal with folder selector, search bar

---

## 1. Global Layout — Left Sidebar

Replace the current sticky top `<NavBar>` with a fixed-width left sidebar. The main content area scrolls independently.

### Sidebar structure (top to bottom)

```
┌──────────────────┐
│  ⬡ Sifter        │  ← logo, links to /
├──────────────────┤
│  Sifts           │  ← icon + label, NavLink to /
│  Folders         │  ← icon + label, NavLink to /folders
│  Chat            │  ← icon + label, NavLink to /chat
│                  │
│  [spacer flex-1] │
├──────────────────┤
│  Settings        │  ← icon + label, NavLink to /settings
│  user@email.com  │  ← small muted text
│  Logout          │  ← ghost button with icon
└──────────────────┘
```

- Width: `w-56` (224px), fixed, `h-screen sticky top-0`
- Background: `bg-background border-r`
- Active nav item: `bg-muted font-medium`, inactive: `text-muted-foreground hover:bg-muted/50`
- Icons: Lucide `FileText` (Sifts), `Folder` (Folders), `MessageCircle` (Chat), `Settings`, `LogOut`
- On mobile (`< md`): sidebar collapses to icon-only (`w-14`), labels hidden

### App shell

```
<div class="flex h-screen overflow-hidden">
  <Sidebar />                          ← fixed left column
  <main class="flex-1 overflow-y-auto">
    <Routes />                         ← page content
  </main>
</div>
```

Remove the `container max-w-5xl` wrapper from the app shell — each page manages its own max-width.

---

## 2. Sifts Page (`/`)

Keep the existing table layout but update the visual wrapper to match the new shell (no outer top-nav padding needed). Add a toolbar row above the table.

### Layout

```
┌─ page content ──────────────────────────────────────────┐
│  Sifts                           [+ New Sift]           │
│  Process documents and extract structured data with AI  │
├─────────────────────────────────────────────────────────┤
│  table: Name | Status | Documents | Created | (actions) │
│  row → click → /sifts/:id                              │
└─────────────────────────────────────────────────────────┘
```

- Add an **actions column** (rightmost): small ghost "Open" button (ChevronRight icon)
- Empty state: centered icon + text + "New Sift" button (existing behaviour)

---

## 3. Folders + Documents — Unified Browser (`/folders` and `/folders/:id`)

Replace the current two-page layout (FoldersPage + FolderDetailPage) with a **single unified browser** that mirrors the pageindex document manager.

### New route structure

| Route | Behaviour |
|-------|-----------|
| `/folders` | Show all documents across all folders (or select a folder in sidebar to filter) |
| `/folders/:id` | Same browser, pre-filtered to that folder |

### Browser layout (two-column inside the main area)

```
┌─ left panel (w-48 border-r) ──┬─ right panel (flex-1) ──────────────────┐
│  Folders                       │  My Documents           [Upload] [+ Folder] [Search…] │
│  ─────────────                 │  ─────────────────────────────────────────────────────│
│  • All Documents               │  □  📁 Massimo Galante          folder   3 docs  Apr 13│
│  ▸ Massimo Galante (3)         │  □  📄 invoice_2024.pdf   Galante  2 pg  Today  ● done  [Chat] [⋯]│
│  ▸ Contratti (12)              │  □  📄 contract_a.pdf     Galante  8 pg  Apr 12  ● done  [Chat] [⋯]│
│                                │  □  📄 report_q1.pdf      Galante  5 pg  Apr 10  ⟳ proc  [Chat] [⋯]│
│  [+ New Folder]                │                                                       │
└────────────────────────────────┴───────────────────────────────────────────────────────┘
```

**Left panel:**
- "All Documents" item at the top (NavLink with no folder filter)
- One item per folder: folder icon + name + `(doc count)` in muted text
- Clicking a folder filters the right panel
- Active folder: `bg-muted font-medium`
- "New Folder" button at the bottom (opens the existing dialog)

**Right panel toolbar:**
- Title: `"My Documents"` (or folder name if one is selected)
- `[Upload]` button → opens upload modal (see §3.1)
- `[+ New Folder]` button (same as left panel button — only visible when "All Documents" is selected or always visible)
- Search input `[Search documents…]` — client-side filter on filename

**Document rows:**
- Checkbox (for future bulk actions — render but keep non-functional for now)
- Icon: 📁 for folders, 📄 for files (Lucide `Folder` / `FileText`)
- Filename (truncated)
- Folder name (muted, small) — only shown in "All Documents" view
- Size or page count (muted, small) — use `formatBytes()`
- Uploaded date (muted, small) — `toLocaleDateString()`
- Per-sift status badge(es) — coloured dot + sift name abbreviated (existing `StatusBadge`)
- `[Chat]` ghost button → navigate to `/chat?document=:id` (or just `/chat` for now)
- `[⋯]` more menu (DropdownMenu) with: "Open" → `/documents/:id`, "Reprocess", "Delete" (future)

**Folder rows** (shown in "All Documents" mode, above individual files):
- Folder icon, folder name (bold), `– N documents`, date created
- Click → filters to that folder (updates URL to `/folders/:id`)

### 3.1 Upload Modal

Trigger: `[Upload]` button in toolbar.

```
┌─ Upload Documents ─────────────────────────────────────┐
│  Upload to: Root Directory  [Change ▾]                  │
│  ┌─────────────────────────────────────────────────┐   │
│  │                                                 │   │
│  │        ↑  Drag & drop PDF, PNG, JPG here        │   │
│  │                                                 │   │
│  │           [Select Documents]                    │   │
│  └─────────────────────────────────────────────────┘   │
│  Max file size: 50 MB per file                          │
└────────────────────────────────────────────────────────┘
```

- "Change" → inline folder selector (dropdown of existing folders)
- Drag-and-drop area: `border-2 border-dashed rounded-lg` with upload icon and text
- After selecting files: list them with name + size, then [Upload] confirm button
- On upload success: refresh document list, close modal

---

## 4. Document Detail Page (`/documents/:id`)

Keep the existing content (metadata + per-sift extraction results + reprocess button). Update visual to match the new shell (no top-nav padding offset needed). No structural changes.

---

## 5. Sift Detail Page (`/sifts/:id`)

Keep existing tabs (Records, Query, Chat) and content. Only layout adjustment: remove the `container mx-auto max-w-4xl` and let the page fill the available main area width with `px-6 py-8 max-w-5xl mx-auto`.

---

## 6. Settings Page (`/settings`)

Redesign as a **two-column settings panel** (like mem0 Settings):

```
┌─ settings left nav (w-44 border-r) ─┬─ settings content (flex-1) ──────────┐
│  Profile                             │  [section title]                      │
│  API Keys                            │  [form or table]                      │
│  Webhooks                            │                                       │
│  Organization                        │                                       │
└──────────────────────────────────────┴───────────────────────────────────────┘
```

**Left nav:** simple list of section links, active = `font-medium text-foreground`, inactive = `text-muted-foreground hover:text-foreground`

**Profile section:**
- Username (read-only for now, just display)
- Email (read-only)
- Member since (date)

**API Keys section** (like mem0-2):
- Warning banner: `"API keys are only shown once — if you didn't save yours, generate a new one."`
- Table: Key Name | API Key (masked as `sk-...••••`) | Created At | (delete icon button)
- `[Create API Key]` button top-right → existing dialog

**Webhooks section:**
- Table: URL | Events | Created At | (delete button)
- `[Register Webhook]` button top-right → existing dialog

**Organization section:**
- Placeholder: "Organization settings coming soon"

---

## 7. Chat Page (`/chat`)

Keep existing functionality. Layout: full-height chat that fills `main` area. The optional sift selector stays as a top bar within the chat page.

---

## Implementation Notes

- All shadcn/ui components already available — no new deps needed
- Sidebar should live in `App.tsx` replacing `NavBar`
- The unified Folders browser can be a single component `FolderBrowserPage` that handles both `/folders` and `/folders/:id` routes (read `:id` from params, default to `null` = all)
- Merge `FoldersPage.tsx` and `FolderDetailPage.tsx` into `FolderBrowserPage.tsx`
- Mobile breakpoint: sidebar collapses to icon-only at `< md` (768px)
- Upload modal should be a new `UploadModal` component reused in FolderBrowserPage
- DropdownMenu for row actions: use shadcn `DropdownMenu` (already installed via Radix)
