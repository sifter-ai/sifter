/**
 * 06 — Webhooks
 *
 * Register a server-side webhook so Sifter POSTs to your endpoint
 * whenever a document is processed or a sift completes.
 *
 * This example registers the hook, uploads documents, then
 * receives events via a minimal HTTP server.
 *
 * Requirements:
 *   npm install @sifter-ai/sdk
 *   npx tsx 06_webhooks.ts
 *   # Sifter server running on localhost:8000 (./run.sh)
 *   # Your webhook endpoint must be reachable from the Sifter server
 */
import { createServer } from "node:http";
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

async function registerWebhook(events: string[], url: string): Promise<{ id: string }> {
  const res = await fetch(`${API_URL}/api/webhooks`, {
    method: "POST",
    headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ events, url }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function deleteWebhook(hookId: string): Promise<void> {
  await fetch(`${API_URL}/api/webhooks/${hookId}`, {
    method: "DELETE",
    headers: { "X-API-Key": API_KEY },
  });
}

// ── Minimal webhook receiver ──────────────────────────────────────────────────

const receivedEvents: Array<Record<string, unknown>> = [];

const server = createServer((req, res) => {
  if (req.method !== "POST") { res.end(); return; }
  const chunks: Buffer[] = [];
  req.on("data", chunk => chunks.push(chunk));
  req.on("end", () => {
    const event = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
    receivedEvents.push(event);
    console.log(`\n[webhook] event=${event["event"]} doc=${event["document_id"] ?? "—"}`);
    res.writeHead(200).end();
  });
});

server.listen(9000, () => {
  console.log("Webhook receiver listening on http://localhost:9000");
});

// ── Register webhook with Sifter ──────────────────────────────────────────────

const hook = await registerWebhook(
  ["sift.document.processed", "sift.completed", "sift.error"],
  "http://localhost:9000",
);
console.log(`Webhook registered: ${hook.id}`);

// ── Upload and process ────────────────────────────────────────────────────────

const client = new SifterClient({ apiUrl: API_URL, apiKey: API_KEY });

const sift = await client.createSift(
  "Webhook demo",
  "Extract: document_type, date, parties involved, key amount",
);

await uploadDir(sift.id, "./docs/");
console.log("Processing... (webhook events will appear above)");
await waitForSift(client, sift.id);

console.log(`\nTotal webhook events received: ${receivedEvents.length}`);
for (const ev of receivedEvents) {
  console.log(`  ${ev["event"]}`);
}

// Cleanup
await deleteWebhook(hook.id);
await sift.delete();
server.close();
