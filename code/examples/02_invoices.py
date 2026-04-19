"""
02 — Invoice extraction

Extract structured fields from a folder of invoices.
Exports results to CSV and prints a summary.

Requirements:
    pip install sifter-ai
    # Sifter server running on localhost:8000 (./run.sh)
"""
from sifter import Sifter

s = Sifter(api_key="sk-dev")

# Create a named sift that persists (not deleted after use)
sift = s.create_sift(
    name="Invoices 2024",
    instructions="""
    Extract the following fields from each invoice:
    - invoice_number: the invoice ID or reference number
    - supplier: name of the company issuing the invoice
    - client: name of the recipient company or person
    - issue_date: date the invoice was issued (ISO format YYYY-MM-DD)
    - due_date: payment due date (ISO format YYYY-MM-DD)
    - subtotal: amount before tax
    - vat_rate: VAT percentage (e.g. 22)
    - vat_amount: VAT in currency
    - total: final amount including tax
    - currency: 3-letter currency code (e.g. EUR, USD)
    - payment_method: bank transfer, credit card, etc. if mentioned
    """,
)

print(f"Created sift: {sift.id}")

# Upload all PDFs in the invoices folder
sift.upload("./examples/invoices/")

print("Processing...")
sift.wait()

# Iterate over all extracted records (handles pagination automatically)
records = list(sift.iter_records())
print(f"\nExtracted {len(records)} invoices:\n")

total_sum = 0.0
for r in records:
    data = r.get("extracted_data", r)
    invoice_no = data.get("invoice_number", "—")
    supplier   = data.get("supplier", "—")
    total      = data.get("total", 0)
    currency   = data.get("currency", "")
    print(f"  [{invoice_no}] {supplier} → {total} {currency}")
    try:
        total_sum += float(str(total).replace(",", "."))
    except (ValueError, TypeError):
        pass

print(f"\nTotal across all invoices: {total_sum:.2f}")

# Export to CSV
sift.export_csv("./examples/invoices_2024.csv")
print("\nExported to ./examples/invoices_2024.csv")
