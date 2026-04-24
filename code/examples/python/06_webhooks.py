"""
06 — Webhooks

Register a server-side webhook so Sifter POSTs to your endpoint
whenever a document is processed or a sift completes.

This example registers the hook, uploads documents, then
simulates receiving events via a minimal HTTP server.

Requirements:
    pip install sifter-ai httpx
    # Sifter server running on localhost:8000 (./run.sh)
    # Your webhook endpoint must be reachable from the Sifter server
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
        payload = event.get('payload', {})
        doc_id = payload.get('document_id', '—')
        print(f"\n[webhook] event={event.get('event')} doc={doc_id}")
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
    events=["sift.document.processed", "sift.completed", "sift.error"],
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
    print(f"  {ev.get('event')}")

# Cleanup
s.delete_hook(hook["id"])
sift.delete()
server.shutdown()
