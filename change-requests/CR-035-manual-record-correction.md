---
title: "Records: manual correction with scope control"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-21T00:00:00.000Z"
---

## Summary

Let users correct wrong extracted values directly in the record detail modal, with an explicit choice of scope:

- **Local correction** ("only this record") — stores an override on the specific `SiftResult`. Re-extraction regenerates `extracted_data` but the override layer survives, so the correction is never silently lost.
- **Rule-based correction** ("this record + all future extractions matching the same value") — stores a normalisation rule on the sift. The rule is applied during extraction and on-demand backfill, effectively teaching the pipeline to stop making the same mistake.

Both modes share a single UI entry point in the record detail modal. The choice is a toggle shown when the user saves a correction.

This CR covers scalar field types (`string`, `number`, `integer`, `boolean`, `date`, `datetime`) in v1. `array` and `object` fields are rendered read-only.

## Motivation

CR-033 gives users trust signals (confidence + source snippets). CR-034 lets users find uncertain records quickly. Neither lets them *fix* anything. The correction flow is the last missing piece of the verify → correct loop:

```
extract → (trust view) → identify uncertain → (low-conf filter) → correct → done
```

Without correction, users who find a wrong value have no option but to live with it or re-upload the document hoping the LLM does better. That undermines the "tool of record" positioning.

The dual-scope design is deliberate. A one-off typo ("Acme Ltd." extracted as "Acm Ltd." on a single document) is a local correction — there is no point burdening the extraction pipeline with it. A systematic LLM mistake ("OpenAl" for "OpenAI" across dozens of documents) is a rule — fixing it once and backfilling is far more valuable than correcting each record manually.

Storing corrections as a separate layer (rather than overwriting `extracted_data`) is equally deliberate. Re-indexing a sift (schema update, model upgrade, document re-upload) must not silently erase human corrections. The override layer is immutable by re-extraction; only an explicit user action can remove it.

## Detailed Design

### Data model

#### `SiftResult` — new fields

```python
user_overrides: dict[str, Any] = {}
# key = field name, value = corrected value (same type as extracted_data value)

corrected_fields: dict[str, dict] = {}
# key = field name
# value = { value, scope: "local"|"rule", corrected_by: user_id, corrected_at: ISO timestamp }
```

`user_overrides` is the merge layer: when rendering a record, the server returns `{**extracted_data, **user_overrides}` so consumers always see the "best known" value. `corrected_fields` is the audit trail — who changed what, when, and how.

Both fields are stored in Mongo alongside the existing `SiftResult` document. Indices: none needed beyond existing `sift_id` index.

**Merge-on-read rule**: `user_overrides` always wins. If a field exists in both `extracted_data` and `user_overrides`, the override is returned. A separate `GET /records/{id}?show_original=true` param returns `extracted_data` unmodified (useful for debugging / "what did the LLM actually extract?").

Re-extraction (triggered by `POST /api/sifts/{id}/reindex`) updates `extracted_data` and `citations` but **never touches** `user_overrides` or `corrected_fields`. This is the invariant that makes corrections durable.

#### `CorrectionRule` — new collection

```python
class CorrectionRule(BaseModel):
    id: Optional[str]          # MongoDB _id
    sift_id: str
    field_name: str            # which field this rule targets
    match_value: str           # exact match (case-insensitive, trimmed)
    replace_value: Any         # replacement (same type as field)
    created_by: str            # user_id
    created_at: datetime
    applied_count: int = 0     # incremented on each apply (backfill or new extraction)
    active: bool = True        # soft-delete
```

**Match semantics v1**: exact match after `str(value).strip().lower()` on both sides. No regex, no fuzzy — keeps the rule semantics predictable and the UI simple. Future CR can add match_type: `exact | prefix | regex`.

**Application timing**: rules are applied in `DocumentProcessor` immediately before writing `extracted_data`, so new documents are normalised at extraction time. Backfill is explicit (see API).

**Ordering**: when multiple rules match the same field, they are applied in `created_at` ascending order (oldest first). Conflicts (two rules match same value → different replacements) are visible in the rules list UI; user must deactivate one.

### API

#### Records

| Method | Path | Description |
|---|---|---|
| `PATCH` | `/api/sifts/{id}/records/{record_id}` | Correct one or more fields on a record |
| `GET` | `/api/sifts/{id}/records/{record_id}` | (existing) — now returns merged view by default; `?show_original=true` returns raw `extracted_data` |

**`PATCH /api/sifts/{id}/records/{record_id}` request body:**

```json
{
  "corrections": {
    "vendor_name": {
      "value": "OpenAI",
      "scope": "local"
    },
    "total": {
      "value": 1500,
      "scope": "rule"
    }
  }
}
```

