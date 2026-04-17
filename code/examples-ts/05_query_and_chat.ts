/**
 * 05 — Query and chat
 *
 * After extraction, query and chat with your data using natural language.
 *
 * Requirements:
 *   npm install @sifter-ai/sdk
 *   npx tsx 05_query_and_chat.ts
 *   # Sifter server running on localhost:8000 (./run.sh)
 *   # A sift with extracted records already exists (run 02_invoices.ts first)
 */
import { SifterClient } from "@sifter-ai/sdk";

const API_URL = "http://localhost:8000";
const API_KEY = "sk-dev";

async function chat(siftId: string, message: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/sifts/${siftId}/chat`, {
    method: "POST",
    headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json() as { message?: string; response?: string };
  return data.message ?? data.response ?? JSON.stringify(data);
}

const client = new SifterClient({ apiUrl: API_URL, apiKey: API_KEY });

// Get the first available sift (or specify an ID)
const sifts = await client.listSifts();
if (sifts.length === 0) {
  console.log("No sifts found. Run 02_invoices.ts first.");
  process.exit(1);
}

const sift = await client.getSift(sifts[0].id);
console.log(`Using sift: '${sift.name}' (${sift.id})\n`);

// ── Natural language query ────────────────────────────────────────────────────
console.log("=== Query: top 5 invoices by total amount ===");
const { results } = await sift.query("Show me the 5 invoices with the highest total, sorted descending");
const topInvoices = (results ?? []) as Array<Record<string, unknown>>;

for (const r of topInvoices.slice(0, 5)) {
  const data = (r["extracted_data"] ?? r) as Record<string, unknown>;
  const invoiceNo = String(data["invoice_number"] ?? "—");
  const total     = String(data["total"] ?? "—");
  const currency  = String(data["currency"] ?? "");
  console.log(`  ${invoiceNo.padEnd(15)} ${total.padStart(10)} ${currency}`);
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
  const answer = await chat(sift.id, q);
  console.log(`A: ${answer}`);
}
