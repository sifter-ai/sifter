---
title: "Cloud: Advanced Chat UI with typed blocks"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
cloud-cr: "CR-012"
---

## Summary

Add a chat interface to the Sifter frontend that renders typed response blocks (text, big_number, table, chart, records_list) and supports inline actions (save as aggregation, export CSV subset, email). Requires cloud backend (`/api/cloud/chat/*`).

## Motivation

The cloud backend orchestrates LLM-powered analysis sessions over one or more sifts, returning structured blocks instead of raw text. The frontend needs to render these blocks interactively so business users can explore data without writing pipelines.

## Detailed Design

### Routes

- `/sifts/:id/chat` — single-sift chat (sift_ids = [id])
- `/chat` — cross-sift chat; user selects sifts from a picker

### Session list sidebar

```
ChatSidebar
├── NewChatBtn
├── SiftPicker         — multi-select combobox (for cross-sift)
└── SessionList        — title + relative date; click to load
```

### Message thread

```
ChatThread
├── SuggestionChips    — 3–5 proactive suggestions from POST /api/cloud/chat/suggestions
├── MessageList
│   ├── UserBubble     — plain text
│   └── AssistantMessage
│       ├── BlockRenderer  — renders each block by type
│       └── ActionBar      — inline action buttons
└── ChatInput          — textarea + send button; Enter sends, Shift+Enter newline
```

### Block types (BlockRenderer)

| Block type | Component | Library |
|------------|-----------|---------|
| `text` | `TextBlock` | plain markdown |
| `big_number` | `BigNumberBlock` | styled stat card |
| `table` | `TableBlock` | TanStack Table (sortable) |
| `chart` (bar/line/pie) | `ChartBlock` | Recharts |
| `records_list` | `RecordsListBlock` | paginated list with link to record detail |

### Inline actions

| Action | Behaviour |
|--------|-----------|
| `save_as_aggregation` | POST to OSS `PUT /api/sifts/:id/aggregations` (name = AI-suggested title) |
| `export_csv_subset` | Download CSV of the block's data |
| `email` | Open a modal: to-field + subject + send via `POST /api/cloud/chat/messages/:id/actions/email` |

### Streaming

`POST /api/cloud/chat/sessions/:id/messages` does not stream (returns full response). Show a typing indicator while the request is in-flight.

### Plan gate

If org is on Free plan, show a full-page paywall instead of the chat UI: _"Advanced Chat is available on Pro and above"_.

## Components

- `ChatPage.tsx` — layout shell
- `ChatSidebar.tsx`
- `ChatThread.tsx`
- `BlockRenderer.tsx` — switch on `block.type`
- `ChartBlock.tsx` — recharts wrapper (BarChart | LineChart | PieChart)
- `TableBlock.tsx` — TanStack Table
- `RecordsListBlock.tsx`
- `ActionBar.tsx`
- `SuggestionChips.tsx`

## Dependencies

- `recharts` — already used or add `npm install recharts`
- `@tanstack/react-table`

## API calls

| Action | Method | Path |
|--------|--------|------|
| List sessions | GET | `/api/cloud/chat/sessions` |
| Create session | POST | `/api/cloud/chat/sessions` |
| Get session | GET | `/api/cloud/chat/sessions/:id` |
| Delete session | DELETE | `/api/cloud/chat/sessions/:id` |
| Send message | POST | `/api/cloud/chat/sessions/:id/messages` |
| Get suggestions | POST | `/api/cloud/chat/suggestions` |
| Run action | POST | `/api/cloud/chat/messages/:id/actions/:action` |

## Out of scope

- Streaming tokens
- Message editing/regeneration
- Conversation export