Each entry in `corrections` is processed independently. For `scope: "local"`: write to `user_overrides[field]` and `corrected_fields[field]`. For `scope: "rule"`: same as local PLUS create a `CorrectionRule` for `(sift_id, field_name, old_value → new_value)` where `old_value` is the current merged value before the correction. The response returns the updated record (merged view).

HTTP 422 if `field_name` is not in the sift's `schema_fields`. HTTP 422 if `value` type is incompatible with the field's declared type.

#### Correction rules

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/sifts/{id}/correction-rules` | List all rules for a sift (`?active_only=true` default) |
| `DELETE` | `/api/sifts/{id}/correction-rules/{rule_id}` | Soft-delete a rule (`active = false`) |
| `POST` | `/api/sifts/{id}/correction-rules/{rule_id}/backfill` | Apply rule to all existing records where field matches |

**Backfill** runs synchronously for datasets under 500 records, async (background task) for larger ones. Response includes `applied_count`. Backfill writes to `user_overrides` + `corrected_fields` on each matching record (scope stays "rule" in the audit trail).

### UI

#### Record detail modal — correction form

The `RecordDetailModal` grows an **edit mode**. A pencil icon button appears in the modal header: "Edit record". Clicking it switches each scalar field row from read-only to editable.

**Field input per type:**
- `string` → `<input type="text">`
- `number` / `integer` → `<input type="number">`
- `boolean` → `<select>` with true / false options
- `date` → `<input type="date">` (ISO yyyy-mm-dd)
- `datetime` → `<input type="datetime-local">`
- `array` / `object` → read-only in v1; edit icon is absent for these fields

Dirty fields are highlighted (light amber background on the input row).

**Save dialog:**

When the user clicks "Save corrections", a compact modal overlay appears before the PATCH is sent:

```
Apply corrections to:
  ◉ Only this record
  ○ This record + all future matching values in this sift
      (Creates a correction rule for each changed field)

