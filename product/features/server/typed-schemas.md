---
title: "Server: Typed Schema Generation"
status: new
version: "1.0"
last-modified: "2026-04-17T00:00:00.000Z"
---

# Typed Schema Generation — Server

For every sift, the server emits a typed representation of its extracted records in three formats: Pydantic, TypeScript, and JSON Schema draft 2020-12. Typed access eliminates field typos, unlocks IDE autocomplete, and makes schema evolution an explicit event rather than a silent breakage.

## Canonical schema

The server already infers a human-readable schema hint from the first extracted document. This feature adds a structured representation alongside it on the sift:

```json
{
  "schema_text": "client (string), date (string), amount (number)",
  "schema_version": 3,
  "schema_fields": [
    { "name": "client", "type": "string", "nullable": true },
    { "name": "date",   "type": "string", "format": "date", "nullable": true },
    { "name": "amount", "type": "number", "nullable": true }
  ]
}
```

### Field types

`type` is one of: `string`, `number`, `integer`, `boolean`, `date`, `datetime`, `array`, `object`.

`format` refines `string` with `date`, `datetime`, `email`, `uri` (optional).

`nullable: true` is the default — any extracted field can be absent because the LLM may fail to resolve it on a given document.

For `multi_record: true` sifts, the emitted model still represents a single record; `list[Invoice]` / `Invoice[]` is used at the call site.

## Endpoints

| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/sifts/{id}/schema` | JSON `{ schema_text, schema_fields, schema_version }` |
| GET | `/api/sifts/{id}/schema.pydantic` | `text/plain` — ready-to-paste Pydantic class |
| GET | `/api/sifts/{id}/schema.ts` | `text/plain` — TypeScript `interface` |
| GET | `/api/sifts/{id}/schema.json` | JSON Schema draft 2020-12 |

Auth required. All four share a single schema inference step; only the emitter differs.

### Example output

**Pydantic** (`schema.pydantic`):

```python
from pydantic import BaseModel
from typing import Optional
from datetime import date

class Invoice(BaseModel):
    client: Optional[str] = None
    date: Optional[date] = None
    amount: Optional[float] = None
```

**TypeScript** (`schema.ts`):

```ts
export interface Invoice {
  client?: string;
  date?: string;       // ISO yyyy-mm-dd
  amount?: number;
}
```

**JSON Schema** (`schema.json`):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Invoice",
  "type": "object",
  "properties": {
    "client": { "type": ["string", "null"] },
    "date":   { "type": ["string", "null"], "format": "date" },
    "amount": { "type": ["number", "null"] }
  }
}
```

Class / interface name is derived from the sift `name`, PascalCase-normalized. Conflicts (e.g., sift "Invoices" vs "Invoice") are resolved by appending the sift id suffix.

## Schema Versioning

`schema_version` is an integer on every sift. It increments whenever the inferred schema changes — fields added, fields removed, or types changed. Each change emits a `sift.schema.changed` webhook event:

```json
{
  "event": "sift.schema.changed",
  "payload": {
    "sift_id": "sift_…",
    "old_version": 2,
    "new_version": 3,
    "added_fields": [{ "name": "vat_number", "type": "string" }],
    "removed_fields": [],
    "changed_fields": []
  }
}
```

Automation (CI, `sifter sifts schema --watch`, CD pipelines) subscribes to this event to trigger regeneration. Cache generated types against `schema_version` and refresh when the event arrives.

## SDK typed access

Python (Pydantic):

```python
from pydantic import BaseModel
from sifter import Sifter

class Invoice(BaseModel):
    client: str | None = None
    date: str | None = None
    amount: float | None = None

records: list[Invoice] = sift.records(model=Invoice)
for r in records:
    print(r.client, r.amount)

typed_page = sift.find(filter={"amount": {"$gt": 1000}}, model=Invoice)
```

Pydantic validation errors bubble up with the offending record id in the exception context.

TypeScript (compile-time only — no runtime validation):

```ts
import type { Invoice } from "./types/invoices";
const records = await sift.records<Invoice>();
```

Consumers who want runtime validation use the `schema.json` output with their validator of choice (Zod, Valibot, Ajv). The OSS SDK does not bundle a TS runtime validator.

## CLI

```
sifter sifts schema <sift_id> --format pydantic > invoice.py
sifter sifts schema <sift_id> --format typescript > invoice.ts
sifter sifts schema <sift_id> --format json > invoice.schema.json

sifter sifts schema <sift_id> --format typescript \
    --watch --output src/types/invoice.ts
```

`--watch` subscribes to `sift.schema.changed` (or polls `schema_version` when webhooks are not reachable) and rewrites `--output` on every bump.

## Schema drift

Schema drift is intentional, not a silent breakage. When a new field appears:

1. Server updates `schema_fields`, bumps `schema_version`.
2. Consumers using generated types do not see the field until they regenerate.
3. The `sift.schema.changed` webhook provides the exact diff.

This is the design — regenerate deliberately, commit the generated files (or generate at build time), and let the type system surface the change.

## Out of scope

- Runtime TS validator generation. Pick Zod/Valibot over the JSON Schema output.
- Schema evolution migrations (rename-field annotations). Each version is a fresh snapshot.
- Go / Rust / Java codegen. Added on demand when official SDKs target those languages.
