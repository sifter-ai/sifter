"""
04 — Folder pipeline (async)

Two sifts process the same inbox concurrently using asyncio.gather.

Requirements:
    pip install sifter-ai
    SIFTER_API_KEY env var set
"""
import asyncio
from sifter import AsyncSifter


async def main():
    async with AsyncSifter() as s:
        folder = await s.create_folder("/receipts-inbox")

        sift_accounting, sift_category = await asyncio.gather(
            s.create_sift(
                name="Receipts — Accounting",
                instructions="Extract: date, merchant name, amount, currency, payment method, vat_amount",
            ),
            s.create_sift(
                name="Receipts — Category",
                instructions="These are expense receipts. Categorise each one into: travel, meals, accommodation, software, hardware, office supplies, marketing, or other. Also extract the merchant name, amount, and a one-sentence reason for the category.",
            ),
        )

        await asyncio.gather(
            folder.add_sift(sift_accounting),
            folder.add_sift(sift_category),
        )

        page = await folder.sifts()
        print(f"Folder '{folder.name}' linked to {page.total} sifts")

        folder.on(
            "folder.document.uploaded",
            lambda doc: print(f"  Uploaded: {doc.get('filename', doc.get('id'))}"),
        )
        await folder.upload("../../documents/invoices/", on_conflict="replace")

        print("\nWaiting for both extractions concurrently...")
        await asyncio.gather(sift_accounting.wait(), sift_category.wait())

        accounting_records, category_records = await asyncio.gather(
            sift_accounting.records(),
            sift_category.records(),
        )

        accounting = {r.get("document_id"): r.get("extracted_data", {}) for r in accounting_records}
        categories = {r.get("document_id"): r.get("extracted_data", {}) for r in category_records}

        print("\nMerged results:")
        for doc_id, acc in accounting.items():
            cat      = categories.get(doc_id, {})
            merchant = acc.get("merchant_name", cat.get("merchant_name", "—"))
            amount   = acc.get("amount", "—")
            currency = acc.get("currency", "")
            category = cat.get("category", "—")
            print(f"  {merchant:<30} {amount:>10} {currency:<4}  [{category}]")


asyncio.run(main())
