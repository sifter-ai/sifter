/**
 * 03 — Contract analysis
 *
 * Extract key clauses and metadata from legal contracts.
 * Demonstrates callbacks to process each document as it completes.
 *
 * Requirements:
 *   npx tsx 03_contracts.ts
 *   # Sifter server running on localhost:8000
 *   # SIFTER_API_KEY env var set
 */
import { Sifter } from "@sifter-ai/sdk";
import type { SiftRecord } from "@sifter-ai/sdk";

const s = new Sifter();

const sift = await s.createSift(
  "Contracts Q1 TS",
  "These are legal contracts. Extract the contract type, the two parties involved, the effective and expiry dates, the governing law, how many days notice is required to terminate, whether it renews automatically, a brief summary of key obligations and any penalty clauses mentioned.",
);

// Track completion
const processed: unknown[] = [];

sift.on("sift.document.processed", (docId: unknown, record: unknown) => {
  const r = record as SiftRecord;
  const data = r.extracted_data ?? (record as Record<string, unknown>);
  const contractType = (data["contract_type"] as string) ?? "unknown";
  const partyA = (data["party_a"] as string) ?? "?";
  const partyB = (data["party_b"] as string) ?? "?";
  console.log(`  ✓ [${contractType}] ${partyA} ↔ ${partyB}`);
  processed.push(record);
});

sift.on("sift.completed", () => {
  console.log(`\nAll done — ${processed.length} contracts processed.`);
});

await sift.upload("../documents/contracts/", { onConflict: "replace" });
await sift.wait();

// Flag contracts expiring in the next 90 days
const threshold = new Date();
threshold.setDate(threshold.getDate() + 90);

const expiringSoon: Array<{ partyA: string; partyB: string; expiry: Date }> = [];

for await (const r of sift.iterRecords<SiftRecord>()) {
  const data = r.extracted_data ?? (r as unknown as Record<string, unknown>);
  const expiryStr = data["expiry_date"] as string | null;
  if (expiryStr) {
    try {
      const expiryDate = new Date(expiryStr);
      if (!isNaN(expiryDate.getTime()) && expiryDate <= threshold) {
        expiringSoon.push({
          partyA: (data["party_a"] as string) ?? "?",
          partyB: (data["party_b"] as string) ?? "?",
          expiry: expiryDate,
        });
      }
    } catch { /* skip */ }
  }
}

if (expiringSoon.length > 0) {
  console.log("\nContracts expiring within 90 days:");
  expiringSoon.sort((a, b) => a.expiry.getTime() - b.expiry.getTime());
  for (const { partyA, partyB, expiry } of expiringSoon) {
    console.log(`  ${expiry.toISOString().slice(0, 10)}  ${partyA} ↔ ${partyB}`);
  }
}
