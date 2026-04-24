"""
01 — Quickstart

The fastest way to extract data from documents.
One call: upload a folder, wait, get records.

Requirements:
    pip install sifter-ai
    # Sifter server running on localhost:8000 (./run.sh)
"""
from sifter import Sifter

s = Sifter()

# One-liner: creates a temporary sift, uploads, waits, returns records, cleans up.
records = s.sift("../documents/invoices/", "These are invoices. Extract the invoice number, supplier name, client, issue date, total amount and currency from each one.")

for r in records:
    print(r)
