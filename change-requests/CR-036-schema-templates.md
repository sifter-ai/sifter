---
title: "Sift creation: schema templates"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-21T00:00:00.000Z"
revised-at: "2026-04-24T00:00:00.000Z"
---

## Summary

Reduce sift creation friction by offering a library of ready-made instruction templates (10 templates covering common document types). When the user picks a template, the `instructions` textarea is pre-filled with a tested, descriptive prompt. The user can accept as-is or customise before creating.

Templates are purely instructional — they help the user understand what to write and get to first extraction faster, like a tutorial. Schema inference runs normally on the first document. No schema is pre-set, no server logic changes.

Templates are static JSON fixtures on the server. A new `GET /api/templates` endpoint returns them.

## Motivation

Today's sift creation form is a blank slate: a name field and an unstructured `instructions` textarea with no hint of what a good prompt looks like. First-time users write instructions from scratch, often underspecifying fields and discovering gaps only after uploading documents.

Templates solve this without adding complexity. A user creating a sift for "invoices" can start from a known-good prompt, see results immediately on their first upload, and tweak from there. Drop-off at sift creation decreases; time-to-first-extracted-record decreases.

The library is also a demonstration of what Sifter can do — templates are implicitly a product catalogue of use cases. Because Sifter uses an LLM as the extraction engine, these templates work across heterogeneous document layouts (e.g. CVs from 50 different candidates, utility bills from 10 different providers) without per-layout configuration.

## Detailed Design

### Template format

Each template is a static JSON file in `code/server/sifter/templates/`:

```json
{
  "id": "invoice",
  "name": "Invoice",
  "description": "Standard B2B invoices — supplier, amounts, line items, tax, payment terms.",
  "icon": "receipt",
  "instructions": "Extract: supplier name, supplier VAT number, invoice number, invoice date, due date, subtotal, VAT amount, total amount, currency, line items (description + quantity + unit price). Mark fields not present in the document as null."
}
```

No `schema_fields` in the fixture. Templates are instructions-only.

**V1 template library (10 templates):**

| id | Name | Key fields in instructions |
|---|---|---|
| `invoice` | Invoice | supplier, invoice number, dates, amounts, VAT, line items |
| `receipt` | Receipt | merchant, date, items, total, payment method |
| `utility_bill` | Utility Bill | provider, customer number, billing period, consumption, amount due, due date |
| `resume` | CV / Resume | name, email, phone, location, experience, education, skills |
| `contract` | Contract | parties, effective date, expiry date, governing law, key obligations |
| `bank_statement` | Bank Statement | bank, account number, period, opening balance, closing balance, transactions |
| `purchase_order` | Purchase Order | buyer, supplier, PO number, date, items, total |
| `prescription` | Medical Prescription | patient, doctor, date, medications (name + dosage + frequency), validity |
| `delivery_note` | Delivery Note | sender, recipient, date, items, tracking number |
| `insurance` | Insurance Certificate | insured, insurer, policy number, coverage type, premium, start date, end date |

Templates live in `code/server/sifter/templates/*.json`. They are loaded at startup into a module-level list — no DB, no hot-reload.

### API

`GET /api/templates` — returns the full library, no auth required.

Response:

```json
{
  "templates": [
    {
      "id": "invoice",
      "name": "Invoice",
      "description": "Standard B2B invoices…",
      "icon": "receipt",
      "instructions": "Extract: supplier name…"
    }
  ]
}
```

No changes to `POST /api/sifts`. Schema inference runs unchanged on the first document.

### UI — sift creation form

Below the form title, before the name field, a row of compact template cards (icon + label), horizontally scrollable.

Clicking a card pre-fills the `instructions` textarea. A ring highlight marks the selected card. Clicking the selected card again deselects and clears the pre-fill. The user can freely edit the pre-filled text.

The `name` field is not pre-filled. No schema is sent on submit — `POST /api/sifts` payload is identical to the no-template case except for the instructions value.

## Files

### Product / system docs

- `product/features/frontend/extraction.md` — add "Sift creation templates" section.
- `product/features/server/extraction.md` — add `GET /api/templates` endpoint note.
- `system/api.md` — add `GET /api/templates` to endpoint table.

### Code

**Server:**
- `code/server/sifter/templates/` — new directory with 10 JSON fixture files.
- `code/server/sifter/api/templates.py` — new router: `GET /api/templates`.
- `code/server/sifter/server.py` — register templates router.

**Frontend:**
- `code/frontend/src/api/templates.ts` — `fetchTemplates()` returning `Template[]`.
- `code/frontend/src/components/SiftForm.tsx` — add template selector row; pre-fill on select; deselect behaviour.

## Acceptance Criteria

1. `GET /api/templates` (no auth) returns all 10 templates, each with `id`, `name`, `description`, `icon`, `instructions`.
2. Sift creation form shows template cards; selecting one fills the `instructions` textarea.
3. Deselecting a card clears the pre-filled instructions.
4. The user can freely edit the pre-filled instructions.
5. Submit payload is identical to the no-template case — no new fields, no server changes.
6. Sift creation without a template selected behaves identically to the current flow.

## Out of Scope

- Pre-setting `schema_fields` from a template (schema inference runs normally).
- User-defined templates.
- AI-assisted template suggestion.