[Cancel]  [Save]
```

Both options always write the local override. The second option additionally creates correction rules. The dialog shows the list of changed field names so the user knows what will be affected.

After save, the modal returns to read-only mode. Corrected fields show a small `edited` pill (dark, muted) replacing the confidence badge — distinct from the LLM confidence colours. Hovering the pill shows a tooltip: "Corrected by <user> on <date> · [Reset to original]".

**Reset to original**: clicking "Reset to original" in the tooltip removes the field from `user_overrides` and `corrected_fields` (sends `PATCH` with `value: null, scope: "reset"`). The LLM-extracted value and original confidence badge are restored.

#### Correction rules page

A new "Correction rules" tab inside the Sift Detail page (alongside Records, Documents, Dashboard, Chat). Only shown when the sift has at least one rule.

Layout: a simple table with columns: Field, Match value → Replace value, Created by, Created at, Applied count, Actions (Backfill / Delete).

"Delete" soft-deletes the rule (sets `active: false`). Future corrections matching that value will no longer be normalised. Existing records already corrected by the rule retain their `user_overrides` (the rule deletion is not retroactive).

"Backfill" button calls `POST /correction-rules/{id}/backfill` and shows a toast "Applied to N records".

### Merge-on-read in existing API consumers

The server computes the merged view (`{**extracted_data, **user_overrides}`) in `SiftResultsService.to_response_dict` before any serialisation. All existing consumers (records list, CSV export, chat aggregations, dashboard queries) automatically see the corrected values. No consumer-side changes needed.

**Important**: MongoDB aggregation pipelines used by chat/dashboard run against raw `extracted_data`, not the merged view. A follow-up CR should address pipeline-layer merging if it becomes a visible inconsistency. For v1, the discrepancy is acceptable and documented in the "Out of scope" section.

### Audit log integration

If `sifter-cloud`'s audit log is present (the `AuditLogService` import), each PATCH call emits an `record.corrected` event with `{record_id, field_name, old_value, new_value, scope}`. In OSS (no audit log), this is a no-op.

## Files

### Product / system docs

- `product/features/frontend/records.md` — add "Correction flow" section: edit mode, field inputs by type, save dialog (scope choice), `edited` pill, reset-to-original, correction rules tab.
- `product/features/server/extraction.md` — add "Manual corrections" section: `user_overrides` + `corrected_fields` fields on SiftResult, merge-on-read invariant, re-extraction durability guarantee, `CorrectionRule` entity, PATCH endpoint, correction-rules CRUD, backfill.
- `system/api.md` — document new endpoints: `PATCH /records/{id}`, `GET /correction-rules`, `DELETE /correction-rules/{id}`, `POST /correction-rules/{id}/backfill`.

### Code

**Server:**
- `code/server/sifter/models/sift_result.py` — add `user_overrides: dict[str, Any] = {}` and `corrected_fields: dict[str, dict] = {}`.
- `code/server/sifter/models/correction_rule.py` — new file: `CorrectionRule` Pydantic model + `to_mongo` / `from_mongo`.
- `code/server/sifter/services/sift_results.py` — add `to_response_dict` merge logic; add `apply_user_overrides` helper; extend `list_records` to return merged view; add `correct_record(record_id, corrections, user_id)` method; add `show_original` param to `get_record`.
- `code/server/sifter/services/correction_rules.py` — new file: `CorrectionRulesService` with `create`, `list`, `deactivate`, `backfill`.
- `code/server/sifter/services/document_processor.py` — before writing `SiftResult.extracted_data`, load active `CorrectionRule`s for the sift and apply matching rules.
- `code/server/sifter/api/sifts.py` — add `PATCH /records/{record_id}` handler; add correction-rules sub-router (`GET`, `DELETE`, `POST /backfill`).
- `code/server/tests/test_corrections.py` — new: local override survives reindex; rule correction survives reindex; merge-on-read returns corrected value; backfill applies to matching records only; reset removes override; PATCH rejects unknown field name (422); PATCH rejects type-incompatible value (422); rule application during new document processing.

**Frontend:**
- `code/frontend/src/api/extractions.ts` — add `PATCH` call `correctRecord(siftId, recordId, corrections)`, add `CorrectionRule` type, add correction-rules API calls.
- `code/frontend/src/components/RecordDetailModal.tsx` (or `RecordsTable.tsx`) — add edit mode toggle, per-type inputs, dirty tracking, save dialog with scope choice, `edited` pill, reset-to-original tooltip action.
- `code/frontend/src/pages/SiftDetailPage.tsx` — add "Correction rules" tab (conditional on rule count > 0).
- `code/frontend/src/components/CorrectionRulesTable.tsx` — new: rules table with backfill + delete actions.
- `code/frontend/src/components/RecordDetailModal.test.tsx` — unit tests: edit mode renders inputs; dirty state; scope dialog shows correct fields; `edited` pill on corrected field; reset action dispatches correct payload; array/object fields are not editable.

## Acceptance Criteria

1. `PATCH /api/sifts/{id}/records/{record_id}` with `scope: "local"` writes to `user_overrides`; `GET` on the same record returns the corrected value in the merged response.
2. `POST /api/sifts/{id}/reindex` regenerates `extracted_data` and `citations` but does not modify `user_overrides` or `corrected_fields`.
3. `PATCH` with `scope: "rule"` creates a `CorrectionRule` in addition to the local override.
4. A new document processed after rule creation has the rule applied to its `extracted_data` before storage.
5. `POST /correction-rules/{id}/backfill` updates `user_overrides` on all existing records where the field value matches; `applied_count` on the rule reflects the actual number updated.
6. `DELETE /correction-rules/{id}` sets `active: false`; the rule no longer applies to new documents; existing record overrides from that rule are untouched.
7. Records list (`GET /records`), CSV export, and record detail all return the merged value (override wins over extraction).
8. Edit mode in the modal renders correct input types per schema field type; `array` and `object` fields have no edit control.
9. Save dialog shows both scope options and the list of dirty fields before sending the PATCH.
10. `edited` pill replaces confidence badge on corrected fields; tooltip shows corrector identity and date; "Reset to original" removes the override and restores the LLM value + confidence badge.
11. Correction rules tab appears in the sift when at least one rule exists; rules table shows field, match → replace, applied count; backfill and delete actions work.
12. `PATCH` with an unknown field name returns HTTP 422.
13. `PATCH` with a type-incompatible value (e.g., `"hello"` for an `integer` field) returns HTTP 422.
14. `?show_original=true` on `GET /records/{id}` returns raw `extracted_data` without applying overrides.

## Out of Scope

- **Array and object field editing.** Field-level editors for structured types belong in a dedicated follow-up.
- **Regex / fuzzy rule matching.** V1 rules use exact match (case-insensitive, trimmed). Richer match types are a future CR.
- **Aggregation pipeline merging.** Chat and dashboard queries run against raw `extracted_data`. Corrected values are visible in the records table and CSV but not yet in chat aggregation results. A follow-up CR can add a Mongo view or a projection stage that applies the override layer.
- **Bulk inline editing** (edit multiple records at once from the table without opening a modal).
- **Rule import/export** (e.g., copy rules from one sift to another).
