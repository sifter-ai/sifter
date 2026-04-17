/**
 * 01 — Quickstart
 *
 * The fastest way to extract data from documents.
 * Upload a folder, wait for processing, get records.
 *
 * Requirements:
 *   npm install @sifter-ai/sdk
 *   npx tsx 01_quickstart.ts
 *   # Sifter server running on localhost:8000 (./run.sh)
 */
import { readdir, readFile } from "node:fs/promises";
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

const sift = await client.createSift(
  "Quickstart",
  "invoice number, client name, date, total amount, currency",
);

console.log(`Created sift: ${sift.id}`);

await uploadDir(sift.id, "./docs/");
console.log("Processing...");

await waitForSift(client, sift.id);

const records = await sift.records();
for (const r of records) {
  console.log(r);
}
