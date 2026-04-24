"""
07 — Citations

Every extracted field carries citation evidence: the exact text snippet
the model relied on, a confidence score, and (for PDFs) the page number.

This example shows two ways to access citations:
  1. Inline — citations are embedded in every record from sift.records()
  2. Drill-down — sift.record(record_id).citations() fetches a single record's map

Requirements:
    uv run --project ../../sdk-python python 07_citations.py
    # SIFTER_API_KEY and SIFTER_API_URL env vars set
"""
from sifter import Sifter

s = Sifter()

# ── Upload a small batch of invoices and wait ─────────────────────────────────

sift = s.create_sift(
    name="Citations demo",
    instructions="Extract supplier, invoice_date, total_amount and currency.",
)
sift.upload("../documents/invoices/INV-2025-001.pdf", on_conflict="replace")
sift.wait()

# ── 1. Inline citations ───────────────────────────────────────────────────────
# Every record returned by .records() already includes a `citations` dict.

records = sift.records()
print(f"Extracted {len(records)} record(s)\n")

for rec in records:
    print(f"Record {rec['id']}  (doc: {rec['document_id']})")
    print(f"  Fields: {rec['extracted_data']}\n")

    citations = rec.get("citations") or {}
    if not citations:
        print("  No citations (document may need reindexing)\n")
        continue

    for field, cit in citations.items():
        page_info = f"  page {cit['page']}" if cit.get("page") else ""
        inferred  = "  (inferred)" if cit.get("inferred") else ""
        confidence = f"{cit['confidence']:.0%}" if cit.get("confidence") is not None else "—"
        print(f"  {field}: \"{cit['source_text']}\"{page_info}{inferred}  [{confidence}]")
    print()

# ── 2. Drill-down via RecordHandle ────────────────────────────────────────────
# Useful when you already have a record_id and don't want to re-fetch all records.

if records:
    record_id = records[0]["id"]
    handle = sift.record(record_id)
    cit_response = handle.citations()

    print(f"── Drill-down citations for {record_id} ──")
    for field, cit in (cit_response.get("citations") or {}).items():
        page_info = f"  page {cit['page']}" if cit.get("page") else ""
        print(f"  {field}: \"{cit['source_text']}\"{page_info}")
    print()

# Cleanup
sift.delete()
