"""
04 — Folder pipeline

A folder acts as an inbox: any document uploaded to it
is automatically processed by all linked sifts.

Use case: a shared receipts inbox processed by two sifts simultaneously —
one for accounting fields, one for vendor categorisation.

Requirements:
    pip install sifter-ai
    # Sifter server running on localhost:8000 (./run.sh)
"""
from sifter import Sifter

s = Sifter(api_key="sk-dev")

# Create the inbox folder
folder = s.create_folder(
    name="Receipts Inbox",
    description="Shared inbox for expense receipts",
)

# Sift 1: accounting fields
sift_accounting = s.create_sift(
    name="Receipts — Accounting",
    instructions="Extract: date, merchant name, amount, currency, payment method, vat_amount",
)

# Sift 2: expense category
sift_category = s.create_sift(
    name="Receipts — Category",
    instructions="""
    Categorise the receipt into one of: travel, meals, accommodation,
    software, hardware, office supplies, marketing, other.
    Also extract: merchant name, amount, category, category_reason (one sentence).
    """,
)

# Link both sifts to the folder
folder.add_sift(sift_accounting)
folder.add_sift(sift_category)

print(f"Folder '{folder.name}' linked to {len(folder.sifts())} sifts")

# Upload receipts — both sifts process every document automatically
folder.on(
    "folder.document.uploaded",
    lambda doc: print(f"  Uploaded: {doc.get('filename', doc.get('id'))}"),
)
folder.upload("./examples/receipts/")

print("\nWaiting for accounting extraction...")
sift_accounting.wait()

print("Waiting for category extraction...")
sift_category.wait()

# Merge results by document
accounting = {r.get("document_id"): r.get("extracted_data", {}) for r in sift_accounting.records()}
categories = {r.get("document_id"): r.get("extracted_data", {}) for r in sift_category.records()}

print("\nMerged results:")
for doc_id, acc in accounting.items():
    cat = categories.get(doc_id, {})
    merchant  = acc.get("merchant_name", cat.get("merchant_name", "—"))
    amount    = acc.get("amount", "—")
    currency  = acc.get("currency", "")
    category  = cat.get("category", "—")
    print(f"  {merchant:<30} {amount:>10} {currency:<4}  [{category}]")
