/**
 * 02 — Invoice extraction
 *
 * Extract structured fields from a folder of invoices.
 * Exports results to CSV and prints a summary.
 *
 * Requirements:
 *   npx tsx 02_invoices.ts
 *   # SIFTER_API_KEY env var set (default endpoint: https://sifter.run)
 *   # SIFTER_API_KEY env var set
 */
import { Sifter } from "@sifter-ai/sdk";
import type { SiftRecord } from "@sifter-ai/sdk";

const s = new Sifter();

// Create a named sift that persists (not deleted after use)
const sift = await s.createSift(
  "Invoices 2024 TS",
  "These are invoices. Extract the invoice number, supplier name, client, issue date, due date, subtotal, VAT rate and amount, total, currency and payment method from each one.",
);

console.log(`Created sift: ${sift.id}`);

// Upload all PDFs in the invoices folder
await sift.upload("../documents/invoices/", { onConflict: "replace" });

console.log("Processing...");
await sift.wait();

const records = await sift.records<SiftRecord>();
console.log(`\nExtracted ${records.length} invoices:\n`);

let totalSum = 0;
for (const r of records) {
  const data = r.extracted_data ?? r;
  const invoiceNo = (data["invoice_number"] as string) ?? "—";
  const supplier = (data["supplier"] as string) ?? "—";
  const total = data["total"];
  const currency = (data["currency"] as string) ?? "";
  console.log(`  [${invoiceNo}] ${supplier} → ${total} ${currency}`);
  try {
    totalSum += parseFloat(String(total).replace(",", "."));
  } catch { /* skip */ }
}

console.log(`\nTotal across all invoices: ${totalSum.toFixed(2)}`);

// Export to CSV
await sift.exportCsv("./invoices_2024_ts.csv");
console.log("\nExported to ../invoices_2024_ts.csv");
