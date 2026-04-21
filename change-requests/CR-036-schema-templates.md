---
title: "Sift creation: schema templates"
status: pending
author: "Bruno Fortunato"
created-at: "2026-04-21T00:00:00.000Z"
---

## Summary

Reduce sift creation friction by offering a library of ready-made templates (invoice, receipt, contract, expense report, CV). When the user picks a template, the creation form is pre-filled with a tested set of instructions and a validated field schema. The user can accept as-is or customise before creating.

Templates are static JSON fixtures on the server — no AI, no database, no configuration. A new `GET /api/templates` endpoint returns them.

## Motivation

Today's sift creation form is a blank slate: a name field, an unstructured `instructions` textarea, and no hint of what a good schema looks like. First-time users either copy-paste from the docs (if they found them) or write instructions from scratch, often underspecifying fields and discovering gaps only after uploading documents.

Templates solve this without adding complexity. A user creating a sift for "expense reports" can start from a known-good prompt and field list, see results immediately on their first upload, and tweak from there. Drop-off at sift creation decreases; time-to-first-extracted-record decreases.

The library is also a demonstration of what Sifter can do — templates are implicitly a product catalogue of use cases.

## Detailed Design

### Template format

Each template is a static JSON file in `code/server/sifter/templates/`:

```json
{
  "id": "invoice",
  "name": "Invoice",
  "description": "Standard B2B invoices — supplier, amounts, line items, tax, payment terms.",
  "icon": "receipt",
  "instructions": "Extract: supplier name, supplier VAT number, invoice number, invoice date, due date, subtotal, VAT amount, total amount, currency, line items (description + quantity + unit price). Mark fields not present in the document as null.",
  "schema_fields": [
    { "name": "supplier_name",   "type": "string",  "nullable": true },
    { "name": "supplier_vat",    "type": "string",  "nullable": true },
    { "name": "invoice_number",  "type": "string",  "nullable": true },
    { "name": "invoice_date",    "type": "date",    "nullable": true },
    { "name": "due_date",        "type": "date",    "nullable": true },
    { "name": "subtotal",        "type": "number",  "nullable": true },
    { "name": "vat_amount",      "type": "number",  "nullable": true },
    { "name": "total_amount",    "type": "number",  "nullable": true },
    { "name": "currency",        "type": "string",  "nullable": true },
    { "name": "line_items",      "type": "array",   "nullable": true }
  ]
}
```

Fields mirror the existing `Sift.schema_fields` shape (`name`, `type`, `nullable`) so the template can be applied directly.

**V1 template library (5 templates):**

| id | Name | Key fields |
|---|---|---|
| `invoice` | Invoice | supplier, invoice number, dates, amounts, VAT, line items |
| `receipt` | Receipt | merchant, date, items, total, payment method |
| `contract` | Contract | parties, effective date, expiry date, governing law, key obligations |
| `expense` | Expense report | employee, date, category, amount, currency, notes |
| `resume` | CV / Resume | name, email, phone, location, experience (company + role + dates), education, skills |

Templates live in `code/server/sifter/templates/*.json`. They are loaded at startup into a module-level dict — no DB, no hot-reload.

### API

`GET /api/templates` — returns the full library, no auth required (public endpoint, templates are not sensitive).

Response:

```json
{
  "templates": [
    {
      "id": "invoice",
      "name": "Invoice",
      "description": "Standard B2B invoices…",
      "icon": "receipt",
      "instructions": "…",
      "schema_fields": [ … ]
    }
  ]
}
```

No pagination — the library is small and static.

### UI — sift creation form (`SiftForm` or `CreateSiftDialog`)

**Entry point in the form:**

Below the form title, before the name field, a row of template cards:

```
Start from a template (optional):
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ 🧾       │ │ 🧾       │ │ 📄       │ │ 💳       │ │ 👤       │
│ Invoice  │ │ Receipt  │ │ Contract │ │ Expense  │ │ CV       │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

Cards are compact (icon + label), horizontally scrollable if the viewport is narrow. Clicking a card pre-fills:
- `instructions` textarea ← template `instructions`
- Displays a read-only schema preview ("Fields: supplier_name, invoice_date, total_amount…") below the instructions textarea

The `name` field is **not** pre-filled — the user still gives the sift a meaningful name. `multi_record` is not pre-set (user's choice).

A selected template card gets a ring highlight. Clicking a selected card deselects it and clears the pre-fill. The user can also type freely in the instructions textarea after applying a template — the template is a starting point, not a locked-in preset.

**Schema preview:**

When a template is selected, a compact pill list appears below the instructions input:

```
Fields from template:  supplier_name · invoice_date · total_amount · +7 more
```

Clicking "+7 more" expands to show all field names with their types. This preview is informational only — the schema is not editable in the creation form (schema editing belongs to post-creation sift settings; auto-inference on first document will confirm/adjust it anyway).

**On submit:**

If a template was selected, the `POST /api/sifts` body includes the pre-filled `instructions` (already in the textarea value). The `schema_fields` from the template are sent as the initial `schema_fields` on the sift — this skips schema inference from the first document (the field list is already known). The `schema` string is derived server-side from `schema_fields` if provided.

If no template is selected, form behaviour is unchanged.

### Server-side handling of pre-set schema

`POST /api/sifts` request body gains an optional `schema_fields` array:

```json
{
  "name": "Q1 invoices",
  "instructions": "Extract: supplier name…",
  "schema_fields": [
    { "name": "supplier_name", "type": "string", "nullable": true },
    …
  ]
}
```

When `schema_fields` is provided, `SiftService.create_sift` stores them directly and sets `schema` to the derived string. Schema inference on the first document still runs but **merges** rather than replaces: new fields discovered by the LLM are added; fields already present in `schema_fields` are preserved (no type overwrite unless the template type was `string` and the LLM finds a more specific type — then LLM wins).

## Files

### Product / system docs

- `product/features/frontend/extraction.md` — add "Sift creation templates" section: template cards UI, pre-fill behaviour, schema preview, deselect.
- `product/features/server/extraction.md` — document optional `schema_fields` in `POST /api/sifts`; schema merge behaviour on first extraction when pre-set fields are present.
- `system/api.md` — document `GET /api/templates` response shape; document `schema_fields` param on `POST /api/sifts`.

### Code

**Server:**
- `code/server/sifter/templates/` — new directory with 5 JSON fixture files (`invoice.json`, `receipt.json`, `contract.json`, `expense.json`, `resume.json`).
- `code/server/sifter/api/templates.py` — new router: `GET /api/templates`; loads fixtures from the `templates/` directory at import time.
- `code/server/sifter/server.py` — register templates router.
- `code/server/sifter/api/sifts.py` — extend `CreateSiftRequest` with `schema_fields: Optional[list[dict]] = None`; pass to `SiftService.create_sift`.
- `code/server/sifter/services/sift_service.py` — in `create_sift`, when `schema_fields` is provided: store directly, derive `schema` string, skip initial inference step; in schema-update logic, merge rather than replace when pre-set fields are present.
- `code/server/tests/test_templates.py` — `GET /api/templates` returns all 5 templates; each has required fields; `POST /api/sifts` with `schema_fields` stores them correctly; schema merge on first document does not drop pre-set fields.

**Frontend:**
- `code/frontend/src/api/templates.ts` — new: `fetchTemplates()` returning `Template[]`.
- `code/frontend/src/components/SiftForm.tsx` (or `CreateSiftDialog.tsx`) — add template selector row; pre-fill on select; schema preview pills; deselect behaviour; pass `schema_fields` in submit payload when template active.
- `code/frontend/src/components/SiftForm.test.tsx` — unit tests: template selection pre-fills instructions; deselect clears pre-fill; "+N more" expands schema preview; submit payload includes `schema_fields` when template selected; submit payload excludes `schema_fields` when no template.

## Acceptance Criteria

1. `GET /api/templates` (no auth) returns all 5 templates, each with `id`, `name`, `description`, `icon`, `instructions`, and `schema_fields`.
2. Sift creation form shows template cards above the name field; selecting one fills the `instructions` textarea and shows the schema preview.
3. Deselecting a template card clears the pre-filled instructions.
4. The user can freely edit the pre-filled instructions after selecting a template.
5. Submitting the form with a template selected sends `schema_fields` in the `POST /api/sifts` payload.
6. A sift created with `schema_fields` has those fields stored immediately (schema visible in API response before any document is processed).
7. When the first document is processed, schema inference adds newly discovered fields but does not overwrite pre-set field types.
8. Sift creation with no template selected behaves identically to the current flow — no regression.
9. `POST /api/sifts` without `schema_fields` continues to work exactly as before.
10. All 5 template JSON fixtures pass schema validation (each field has `name`, `type` from the allowed set, `nullable: bool`).

## Out of Scope

- User-defined templates (save current sift as a template for reuse).
- Template versioning or server-side updates without a deploy.
- AI-assisted template suggestion ("we detected invoices — apply the invoice template?").
- Editing `schema_fields` in the sift creation form beyond the read-only preview (schema editing post-creation is a separate UX surface).
