/**
 * 05 — Query and chat
 *
 * After extraction, query and chat with your data using natural language.
 *
 * Requirements:
 *   npx tsx 05_query_and_chat.ts
 *   # Sifter server running on localhost:8000
 *   # A sift with extracted records already exists (run 02_invoices.ts first)
 *   # SIFTER_API_KEY env var set
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

// ── Natural language query ────────────────────────────────────────────────────
console.log("=== Query: top 5 invoices by total amount ===");
const queryResult = await sift.query("Show me the 5 invoices with the highest total, sorted descending");
const results = (queryResult.results ?? []) as Array<Record<string, unknown>>;
for (const r of results.slice(0, 5)) {
  const data = (r["extracted_data"] as Record<string, unknown> | undefined) ?? r;
  const invoiceNo = (data["invoice_number"] as string) ?? "—";
  const total = (data["total"] as string | number) ?? "—";
  const currency = (data["currency"] as string) ?? "";
  console.log(`  ${invoiceNo.padEnd(15)} ${String(total).padStart(10)} ${currency}`);
}

// ── Chat ──────────────────────────────────────────────────────────────────────
console.log("\n=== Chat ===");

const questions = [
  "What is the total amount across all invoices?",
  "Which supplier invoiced the most?",
  "Are there any overdue invoices?",
];

for (const q of questions) {
  console.log(`\nQ: ${q}`);
  const answer = await sift.chat(q);
  console.log(`A: ${answer}`);
}
