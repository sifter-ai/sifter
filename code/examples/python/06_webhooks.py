"""
06 — Webhooks

Register a server-side webhook so Sifter POSTs to your endpoint
whenever a document is processed, discarded, or a sift completes.

Each event payload includes a `status` field and, for processed
documents, the full `records` array with extracted fields.

Requirements:
    uv run --project ../../sdk-python python 06_webhooks.py
    # Sifter server running on localhost:8000
    # Your webhook endpoint must be reachable from the Sifter server
    # SIFTER_API_KEY and SIFTER_API_URL env vars set
"""
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from sifter import Sifter

# ── Minimal webhook receiver ──────────────────────────────────────────────────

received_events: list[dict] = []

class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        event = json.loads(body)
        received_events.append(event)

        payload = event.get("payload", {})
        status  = payload.get("status", "—")
        doc_id  = payload.get("document_id", "—")
        name    = event.get("event", "—")

        print(f"\n[webhook] {name}  status={status}  doc={doc_id}")

        if name == "sift.document.processed":
            for rec in payload.get("records", []):
                print(f"  record {rec['id']}  confidence={rec['confidence']:.0%}")
                for k, v in rec.get("fields", {}).items():
                    print(f"    {k}: {v}")

        elif name == "sift.document.discarded":
            print(f"  reason: {payload.get('reason')}")

        elif name == "sift.error":
            print(f"  error: {payload.get('error')}")

        self.send_response(200)
        self.end_headers()

    def log_message(self, *args):
        pass  # suppress access log

server = HTTPServer(("0.0.0.0", 9000), WebhookHandler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
print("Webhook receiver listening on http://localhost:9000")

# ── Register webhook with Sifter ──────────────────────────────────────────────

s = Sifter()

hook = s.register_hook(
    events=["sift.document.processed", "sift.document.discarded", "sift.completed", "sift.error"],
    url="http://localhost:9000",  # must be reachable from the Sifter server
)
print(f"Webhook registered: {hook['id']}")

# ── Upload and process ────────────────────────────────────────────────────────

sift = s.create_sift(
    name="Webhook demo",
    instructions="Extract the document type, date, parties involved and key amount.",
)

sift.upload("../documents/invoices/", on_conflict="replace")
print("Processing... (webhook events will appear above)")
sift.wait()

print(f"\nTotal webhook events received: {len(received_events)}")
for ev in received_events:
    p = ev.get("payload", {})
    print(f"  {ev.get('event')}  status={p.get('status', '—')}")

# Cleanup
s.delete_hook(hook["id"])
sift.delete()
server.shutdown()
