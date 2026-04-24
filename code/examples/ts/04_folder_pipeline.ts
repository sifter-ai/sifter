/**
 * 04 — Folder pipeline
 *
 * A folder acts as an inbox: any document uploaded to it
 * is automatically processed by all linked sifts.
 *
 * Use case: a shared receipts inbox processed by two sifts simultaneously —
 * one for accounting fields, one for vendor categorisation.
 *
 * Requirements:
 *   npx tsx 04_folder_pipeline.ts
 *   # Sifter server running on localhost:8000
 *   # SIFTER_API_KEY env var set
 */
import { Sifter } from "@sifter-ai/sdk";
import type { SiftRecord } from "@sifter-ai/sdk";

const s = new Sifter();

// Create the inbox folder
const folder = await s.createFolder("/receipts-inbox-ts");

// Sift 1: accounting fields
const siftAccounting = await s.createSift(
  "Receipts — Accounting TS",
  "These are expense receipts. Extract the date, merchant name, total amount, currency, payment method and VAT amount from each one.",
);

// Sift 2: expense category
const siftCategory = await s.createSift(
  "Receipts — Category TS",
  "These are expense receipts. Categorise each one into: travel, meals, accommodation, software, hardware, office supplies, marketing, or other. Also extract the merchant name, amount, and a one-sentence reason for the category.",
);

// Link both sifts to the folder
await folder.addSift(siftAccounting);
await folder.addSift(siftCategory);

const { total } = await folder.sifts();
console.log(`Folder '${folder.name}' linked to ${total} sifts`);

// Upload receipts — both sifts process every document automatically
folder.on("folder.document.uploaded", (doc: unknown) => {
  const d = doc as Record<string, unknown>;
  console.log(`  Uploaded: ${d["filename"] ?? d["id"]}`);
});

await folder.upload("../documents/invoices/", { onConflict: "replace" });

console.log("\nWaiting for accounting extraction...");
await siftAccounting.wait();

console.log("Waiting for category extraction...");
await siftCategory.wait();

// Merge results by document
const accounting = new Map<string, Record<string, unknown>>();
for await (const r of siftAccounting.iterRecords<SiftRecord>()) {
  accounting.set(r.document_id, r.extracted_data ?? {});
}

const categories = new Map<string, Record<string, unknown>>();
for await (const r of siftCategory.iterRecords<SiftRecord>()) {
  categories.set(r.document_id, r.extracted_data ?? {});
}

console.log("\nMerged results:");
for (const [docId, acc] of accounting) {
  const cat = categories.get(docId) ?? {};
  const merchant = (acc["merchant_name"] ?? cat["merchant_name"] ?? "—") as string;
  const amount = (acc["amount"] ?? "—") as string;
  const currency = (acc["currency"] ?? "") as string;
  const category = (cat["category"] ?? "—") as string;
  console.log(`  ${merchant.padEnd(30)} ${String(amount).padStart(10)} ${currency.padEnd(4)}  [${category}]`);
}
