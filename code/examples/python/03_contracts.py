"""
03 — Contract analysis

Extract key clauses and metadata from legal contracts.
Demonstrates callbacks to process each document as it completes.

Requirements:
    pip install sifter-ai
    # SIFTER_API_KEY env var set (default endpoint: https://sifter.run)
"""
from sifter import Sifter

s = Sifter()

sift = s.create_sift(
    name="Contracts Q1",
    instructions="These are legal contracts. Extract the contract type, the two parties involved, the effective and expiry dates, the governing law, how many days notice is required to terminate, whether it renews automatically, a brief summary of key obligations and any penalty clauses mentioned.",
)

# Track completion
processed = []

def on_document_done(doc_id: str, record: dict):
    data = record.get("extracted_data", record)
    contract_type = data.get("contract_type", "unknown")
    parties = f"{data.get('party_a', '?')} ↔ {data.get('party_b', '?')}"
    print(f"  ✓ [{contract_type}] {parties}")
    processed.append(record)

sift.on("sift.document.processed", on_document_done)
sift.on("sift.completed", lambda sift_id: print(f"\nAll done — {len(processed)} contracts processed."))

sift.upload("../documents/contracts/", on_conflict="replace")
sift.wait()

# Flag contracts expiring in the next 90 days
from datetime import date, timedelta
threshold = date.today() + timedelta(days=90)

expiring_soon = []
for r in sift.records():
    data = r.get("extracted_data", r)
    expiry = data.get("expiry_date")
    if expiry:
        try:
            expiry_date = date.fromisoformat(str(expiry))
            if expiry_date <= threshold:
                expiring_soon.append((data.get("party_a"), data.get("party_b"), expiry_date))
        except ValueError:
            pass

if expiring_soon:
    print("\nContracts expiring within 90 days:")
    for party_a, party_b, expiry in sorted(expiring_soon, key=lambda x: x[2]):
        print(f"  {expiry}  {party_a} ↔ {party_b}")
