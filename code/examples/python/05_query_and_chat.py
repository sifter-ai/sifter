"""
05 — Query and chat

After extraction, query and chat with your data using natural language.

Requirements:
    pip install sifter-ai httpx
    # Sifter server running on localhost:8000 (./run.sh)
    # A sift with extracted records already exists (run 02_invoices.py first)
"""
import httpx
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

# ── Natural language query ────────────────────────────────────────────────────
print("=== Query: top 5 invoices by total amount ===")
results = sift.query("Show me the 5 invoices with the highest total, sorted descending")
for r in results[:5]:
    data = r.get("extracted_data", r)
    print(f"  {data.get('invoice_number', '—'):<15} {data.get('total', '—'):>10} {data.get('currency', '')}")

# ── Chat ──────────────────────────────────────────────────────────────────────
print("\n=== Chat ===")

def chat(sift_id: str, message: str, api_key: str = "") -> str:
    """Send a chat message to a specific sift and return the text response."""
    import os
    key = api_key or os.environ.get("SIFTER_API_KEY", "")
    with httpx.Client(timeout=60.0) as http:
        r = http.post(
            f"http://localhost:8000/api/sifts/{sift_id}/chat",
            headers={"X-API-Key": key},
            json={"message": message},
        )
        r.raise_for_status()
        data = r.json()
        return data.get("message") or data.get("response") or str(data)

questions = [
    "What is the total amount across all invoices?",
    "Which supplier invoiced the most?",
    "Are there any overdue invoices?",
]

for q in questions:
    print(f"\nQ: {q}")
    answer = chat(sift.id, q)
    print(f"A: {answer}")
