"""
03 — Contract analysis

Extract key clauses and metadata from legal contracts.
Demonstrates callbacks to process each document as it completes.

Requirements:
    pip install sifter-ai
    # Sifter server running on localhost:8000 (./run.sh)
"""
from sifter import Sifter

s = Sifter(api_key="sk-dev")

sift = s.create_sift(
    name="Contracts Q1",
    instructions="""
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
    """,
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

sift.upload("./examples/contracts/")
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
