---
title: "Cloud: Advanced Chat UI with Typed Blocks"
status: synced
cloud: true
---

# Advanced Chat UI — Frontend

Cloud-only. Routes: `/chat` (cross-sift), `/sifts/:id/chat` (single-sift).

## Layout

```
ChatPage
├── ChatSidebar — NewChatBtn, SiftPicker (multi-select), SessionList (title + date)
└── ChatThread
    ├── SuggestionChips — 3-5 from POST /api/cloud/chat/suggestions
    ├── MessageList
    │   ├── UserBubble — plain text
    │   └── AssistantMessage — BlockRenderer + ActionBar
    └── ChatInput — textarea; Enter=send, Shift+Enter=newline
```

## Block types (BlockRenderer)

| type | Component | Library |
|------|-----------|---------|
| `text` | `TextBlock` | plain markdown |
| `big_number` | `BigNumberBlock` | stat card |
| `table` | `TableBlock` | TanStack Table (sortable) |
| `chart` | `ChartBlock` | Recharts (bar/line/pie) |
| `records_list` | `RecordsListBlock` | paginated, links to record detail |

## Inline actions (ActionBar)

- `save_as_aggregation` → PUT /api/sifts/:id/aggregations
- `export_csv_subset` → download CSV from block data
- `email` → EmailModal (from CR-028)
- `share` → ShareDialog (from CR-028)

## Streaming

No streaming (v1). Show typing indicator while request in-flight.

## Plan gate

Free: full-page paywall "Advanced Chat is available on Pro and above".

## Components

- `ChatPage.tsx` (cloud version, different from OSS ChatInterface)
- `ChatSidebar.tsx`
- `ChatThread.tsx`
- `BlockRenderer.tsx`
- `TextBlock.tsx`, `BigNumberBlock.tsx`, `TableBlock.tsx`, `ChartBlock.tsx`, `RecordsListBlock.tsx`
- `ActionBar.tsx`
- `SuggestionChips.tsx`

## Dependencies

- `recharts` — charts
- `@tanstack/react-table` — sortable table
- `react-markdown` — text blocks

## API

| Action | Method | Path |
|--------|--------|------|
| List sessions | GET | `/api/cloud/chat/sessions` |
| Create session | POST | `/api/cloud/chat/sessions` |
| Get session | GET | `/api/cloud/chat/sessions/:id` |
| Delete session | DELETE | `/api/cloud/chat/sessions/:id` |
| Send message | POST | `/api/cloud/chat/sessions/:id/messages` |
| Suggestions | POST | `/api/cloud/chat/suggestions` |
| Run action | POST | `/api/cloud/chat/messages/:id/actions/:action` |
