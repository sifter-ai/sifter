---
title: "Typed schema generation from sift (Pydantic + TypeScript)"
status: pending
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
---

## Summary

For every sift, emit a typed model of its extracted records: Pydantic class for Python, `interface`/`type` for TypeScript. Consumers can opt into typed access (`sift.records[Invoice]()`, `SiftRecord<Invoice>`) instead of `dict` / `unknown`. End-to-end types are table-stakes for dev-first DX.

## Motivation

Today the SDK returns `list[dict]` / `Array<unknown>`. The developer either lives with untyped data or hand-writes a model. Given that the sift schema is already inferred after the first extraction, the server knows the field names and types — generating a typed model is mechanical.

Typed access:
- Eliminates typos (`record.clinet` → compile error)
- Autocompletes field names in IDE
- Surfaces type mismatches at compile time, not at runtime
- Makes refactoring safe when a sift's schema evolves

## Detailed Design

### Canonical schema representation

The server already stores a schema string like `"client (string), date (string), amount (number)"`. This CR adds a structured form next to it:

```json
{
  "schema_text": "client (string), date (string), amount (number)",
  "schema_fields": [
    { "name": "client", "type": "string", "nullable": true },
    { "name": "date", "type": "string", "format": "date", "nullable": true },
    { "name": "amount", "type": "number", "nullable": true }
  ]
}
```

`type` is one of: `string`, `number`, `integer`, `boolean`, `date`, `datetime`, `array`, `object`.
`format` is an optional refinement (e.g., `date`, `email`, `uri`).
`nullable: true` for all fields by default — extraction can fail for any field.

For `multi_record` sifts, the generated model still represents a single record; `list[Invoice]` is used at the call site.

### Endpoint

```
GET /api/sifts/{sift_id}/schema
Response: {
  "sift_id": "sift_...",
  "schema_text": "...",
  "schema_fields": [...],
  "schema_version": int
}
```

`schema_version` increments when the server re-infers the schema (e.g., after a reprocess that introduces new fields). Consumers can cache generated types against a version.

### Codegen endpoints

```
GET /api/sifts/{sift_id}/schema.pydantic
Returns: text/plain — a ready-to-paste Pydantic class.

GET /api/sifts/{sift_id}/schema.ts
Returns: text/plain — a TypeScript interface.

GET /api/sifts/{sift_id}/schema.json
Returns: JSON Schema draft 2020-12.
```

Example outputs:

```python
# schema.pydantic (sift "Invoices")
from pydantic import BaseModel
from typing import Optional
from datetime import date

class Invoice(BaseModel):
    client: Optional[str] = None
    date: Optional[date] = None
    amount: Optional[float] = None
```

```ts
// schema.ts (sift "Invoices")
export interface Invoice {
  client?: string;
  date?: string;       // ISO yyyy-mm-dd
  amount?: number;
}
```

### CLI integration (CR-025)

```
sifter sifts schema <sift_id> --format pydantic > invoice.py
sifter sifts schema <sift_id> --format typescript > invoice.ts
sifter sifts schema <sift_id> --format json > invoice.schema.json
```

A watch mode is useful for development:

```
sifter sifts schema <sift_id> --format typescript --watch --output src/types/invoice.ts
```

Polls the server and rewrites the file when `schema_version` changes.

### SDK typed access

Python:

```python
from pydantic import BaseModel
from sifter import Sifter

class Invoice(BaseModel):
    client: str | None = None
    date: str | None = None
    amount: float | None = None

records = sift.records(model=Invoice)  # list[Invoice]
for r in records:
    print(r.client, r.amount)
```

Validation errors from Pydantic bubble up with the record ID in context.

TypeScript (via CR-024's generic):

```ts
import type { Invoice } from "./invoice.ts";

const records = await sift.records<Invoice>();
records.forEach(r => console.log(r.client));
```

TypeScript is structural — no runtime validation unless the consumer adds Zod/Valibot on top. The CR does not ship a TS runtime validator; consumers who want one can use the JSON Schema output with any validator.

### Schema drift handling

When a document is processed that introduces a new field not in the previous schema:

1. The server updates `schema_fields` and bumps `schema_version`.
2. Consumers using generated types will not see the new field until they regenerate. That is acceptable — schema drift is an intentional event, not a silent change.
3. A webhook `sift.schema.changed` fires with `{sift_id, old_version, new_version, added_fields, removed_fields}` so automation (CI, watch mode) can trigger regeneration.

### Docs

- `docs/concepts/typed-schemas.mdx` — how schema inference works, how to regenerate on change, best practices (commit generated files, or generate at build time).

## Files

- `code/server/sifter/api/sifts.py` — CHANGED (add `/schema`, `/schema.pydantic`, `/schema.ts`, `/schema.json`)
- `code/server/sifter/services/schema_infer.py` — CHANGED (emit `schema_fields` alongside `schema_text`, bump `schema_version`)
- `code/server/sifter/services/codegen/pydantic_emit.py` — NEW
- `code/server/sifter/services/codegen/typescript_emit.py` — NEW
- `code/server/sifter/services/codegen/json_schema_emit.py` — NEW
- `code/server/sifter/services/webhook_events.py` — CHANGED (add `sift.schema.changed`)
- `code/sdk/sifter/client.py` — CHANGED (accept `model=` kwarg on `records()`, `find()`)
- `code/cli/sifter_cli/commands/sifts.py` — CHANGED (add `schema` subcommand with `--watch`)
- `product/features/server/extraction.md` — CHANGED (document `schema_fields` + `schema_version`)
- `product/features/server/typed-schemas.md` — NEW
- `docs/concepts/typed-schemas.mdx` — NEW
- `system/api.md` — CHANGED

## Acceptance Criteria

1. `GET /api/sifts/{id}/schema` returns structured `schema_fields` and a numeric `schema_version`.
2. `GET /api/sifts/{id}/schema.pydantic` returns a compile-able Pydantic class.
3. `GET /api/sifts/{id}/schema.ts` returns a compile-able TS interface.
4. `GET /api/sifts/{id}/schema.json` returns a valid JSON Schema draft 2020-12.
5. Python SDK: `sift.records(model=Invoice)` returns `list[Invoice]` with Pydantic validation.
6. TypeScript SDK: `sift.records<Invoice>()` is typed (compile-time only).
7. CLI: `sifter sifts schema <id> --format typescript --watch --output foo.ts` regenerates on schema change.
8. Webhook `sift.schema.changed` fires with the diff payload on schema version bump.
9. Tests cover codegen for nested objects, arrays, nullable fields, and multi-record sifts.
10. `docs/concepts/typed-schemas.mdx` contains an end-to-end example including `--watch` usage.

## Out of Scope

- Runtime TS validator generation (Zod/Valibot) — consumers pick their validator over the JSON Schema output.
- Schema evolution migrations (add a "renamed field" annotation, etc.) — v1 treats each version as a fresh schema.
- Go / Rust / Java codegen — add on demand based on actual SDK roadmap.
