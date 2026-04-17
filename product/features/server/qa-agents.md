---
title: "Server: Q&A Agent"
status: synced
---

# Q&A Agent — Server

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sifts/{id}/chat` | Scoped chat — schema-aware, tied to a specific sift |
| POST | `/api/chat` | Global chat — optional `sift_id` |

Body: `{ "message": str, "history"?: [{role, content}, ...], "sift_id"?: str }`
Response: `{ "response": str, "data"?: list, "pipeline"?: list }`

Auth required on all endpoints.

## Agent Logic (`ExtractionQAAgent`)

1. Loads the sift schema and up to 10 sample records for context
2. Determines whether a MongoDB query is needed to answer the question
3. If yes: generates a pipeline, executes it, receives the data
4. Synthesizes a natural language answer incorporating the data
5. Returns both the answer text and the raw data (for table display in the UI)

When `pipeline` is present in the response, it contains the generated MongoDB pipeline JSON.

## Conversational Context

- Conversation history is passed by the client with each request (last N messages)
- The agent uses history for follow-up questions ("same but for client X", "sort by amount", etc.)
- Sessions are stateless server-side — the client manages history in memory or via `history` param

## Agent Capabilities

- Answer schema questions ("what fields does this extraction have?")
- Aggregate across records ("total amount per client", "count by month")
- Filter and inspect ("show me invoices over €10,000")
- Compare and rank ("which supplier had the most invoices?")
- Respond conversationally when no data query is needed

## Global vs Scoped Chat

`POST /api/chat` is a global endpoint that optionally accepts a `sift_id`. When provided it behaves identically to `POST /api/sifts/{id}/chat`. When omitted, the agent works without extraction-specific schema context.
