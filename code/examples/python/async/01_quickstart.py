"""
01 — Quickstart (async)

Requirements:
    pip install sifter-ai
    SIFTER_API_KEY env var set
"""
import asyncio
from sifter import AsyncSifter


async def main():
    async with AsyncSifter() as s:
        records = await s.sift(
            "../../documents/invoices/",
            "These are invoices. Extract the invoice number, supplier name, client, issue date, total amount and currency from each one.",
        )
        for r in records:
            print(r)


asyncio.run(main())
