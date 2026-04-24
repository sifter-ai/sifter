/**
 * 05 — Natural language query
 *
 * After extraction, query your data using natural language.
 * Sifter translates the query into a MongoDB aggregation pipeline and returns exact results.
 *
 * Requirements:
 *   npx tsx 05_query_and_chat.ts
 *   # SIFTER_API_KEY env var set (default endpoint: https://sifter.run)
 *   # A sift with extracted records already exists (run 02_invoices.ts first)
 */
import { Sifter } from "@sifter-ai/sdk";
import type { SiftData } from "@sifter-ai/sdk";

const s = new Sifter();

// Find the "Invoices 2024" sift created by 02_invoices.ts
const sifts = await s.listSifts(100);
if (!sifts.length) {
  console.log("No sifts found. Run 02_invoices.ts first.");
  process.exit(1);
}

const target: SiftData | undefined =
  sifts.find(s => s.name.toLowerCase().includes("invoices") && s.name.toLowerCase().includes("ts")) ??
  sifts.find(s => s.name.toLowerCase().includes("invoices")) ??
  sifts[0];

const sift = await s.getSift(target!.id);
console.log(`Using sift: '${sift.name}' (${sift.id})\n`);

// ── Natural language queries ──────────────────────────────────────────────────

const queries = [
  "Show me the 5 invoices with the highest total, sorted descending",
  "What is the total amount across all invoices?",
  "Which supplier invoiced the most?",
];

for (const q of queries) {
  console.log(`Q: ${q}`);
  const queryResult = await sift.query(q);
  const results = (queryResult.results ?? []) as Array<Record<string, unknown>>;
  for (const r of results.slice(0, 5)) {
    const data = (r["extracted_data"] as Record<string, unknown> | undefined) ?? r;
    const invoiceNo = String(data["invoice_number"] ?? "—").padEnd(15);
    const supplier  = String(data["supplier"] ?? "—").padEnd(25);
    const total     = String(data["total"] ?? "—").padStart(10);
    const currency  = String(data["currency"] ?? "");
    console.log(`  ${invoiceNo} ${supplier} ${total} ${currency}`);
  }
  console.log();
}
