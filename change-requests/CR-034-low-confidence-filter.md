---
title: "Records: low-confidence filter"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-21T00:00:00.000Z"
---

## Summary

Close the verification loop opened by CR-033: give users a fast path to find records (and individual fields) that need human review, without opening every record one by one.

Two additions:

1. **Server** — `GET /api/sifts/{id}/records` gains a `?min_confidence=` query param to filter by document-level confidence. A new `?has_uncertain_fields=true` flag narrows to records where at least one field has low confidence or is inferred.
2. **UI** — a "Show uncertain only" toggle above the records table, a count badge ("3 uncertain"), and a per-field low-confidence indicator in the table's confidence column that flags rows with at least one suspect field.

No new collection, no new endpoint — purely additive on the existing `GET /records` path and `RecordsTable` component.

## Motivation

CR-033 ships per-field confidence badges and source snippets in the record detail modal. The trust layer is now visible — but only if you know which record to open. A dataset of 200 invoices still requires opening each row to find the 4 that have `Low` or `Unverified` fields.

This CR collapses that friction: one toggle, all uncertain records surface immediately. It is the smallest possible step that makes CR-033's evidence actually actionable, and it is the prerequisite for efficient use of the correction flow (CR-035 — a user who can't find uncertain records can't correct them efficiently).

## Detailed Design

### Server — `GET /api/sifts/{id}/records`

Two new optional query parameters:

| Param | Type | Semantics |
|---|---|---|
| `min_confidence` | float `[0.0, 1.0]` | Return only records with `SiftResult.confidence >= min_confidence`. Applied as a MongoDB `$gte` filter on the `confidence` field. |
| `has_uncertain_fields` | bool | When `true`, return only records where at least one citation entry has `confidence < 0.6` OR `inferred: true`. Applied as a MongoDB `$elemMatch`-style expression over the `citations` map values. |

The two params are independent and composable. `min_confidence` targets the document-level summary; `has_uncertain_fields` targets per-field granularity. Both are ignored (no-op) when absent.

Count endpoint (`GET /api/sifts/{id}/records/count`) accepts the same two params so the UI badge stays accurate.

Implementation in `sifts.py`: pass params into `SiftResultsService.list_records` / `count_records`. The service builds the Mongo filter and passes it through to the Motor query — no new index needed beyond the existing `sift_id` index (confidence is a top-level field; `citations` values are queried with `$where` or map-reduce if `$elemMatch` on dict values is not clean enough — a full-scan is acceptable on datasets of typical size, but a comment should note the trade-off).

### UI — `RecordsTable` component

**Toggle:**

A small toggle control above the table (right side, near the search input): `☐ Show uncertain only`. When enabled it calls `GET /records?has_uncertain_fields=true` (replacing the current fetch). The toggle state is local (not in the URL, not persisted).

**Uncertain count badge:**

When the sift has at least one record matching `has_uncertain_fields=true`, a badge appears next to the toggle: `N uncertain`. It is populated by a separate `GET /records/count?has_uncertain_fields=true` call made once on tab mount. Badge is amber-tinted (`bg-amber-50 text-amber-700`), consistent with the `Medium` confidence colour from CR-033.

**Row-level indicator:**

In the `Conf` column of the table, add a small amber warning dot (⚠) next to the document-level confidence bar when the record has at least one field with `confidence < 0.6` or `inferred: true`. The server returns this as a new boolean `has_uncertain_fields` on each record response object (derived at query time; not stored). Tooltip on hover: "One or more fields have low confidence — click to review".

**No change** to the record detail modal layout (already handles per-field trust view).

### API response shape change

`GET /api/sifts/{id}/records` response items gain one derived boolean field:

```json
{
  "id": "…",
  "confidence": 0.91,
  "has_uncertain_fields": true,
  "extracted_data": { … },
  "citations": { … }
}
```

`has_uncertain_fields` is computed server-side from the `citations` map before returning the response. It is never stored in Mongo.

### Frontend API types

`code/frontend/src/api/extractions.ts`:

```ts
export interface SiftRecord {
  // existing fields…
  has_uncertain_fields: boolean;
}
```

## Files

### Product / system docs

- `product/features/frontend/records.md` — add "Uncertain filter" section: toggle, count badge, row-level ⚠ indicator, tooltip.
- `product/features/server/extraction.md` — document `min_confidence` and `has_uncertain_fields` params on `GET /records` and `GET /records/count`; document `has_uncertain_fields` derived field on each record response item.

### Code

- `code/server/sifter/api/sifts.py` — add `min_confidence: Optional[float]` and `has_uncertain_fields: Optional[bool]` query params to `list_records` and `count_records` handlers; compute `has_uncertain_fields` field before response serialisation.
- `code/server/sifter/services/sift_results.py` — extend `list_records` / `count_records` to accept and apply the new filters; add helper `_build_uncertain_fields_filter` that generates the Mongo expression for citations map inspection.
- `code/server/tests/test_sifts.py` — tests: `?min_confidence=0.8` filters low-conf records; `?has_uncertain_fields=true` returns only records with ≥1 low-confidence citation; `has_uncertain_fields` field is present and correct on each response item.
- `code/frontend/src/api/extractions.ts` — add `has_uncertain_fields: boolean` to `SiftRecord`.
- `code/frontend/src/components/RecordsTable.tsx` — add toggle + badge (above table); add ⚠ dot in `Conf` column cell when `record.has_uncertain_fields`.
- `code/frontend/src/components/RecordsTable.test.tsx` — unit tests: toggle triggers `has_uncertain_fields=true` fetch; badge renders correct count; ⚠ dot appears when field is true.

## Acceptance Criteria

1. `GET /api/sifts/{id}/records?min_confidence=0.8` returns only records where `SiftResult.confidence >= 0.8`.
2. `GET /api/sifts/{id}/records?has_uncertain_fields=true` returns only records where at least one citation has `confidence < 0.6` or `inferred: true`.
3. `GET /api/sifts/{id}/records/count` accepts both params and returns the matching count.
4. Each record response item includes `has_uncertain_fields: bool`, computed server-side, never stored.
5. "Show uncertain only" toggle in the UI correctly applies the `has_uncertain_fields=true` filter on activation; deactivation restores the unfiltered list.
6. Amber badge "N uncertain" reflects `count?has_uncertain_fields=true`; absent when count is 0.
7. ⚠ dot appears in the `Conf` column exactly for rows where `has_uncertain_fields: true`; tooltip is correct.
8. Both params are ignored (no error, no filtering) when absent — existing behaviour unchanged.
9. `min_confidence` value outside `[0.0, 1.0]` returns HTTP 422.
10. Tests pass for all scenarios above.

## Out of Scope

- Persisting the toggle state in URL params or user preferences.
- Filtering by uncertain fields on the records CSV export.
- Per-field filtering (e.g. "show records where field `total` is uncertain") — full-text field-level filtering belongs to the structured query feature.
