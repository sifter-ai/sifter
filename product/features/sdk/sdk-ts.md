---
title: TypeScript SDK
status: synced
version: "1.0"
last-modified: "2026-04-17T00:00:00.000Z"
---

# TypeScript SDK

`@sifter-ai/sdk` is the first-class TypeScript client for the Sifter REST API. Feature parity with the Python SDK (`sifter-ai`), targeted at web, edge, and server JavaScript runtimes. Published to npm. Apache-2.0.

## Package

| Property | Value |
|----------|-------|
| Package name | `@sifter-ai/sdk` |
| Location | `code/sdk-ts/` |
| Runtime | Node 18+, Deno, Bun, Cloudflare Workers, browsers (fetch available globally) |
| Module format | ESM only (`"type": "module"`). No CJS build. |
| Runtime deps | Zero (uses global `fetch`) |
| Types | First-class — `.d.ts` bundled |

## Quick Start

```ts
import { Sifter } from "@sifter-ai/sdk";

const s = new Sifter({ apiKey: process.env.SIFTER_API_KEY });

// One-liner convenience: create, upload, wait, return records
const records = await s.sift("./invoices/", "client, date, total");
```

## Constructor

```ts
const s = new Sifter({
  apiUrl: "http://localhost:8000",     // default
  apiKey: process.env.SIFTER_API_KEY,  // or omitted + set in env
  fetch?: typeof fetch,                // inject a custom fetch (for Workers, tests)
});
```

Every request sends `X-API-Key`. 4xx/5xx responses throw a `SifterError` with `status`, `code`, and server-provided `message`.

## Sift CRUD

```ts
const sift = await s.createSift({ name: "Invoices", instructions: "client, date, total, VAT" });
const sift = await s.sift("sift_id").get();
const sifts = await s.listSifts();
await s.sift("sift_id").update({ name: "Invoices 2024" });
await s.sift("sift_id").delete();
```

## Documents and Records

```ts
const sift = s.sift("sift_id");
await sift.upload(file);               // File | Blob | Buffer | path
await sift.wait();                     // poll until all docs processed
const records = await sift.records({ limit: 50 });
const page = await sift.find({
  filter: { total: { $gt: 1000 } },
  sort: [["date", -1]],
  limit: 50,
});
const rows = await sift.aggregate([
  { $group: { _id: "$client", total: { $sum: "$total" } } },
]);
const answer = await sift.query("Total by client");
```

## Folders

```ts
const folder = await s.createFolder("Contracts 2024");
await folder.upload(file);
await folder.addSift(sift);
const docs = await folder.documents();
```

## Extraction Control

```ts
const task = await sift.extract(documentId);
const status = await sift.extractionStatus(documentId);
```

## Typed Records via Codegen

Run once at build-time to generate TypeScript interfaces for each sift's inferred schema:

```sh
npx @sifter-ai/sdk codegen --sift sift_id --out ./types/invoices.ts
```

Then consume typed records:

```ts
import type { InvoiceRecord } from "./types/invoices";
const records = await sift.records<InvoiceRecord>();
```

Codegen calls `GET /api/sifts/{id}/schema.ts` (see `product/features/server/typed-schemas.md`).

## Streaming Events

```ts
for await (const event of sift.events({ types: ["sift.document.processed"] })) {
  console.log(event);
}
```

Backed by webhooks (server-side) or SSE when available. Browser clients use the `EventSource` shim when SSE is added in Phase 5.

## Error Model

```ts
try {
  await s.createSift({ name: "x", instructions: "y" });
} catch (err) {
  if (err instanceof SifterError) {
    console.log(err.status, err.code, err.message);
  }
}
```

## Parity with Python SDK

Every public method on `sifter-ai` has a TypeScript equivalent with the same semantics:

| Python | TypeScript |
|--------|-----------|
| `Sifter(api_key=…)` | `new Sifter({ apiKey: … })` |
| `s.create_sift(name, instructions)` | `s.createSift({ name, instructions })` |
| `s.sift(id).records(limit, offset)` | `s.sift(id).records({ limit, offset })` |
| `sift.find(filter, sort, limit, cursor)` | `sift.find({ filter, sort, limit, cursor })` |
| `sift.aggregate(pipeline)` | `sift.aggregate(pipeline)` |
| `sift.query(nl)` | `sift.query(nl)` |
| `sift.extract(doc_id)` | `sift.extract(docId)` |
| `sift.extraction_status(doc_id)` | `sift.extractionStatus(docId)` |
| `folder.upload(path)` | `folder.upload(file)` |
| `s.register_hook(…)` | `s.registerHook(…)` |

Naming follows idiomatic JS (camelCase) while the wire shape remains snake_case — the SDK handles translation.

## Distribution

- Published on every release via `npm publish` from `code/sdk-ts/`.
- Tag strategy: `latest` for stable, `next` for pre-releases.
- Source-maps included; `sideEffects: false`.
