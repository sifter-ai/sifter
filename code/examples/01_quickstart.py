"""
01 — Quickstart

The fastest way to extract data from documents.
One call: upload a folder, wait, get records.

Requirements:
    pip install sifter-ai
    # Sifter server running on localhost:8000 (./run.sh)
"""
from sifter import Sifter

s = Sifter(api_key="sk-dev")

# One-liner: creates a temporary sift, uploads, waits, returns records, cleans up.
records = s.sift("./examples/docs/", "invoice number, client name, date, total amount, currency")

for r in records:
    print(r)
