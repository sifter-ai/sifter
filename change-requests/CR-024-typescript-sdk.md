---
title: "TypeScript SDK (@sifter-ai/sdk)"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-17T00:00:00.000Z"
---

## Summary

New TypeScript/JavaScript SDK package at `code/sdk-ts/`, published as `@sifter-ai/sdk` on npm. Feature parity with the Python SDK. Enables JS/TS developers to integrate Sifter with the same ergonomics as Python, covering browser, Node.js, and edge runtimes.

## Motivation

The dev-first repositioning (CR-022) makes developer adoption the primary growth channel for OSS. JavaScript/TypeScript is the dominant language for modern dev tooling, serverless, Next.js-based SaaS, and AI-agent frameworks (Vercel AI SDK, LangChain.js, Mastra). Shipping only a Python SDK cuts out a large slice of the target.

Parity with the Python SDK — not a reduced subset — matters: the dev-first story must hold in both languages equally.

## Detailed Design

### Package structure

```
code/sdk-ts/
├── package.json             @sifter-ai/sdk package
├── tsconfig.json
├── src/
│   ├── index.ts             barrel export
│   ├── client.ts            Sifter class
│   ├── sift-handle.ts       SiftHandle
│   ├── folder-handle.ts     FolderHandle
│   ├── events.ts            wildcard matcher + event types
│   ├── http.ts              thin fetch wrapper with auth + retry
│   └── types.ts             request/response types
├── test/
│   ├── client.test.ts
│   ├── sift-handle.test.ts
│   └── folder-handle.test.ts
└── README.md
```

### Runtime targets

- Node.js 18+ (native `fetch`)
- Modern browsers (the SDK has no Node-only deps)
- Edge runtimes (Vercel Edge, Cloudflare Workers)

### Public API (parity with Python SDK)

```ts
import { Sifter } from "@sifter-ai/sdk";

const s = new Sifter({
  apiUrl: "http://localhost:8000",  // default
  apiKey: process.env.SIFTER_API_KEY ?? "",
});

// Sift CRUD
const sift = await s.createSift({ name: "Invoices", instructions: "client, date, total" });
await s.getSift("sift_id");
await s.listSifts();
await sift.update({ name: "Invoices 2024" });
await sift.delete();

// Upload + wait + records
await sift.upload("./invoices/");            // Node.js path
await sift.upload([file1, file2]);            // browser File objects or Blobs
await sift.wait();
const records = await sift.records({ limit: 100, offset: 0 });
const result = await sift.query("total by client");
await sift.exportCsv("output.csv");           // Node.js only

// Structured query (added by CR-026)
await sift.find({ filter: { amount: { $gt: 1000 } }, limit: 50 });
await sift.aggregate([{ $group: { _id: "$client", total: { $sum: "$amount" } } }]);

// Folder CRUD
const folder = await s.createFolder({ name: "Contracts" });
await folder.upload("./contracts/");
await folder.addSift(sift);

// Events
sift.on("sift.document.processed", (doc, record) => console.log(record));
sift.on(["sift.completed", "sift.error"], handler);

// Webhooks
await s.registerHook({ events: "sift.*", url: "https://..." });
```

### Method naming

`snake_case` → `camelCase`. All other semantics preserved: same paths, same headers, same payload shapes.

### Upload semantics

Python uploads from a filesystem path. The TS SDK accepts:
- A filesystem path (Node.js only) — resolved via `fs/promises`
- A `File`, `Blob`, `ReadableStream`, or `Buffer`
- An array of the above for multi-upload

On browsers, filesystem paths are rejected at compile time via conditional types (or throw at runtime).

### HTTP layer

Thin wrapper over `fetch`:
- Injects `X-API-Key` header from config
- Retries transient errors (5xx, ECONNRESET) up to 3 times with exponential backoff
- Parses JSON responses; bubbles structured errors as `SifterError` with status + response body
- No external HTTP dependency (uses native `fetch` everywhere)

### Event callbacks

`sift.wait()` polls the server and fires registered callbacks. Wildcards match the same way as Python (`*` single segment, `**` any). Implementation uses a small recursive matcher.

### Typed schemas (linked to CR-028)

The SDK ships with a `SiftRecord<T = unknown>` generic. CR-028 adds a codegen step that produces typed interfaces per sift, so:

```ts
type Invoice = { client: string; date: string; total: number };
const records = await sift.records<Invoice>();
// records[0].client is typed string
```

This CR includes the generic plumbing; the codegen lives in CR-028.

### Errors

```ts
export class SifterError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string);
}
```

All SDK methods throw `SifterError` on non-2xx.

### package.json

```json
{
  "name": "@sifter-ai/sdk",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "engines": { "node": ">=18" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest",
    "lint": "eslint src"
  },
  "devDependencies": { "typescript": "^5", "vitest": "^1", "@types/node": "^20" }
}
```

Zero runtime dependencies.

### Tests

`vitest` with a mocked `fetch` global:
- One test per SDK method verifying URL, method, headers, body.
- Error bubbling (4xx/5xx → `SifterError`).
- Retry behavior (flaky 5xx → eventual success).
- Wildcard event matcher (same fixtures as Python).

### Publish pipeline

- `npm publish --access public` from `code/sdk-ts/` (gated by CI on tag push, future CR).
- For v0.1.0: manual publish. Automate after first stable release.

### Documentation

- `docs/sdk/typescript.mdx` — Mintlify page mirroring the Python SDK page.
- README in `code/sdk-ts/` for npm listing.

## Files

- `code/sdk-ts/package.json` — NEW
- `code/sdk-ts/tsconfig.json` — NEW
- `code/sdk-ts/src/index.ts` — NEW
- `code/sdk-ts/src/client.ts` — NEW
- `code/sdk-ts/src/sift-handle.ts` — NEW
- `code/sdk-ts/src/folder-handle.ts` — NEW
- `code/sdk-ts/src/events.ts` — NEW
- `code/sdk-ts/src/http.ts` — NEW
- `code/sdk-ts/src/types.ts` — NEW
- `code/sdk-ts/test/*.test.ts` — NEW
- `code/sdk-ts/README.md` — NEW
- `product/features/sdk/sdk-ts.md` — NEW
- `docs/sdk/typescript.mdx` — NEW

## Acceptance Criteria

1. `cd code/sdk-ts && npm install && npm run build` succeeds.
2. `npm test` passes.
3. Every method in the Python SDK has an equivalent in the TS SDK (verified by a checklist in `product/features/sdk/sdk-ts.md`).
4. SDK works from Node.js 18+ (smoke test in CI) and browser (smoke test via a tiny Vite demo).
5. `docs/sdk/typescript.mdx` shows a quickstart + full API reference.
6. Package builds to ESM with `.d.ts` declarations.

## Out of Scope

- Node < 18 support (no native fetch; polyfill burden not worth it).
- CommonJS output (ESM only; if demand arises, add dual export later).
- Typed schema generation (CR-028).
- CLI built on top of SDK (CR-025).
- Automated npm publish in CI (future CR).
