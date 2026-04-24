/**
 * 01 — Quickstart
 *
 * The fastest way to extract data from documents.
 * One call: upload a folder, wait, get records.
 *
 * Requirements:
 *   npx tsx 01_quickstart.ts
 *   # Sifter server running on localhost:8000
 *   # SIFTER_API_KEY env var set
 */
import { Sifter } from "@sifter-ai/sdk";

const s = new Sifter();

// One-liner: creates a temporary sift, uploads, waits, returns records, cleans up.
const records = await s.sift(
  "../documents/invoices/",
  "These are invoices. Extract the invoice number, supplier name, client, issue date, total amount and currency from each one.",
);

for (const r of records) {
  console.log(r);
}
