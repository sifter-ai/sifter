/**
 * 07 — Citations
 *
 * Every extracted field carries citation evidence: the exact text snippet
 * the model relied on, a confidence score, and (for PDFs) the page number.
 *
 * This example shows how to read inline citations from sift.records() —
 * they are embedded in every SiftRecord without an extra API call.
 *
 * Requirements:
 *   npx tsx 07_citations.ts
 *   # SIFTER_API_KEY and SIFTER_API_URL env vars set
 */
import { Sifter, type SiftRecord, type Citation } from "@sifter-ai/sdk";
// RecordHandle is returned by sift.record(id) — no separate import needed

const s = new Sifter();

// ── Upload a single invoice and wait ─────────────────────────────────────────

const sift = await s.createSift(
  "Citations demo TS",
  "Extract supplier, invoice_date, total_amount and currency.",
);
await sift.upload("../documents/invoices/INV-2025-001.pdf", { onConflict: "replace" });
await sift.wait();

// ── Read inline citations ─────────────────────────────────────────────────────
// Every record from sift.records() already includes a `citations` map.

const records = await sift.records<SiftRecord>();
console.log(`Extracted ${records.length} record(s)\n`);

for (const rec of records) {
  console.log(`Record ${rec.id}  (doc: ${rec.document_id})`);
  console.log(`  Fields: ${JSON.stringify(rec.extracted_data)}\n`);

  const citations = rec.citations ?? {};
  const fields = Object.keys(citations);

  if (fields.length === 0) {
    console.log("  No citations (document may need reindexing)\n");
    continue;
  }

  for (const field of fields) {
    const cit: Citation = citations[field]!;
    const pageInfo   = cit.page != null ? `  page ${cit.page}` : "";
    const inferred   = cit.inferred ? "  (inferred)" : "";
    const confidence = cit.confidence != null ? `${(cit.confidence * 100).toFixed(0)}%` : "—";
    console.log(`  ${field}: "${cit.source_text}"${pageInfo}${inferred}  [${confidence}]`);
  }
  console.log();
}

// ── Drill-down via record().citations() ──────────────────────────────────────
// Useful when you already have a record_id and don't need to re-fetch all records.

if (records.length > 0) {
  const recordId = records[0]!.id;
  const handle = sift.record(recordId);
  const citResponse = await handle.citations();

  console.log(`── Drill-down citations for ${recordId} ──`);
  for (const [field, cit] of Object.entries(citResponse.citations ?? {})) {
    const pageInfo = cit.page != null ? `  page ${cit.page}` : "";
    console.log(`  ${field}: "${cit.source_text}"${pageInfo}`);
  }
  console.log();
}

// Cleanup
await sift.delete();
