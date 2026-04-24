"""
02 — Invoice extraction

Extract structured fields from a folder of invoices.
Exports results to CSV and prints a summary.

Requirements:
    pip install sifter-ai
    # SIFTER_API_KEY env var set (default endpoint: https://sifter.run)
"""
from sifter import Sifter

s = Sifter()

# Create a named sift that persists (not deleted after use)
sift = s.create_sift(
    name="Invoices 2024",
    instructions="These are invoices. Extract the invoice number, supplier name, client, issue date, due date, subtotal, VAT rate and amount, total, currency and payment method from each one.",
)

print(f"Created sift: {sift.id}")

# Upload all PDFs in the invoices folder
sift.upload("../documents/invoices/", on_conflict="replace")

print("Processing...")
sift.wait()

records = sift.records()
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
sift.export_csv("./invoices_2024.csv")
print("\nExported to ./invoices_2024.csv")
