---
title: "Frontend: Natural Language Query"
status: synced
---

# Natural Language Query — Frontend

The Query panel lives in the **Query tab** of the Sift Detail page (`/sifts/:id`).

## Ad-hoc Query Panel

- Natural language textarea: "Total amount by client", "Show invoices from December sorted by date"
- "Run" button → calls `POST /api/sifts/{id}/query`
- Results table below (schema-driven columns, dynamic based on returned data)
- Collapsible "View pipeline" section showing the generated MongoDB pipeline JSON

## User Flow

1. User types a natural language query in the textarea
2. Clicks "Run" — loading spinner on button
3. Results appear as a table below
4. "View pipeline" toggle shows the generated aggregation pipeline for transparency/debugging
5. User can tweak the query and re-run; previous results are replaced

## Empty / Error States

- No results: "No matching records" message
- Pipeline generation failed: error message with the LLM error detail
- Auth error: redirect to login

## Relationship to Named Aggregations

The ad-hoc query panel is for one-off exploration. For persistent queries, see `frontend/aggregations.md` — the upper portion of the Query tab shows the named aggregations list.
