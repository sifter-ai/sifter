/**
 * 06 — Webhooks
 *
 * Register a server-side webhook so Sifter POSTs to your endpoint
 * whenever a document is processed or a sift completes.
 *
 * This example registers the hook, uploads documents, then
 * simulates receiving events via a minimal HTTP server.
 *
 * Requirements:
 *   npx tsx 06_webhooks.ts
 *   # Sifter server running on localhost:8000
 *   # Your webhook endpoint must be reachable from the Sifter server
 *   # SIFTER_API_KEY env var set
 */
import http from "http";
import { Sifter } from "@sifter-ai/sdk";

// ── Minimal webhook receiver ──────────────────────────────────────────────────

const receivedEvents: Array<Record<string, unknown>> = [];

const server = http.createServer((req, res) => {
  if (req.method !== "POST") { res.end(); return; }
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    try {
      const event = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
      receivedEvents.push(event);
      const payload = (event["payload"] as Record<string, unknown> | undefined) ?? {};
      const docId = (payload["document_id"] as string) ?? "—";
      console.log(`\n[webhook] event=${event["event"]} doc=${docId}`);
    } catch { /* ignore malformed */ }
    res.writeHead(200).end();
  });
});

await new Promise<void>(resolve => server.listen(9000, resolve));
console.log("Webhook receiver listening on http://localhost:9000");

// ── Register webhook with Sifter ──────────────────────────────────────────────

const s = new Sifter();

const hook = await s.registerHook(
  ["sift.document.processed", "sift.completed", "sift.error"],
  "http://localhost:9000",
);
console.log(`Webhook registered: ${(hook as { id: string }).id}`);

// ── Upload and process ────────────────────────────────────────────────────────

const sift = await s.createSift(
  "Webhook demo TS",
  "Extract the document type, date, parties involved and key amount.",
);

await sift.upload("../documents/invoices/", { onConflict: "replace" });
console.log("Processing... (webhook events will appear above)");
await sift.wait();

console.log(`\nTotal webhook events received: ${receivedEvents.length}`);
for (const ev of receivedEvents) {
  console.log(`  ${ev["event"]}`);
}

// Cleanup
await s.deleteHook((hook as { id: string }).id);
await sift.delete();
server.close();
