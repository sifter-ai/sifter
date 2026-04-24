/**
 * 06 — Webhooks
 *
 * Register a server-side webhook so Sifter POSTs to your endpoint
 * whenever a document is processed, discarded, or a sift completes.
 *
 * Each event payload includes a `status` field and, for processed
 * documents, the full `records` array with extracted fields.
 *
 * Requirements:
 *   npx tsx 06_webhooks.ts
 *   # Sifter server running on localhost:8000
 *   # SIFTER_API_KEY and SIFTER_API_URL env vars set
 */
import http from "http";
import { Sifter } from "@sifter-ai/sdk";

// ── Minimal webhook receiver ──────────────────────────────────────────────────

type WebhookRecord = {
  id: string;
  document_type: string;
  confidence: number;
  fields: Record<string, unknown>;
};

type WebhookPayload = {
  status?: string;
  document_id?: string;
  sift_id?: string;
  record_count?: number;
  records?: WebhookRecord[];
  reason?: string;
  error?: string;
};

type WebhookEvent = {
  event: string;
  payload: WebhookPayload;
};

const receivedEvents: WebhookEvent[] = [];

const server = http.createServer((req, res) => {
  if (req.method !== "POST") { res.end(); return; }
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    try {
      const event = JSON.parse(Buffer.concat(chunks).toString()) as WebhookEvent;
      receivedEvents.push(event);

      const { event: name, payload } = event;
      console.log(`\n[webhook] ${name}  status=${payload.status ?? "—"}  doc=${payload.document_id ?? "—"}`);

      if (name === "sift.document.processed") {
        for (const rec of payload.records ?? []) {
          console.log(`  record ${rec.id}  confidence=${(rec.confidence * 100).toFixed(0)}%`);
          for (const [k, v] of Object.entries(rec.fields)) {
            console.log(`    ${k}: ${v}`);
          }
        }
      } else if (name === "sift.document.discarded") {
        console.log(`  reason: ${payload.reason}`);
      } else if (name === "sift.error") {
        console.log(`  error: ${payload.error}`);
      }
    } catch { /* ignore malformed */ }
    res.writeHead(200).end();
  });
});

await new Promise<void>(resolve => server.listen(9000, resolve));
console.log("Webhook receiver listening on http://localhost:9000");

// ── Register webhook with Sifter ──────────────────────────────────────────────

const s = new Sifter();

const hook = await s.registerHook(
  ["sift.document.processed", "sift.document.discarded", "sift.completed", "sift.error"],
  "http://localhost:9000",
) as { id: string };
console.log(`Webhook registered: ${hook.id}`);

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
  console.log(`  ${ev.event}  status=${ev.payload.status ?? "—"}`);
}

// Cleanup
await s.deleteHook(hook.id);
await sift.delete();
server.close();
