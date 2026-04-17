/**
 * 02 — Invoice extraction
 *
 * Extract structured fields from a folder of invoices.
 * Exports results to CSV and prints a summary.
 *
 * Requirements:
 *   npm install @sifter-ai/sdk
 *   npx tsx 02_invoices.ts
 *   # Sifter server running on localhost:8000 (./run.sh)
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SifterClient } from "@sifter-ai/sdk";

const API_URL = "http://localhost:8000";
const API_KEY = "sk-dev";

async function uploadDir(siftId: string, dirPath: string): Promise<void> {
  const filenames = (await readdir(dirPath)).filter(f => !f.startsWith("."));
  const form = new FormData();
  for (const filename of filenames) {
    const bytes = await readFile(join(dirPath, filename));
    form.append("files", new Blob([bytes]), filename);
  }
  const res = await fetch(`${API_URL}/api/sifts/${siftId}/upload`, {
    method: "POST",
    headers: { "X-API-Key": API_KEY },
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
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

// Create a named sift that persists (not deleted after use)
const sift = await client.createSift(
  "Invoices 2024",
  `
  Extract the following fields from each invoice:
  - invoice_number: the invoice ID or reference number
  - supplier: name of the company issuing the invoice
  - client: name of the recipient company or person
  - issue_date: date the invoice was issued (ISO format YYYY-MM-DD)
  - due_date: payment due date (ISO format YYYY-MM-DD)
  - subtotal: amount before tax
  - vat_rate: VAT percentage (e.g. 22)
  - vat_amount: VAT in currency
  - total: final amount including tax
  - currency: 3-letter currency code (e.g. EUR, USD)
  - payment_method: bank transfer, credit card, etc. if mentioned
  `,
);

console.log(`Created sift: ${sift.id}`);

// Upload all PDFs in the invoices folder
await uploadDir(sift.id, "./invoices/");

console.log("Processing...");
await waitForSift(client, sift.id);

// Get all extracted records
const records = await sift.records();
console.log(`\nExtracted ${records.length} invoices:\n`);

let totalSum = 0;
for (const r of records) {
  const data = (r.extracted_data ?? r) as Record<string, unknown>;
  const invoiceNo = data["invoice_number"] ?? "—";
  const supplier  = data["supplier"] ?? "—";
  const total     = data["total"] ?? 0;
  const currency  = data["currency"] ?? "";
  console.log(`  [${invoiceNo}] ${supplier} → ${total} ${currency}`);
  const num = parseFloat(String(total).replace(",", "."));
  if (!isNaN(num)) totalSum += num;
}

console.log(`\nTotal across all invoices: ${totalSum.toFixed(2)}`);

// Export to CSV
const csv = await sift.exportCsv();
await writeFile("./invoices_2024.csv", csv, "utf-8");
console.log("\nExported to ./invoices_2024.csv");
