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
 *   npm install @sifter-ai/sdk
 *   npx tsx 04_folder_pipeline.ts
 *   # Sifter server running on localhost:8000 (./run.sh)
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { SifterClient } from "@sifter-ai/sdk";

const API_URL = "http://localhost:8000";
const API_KEY = "sk-dev";

async function uploadToFolder(folderId: string, dirPath: string): Promise<void> {
  const filenames = (await readdir(dirPath)).filter(f => !f.startsWith("."));
  for (const filename of filenames) {
    const bytes = await readFile(join(dirPath, filename));
    const form = new FormData();
    form.append("file", new Blob([bytes]), filename);
    const res = await fetch(`${API_URL}/api/folders/${folderId}/documents`, {
      method: "POST",
      headers: { "X-API-Key": API_KEY },
      body: form,
    });
    if (!res.ok) throw new Error(await res.text());
    const doc = await res.json() as { filename?: string; id?: string };
    console.log(`  Uploaded: ${doc.filename ?? doc.id}`);
  }
}

async function waitForSift(client: SifterClient, siftId: string): Promise<void> {
  while (true) {
    const sift = await client.getSift(siftId);
    if (sift.status !== "indexing") {
      if (sift.status === "error") throw new Error("Extraction failed");
      return;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}

const client = new SifterClient({ apiUrl: API_URL, apiKey: API_KEY });

// Create the inbox folder
const folder = await client.createFolder(
  "Receipts Inbox",
  "Shared inbox for expense receipts",
);

// Sift 1: accounting fields
const siftAccounting = await client.createSift(
  "Receipts — Accounting",
  "Extract: date, merchant name, amount, currency, payment method, vat_amount",
);

// Sift 2: expense category
const siftCategory = await client.createSift(
  "Receipts — Category",
  `
  Categorise the receipt into one of: travel, meals, accommodation,
  software, hardware, office supplies, marketing, other.
  Also extract: merchant name, amount, category, category_reason (one sentence).
  `,
);

// Link both sifts to the folder
await folder.addSift(siftAccounting);
await folder.addSift(siftCategory);

const linkedSifts = await folder.sifts();
console.log(`Folder '${folder.name}' linked to ${linkedSifts.length} sifts`);

// Upload receipts — both sifts process every document automatically
await uploadToFolder(folder.id, "./receipts/");

console.log("\nWaiting for accounting extraction...");
await waitForSift(client, siftAccounting.id);

console.log("Waiting for category extraction...");
await waitForSift(client, siftCategory.id);

// Merge results by document
const accountingRecords = await siftAccounting.records();
const categoryRecords   = await siftCategory.records();

const accounting = new Map(
  accountingRecords.map(r => [r.document_id, r.extracted_data as Record<string, unknown>]),
);
const categories = new Map(
  categoryRecords.map(r => [r.document_id, r.extracted_data as Record<string, unknown>]),
);

console.log("\nMerged results:");
for (const [docId, acc] of accounting) {
  const cat      = categories.get(docId) ?? {};
  const merchant = String(acc["merchant_name"] ?? cat["merchant_name"] ?? "—");
  const amount   = String(acc["amount"] ?? "—");
  const currency = String(acc["currency"] ?? "");
  const category = String(cat["category"] ?? "—");
  console.log(`  ${merchant.padEnd(30)} ${amount.padStart(10)} ${currency.padEnd(4)}  [${category}]`);
}
