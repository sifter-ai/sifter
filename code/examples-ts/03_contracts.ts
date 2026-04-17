/**
 * 03 — Contract analysis
 *
 * Extract key clauses and metadata from legal contracts.
 * Polls for progress and flags contracts expiring within 90 days.
 *
 * Requirements:
 *   npm install @sifter-ai/sdk
 *   npx tsx 03_contracts.ts
 *   # Sifter server running on localhost:8000 (./run.sh)
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { SifterClient, type SiftRecord } from "@sifter-ai/sdk";

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

// Poll with progress: fires onDocument each time a new record appears
async function waitWithProgress(
  client: SifterClient,
  siftId: string,
  onDocument: (record: SiftRecord) => void,
): Promise<void> {
  const seen = new Set<string>();

  while (true) {
    const sift = await client.getSift(siftId);

    // Check for newly completed records on every tick
    const records = await sift.records();
    for (const r of records) {
      if (!seen.has(r.document_id)) {
        seen.add(r.document_id);
        onDocument(r);
      }
    }

    if (sift.status !== "indexing") {
      if (sift.status === "error") throw new Error("Extraction failed");
      console.log(`\nAll done — ${seen.size} contracts processed.`);
      return;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}

const client = new SifterClient({ apiUrl: API_URL, apiKey: API_KEY });

const sift = await client.createSift(
  "Contracts Q1",
  `
  Extract the following from each contract:
  - contract_type: e.g. NDA, service agreement, employment, supply
  - party_a: first party (full legal name)
  - party_b: second party (full legal name)
  - effective_date: when the contract takes effect (YYYY-MM-DD)
  - expiry_date: when it expires, if specified (YYYY-MM-DD or null)
  - governing_law: jurisdiction / applicable law
  - termination_notice_days: days notice required to terminate, if stated
  - auto_renewal: true/false — does it renew automatically?
  - key_obligations: brief summary of main obligations (max 2 sentences)
  - penalty_clauses: any penalties or liquidated damages mentioned (or null)
  `,
);

await uploadDir(sift.id, "./contracts/");

await waitWithProgress(client, sift.id, (record) => {
  const data = (record.extracted_data ?? record) as Record<string, unknown>;
  const contractType = data["contract_type"] ?? "unknown";
  const parties = `${data["party_a"] ?? "?"} ↔ ${data["party_b"] ?? "?"}`;
  console.log(`  ✓ [${contractType}] ${parties}`);
});

// Flag contracts expiring in the next 90 days
const threshold = new Date();
threshold.setDate(threshold.getDate() + 90);

const expiringSoon: Array<{ partyA: string; partyB: string; expiry: Date }> = [];

const records = await sift.records();
for (const r of records) {
  const data = (r.extracted_data ?? r) as Record<string, unknown>;
  const expiryStr = data["expiry_date"];
  if (expiryStr) {
    const expiry = new Date(String(expiryStr));
    if (!isNaN(expiry.getTime()) && expiry <= threshold) {
      expiringSoon.push({
        partyA: String(data["party_a"] ?? ""),
        partyB: String(data["party_b"] ?? ""),
        expiry,
      });
    }
  }
}

if (expiringSoon.length > 0) {
  console.log("\nContracts expiring within 90 days:");
  expiringSoon
    .sort((a, b) => a.expiry.getTime() - b.expiry.getTime())
    .forEach(({ partyA, partyB, expiry }) => {
      console.log(`  ${expiry.toISOString().slice(0, 10)}  ${partyA} ↔ ${partyB}`);
    });
}
