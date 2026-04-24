"""
05 — Natural language query

After extraction, query your data using natural language.
Sifter translates the query into a MongoDB aggregation pipeline and returns exact results.

Requirements:
    pip install sifter-ai
    # SIFTER_API_KEY env var set (default endpoint: https://sifter.run)
    # A sift with extracted records already exists (run 02_invoices.py first)
"""
from sifter import Sifter

s = Sifter()

# Find the "Invoices 2024" sift created by 02_invoices.py
sifts_page = s.list_sifts(limit=100)
if not sifts_page.items:
    print("No sifts found. Run 02_invoices.py first.")
    exit(1)

target = next(
    (s for s in sifts_page.items if "invoices" in s.get("name", "").lower()),
    sifts_page.items[0],
)
sift = s.get_sift(target["id"])
print(f"Using sift: '{sift.name}' ({sift.id})\n")

# ── Natural language queries ──────────────────────────────────────────────────
queries = [
    "Show me the 5 invoices with the highest total, sorted descending",
    "What is the total amount across all invoices?",
    "Which supplier invoiced the most?",
]

for q in queries:
    print(f"Q: {q}")
    results = sift.query(q)
    for r in results[:5]:
        data = r.get("extracted_data", r)
        invoice_no = data.get("invoice_number", "—")
        supplier   = data.get("supplier", "—")
        total      = data.get("total", "—")
        currency   = data.get("currency", "")
        print(f"  {invoice_no:<15} {supplier:<25} {total} {currency}")
    print()
