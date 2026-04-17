---
title: "Frontend: Conversational Chat"
status: synced
---

# Conversational Chat — Frontend

Two entry points:
1. **Chat tab** on Sift Detail page (`/sifts/:id`) — scoped to that sift, schema-aware
2. **Global Chat page** (`/chat`) — optional sift selector, works across all sifts

## Chat Tab (Sift Detail)

- Embedded chat interface inside the Sift Detail page
- Uses `POST /api/sifts/{id}/chat` (scoped endpoint)
- Agent has the sift schema pre-loaded → richer, more accurate responses

## Global Chat Page (`/chat`)

- Full-page chat interface
- Optional sift selector dropdown in the toolbar — filters context to a specific sift
- Uses `POST /api/chat` with optional `sift_id` param

## Chat Interface

- Message list (scrollable): user messages on right, assistant on left
- Message input textarea + Send button (also sends on Enter / Shift+Enter for newline)
- Loading indicator while waiting for response

**Assistant message rendering:**
- Natural language text
- Optional inline data table (when `data` is returned)
- "View pipeline" toggle (appears when `pipeline` is in response) — expands to show generated MongoDB pipeline JSON

## Conversation History

The client maintains conversation history in component state (array of `{role, content}` objects). Each request sends the last N messages as the `history` param. Sessions are not persisted server-side — refreshing the page starts a new conversation.

## User Flow

1. User types a question: "How much did I invoice in December?" or "Which supplier had the most invoices?"
2. Sends → assistant response appears with text + optional table
3. Follow-up: "Same but just for client Acme" — agent uses history context
4. "View pipeline" reveals the MongoDB pipeline used to answer data questions

## Empty State

First-time view shows suggested questions based on the sift's schema (if sift is selected) or generic document analytics prompts.
