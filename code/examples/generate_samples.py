"""
Generate sample PDF documents for testing the Sifter SDK examples.

Usage:
    cd code
    uv run python examples/generate_samples.py

Creates:
    examples/invoices/   - 3 sample invoices
    examples/contracts/  - 2 sample contracts
    examples/receipts/   - 3 sample receipts
    examples/docs/       - mixed documents (copy of the above)
"""
from fpdf import FPDF
from fpdf.enums import XPos, YPos
from pathlib import Path


def make_dirs():
    for d in ["invoices", "contracts", "receipts", "docs"]:
        Path(f"examples/{d}").mkdir(parents=True, exist_ok=True)


# ── PDF helpers ───────────────────────────────────────────────────────────────

class Doc(FPDF):
    def header(self):
        pass

    def h1(self, text: str):
        self.set_font("Helvetica", "B", 16)
        self.cell(0, 10, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(3)

    def h2(self, text: str):
        self.set_font("Helvetica", "B", 11)
        self.cell(0, 8, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def kv(self, label: str, value: str):
        self.set_font("Helvetica", "B", 10)
        self.cell(55, 7, label)
        self.set_font("Helvetica", "", 10)
        self.cell(0, 7, value, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def para(self, text: str, size: int = 10, style: str = ""):
        self.set_font("Helvetica", style, size)
        self.set_x(self.l_margin)
        self.multi_cell(self.w - self.l_margin - self.r_margin, 6, text)

    def divider(self):
        self.ln(3)
        self.set_draw_color(180, 180, 180)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(4)

    def table_row(self, cols: list[tuple[str, float, str]], height: int = 7, bold: bool = False):
        style = "B" if bold else ""
        self.set_font("Helvetica", style, 10)
        for text, width, align in cols:
            w = width if width > 0 else 0
            self.cell(w, height, text, align=align)
        self.ln()


def new_doc() -> Doc:
    p = Doc()
    p.add_page()
    p.set_margins(20, 20, 20)
    p.set_auto_page_break(auto=True, margin=20)
    return p


# ── Invoices ──────────────────────────────────────────────────────────────────

def make_invoices():
    invoices = [
        {
            "file": "invoices/invoice_2024_001.pdf",
            "number": "INV-2024-001",
            "supplier": "Acme Software Srl",
            "supplier_vat": "IT12345678901",
            "client": "Globex Corporation SpA",
            "client_vat": "IT98765432100",
            "issue_date": "2024-03-01",
            "due_date": "2024-03-31",
            "items": [
                ("Software license - annual", 1, 2400.00),
                ("Support package", 1, 600.00),
            ],
            "vat_rate": 22,
            "currency": "EUR",
            "payment": "Bank transfer - IBAN IT60 X054 2811 1010 0000 0123 456",
        },
        {
            "file": "invoices/invoice_2024_002.pdf",
            "number": "INV-2024-002",
            "supplier": "Studio Legale Bianchi e Partners",
            "supplier_vat": "IT55566677788",
            "client": "Initech Italia Srl",
            "client_vat": "IT11122233344",
            "issue_date": "2024-03-15",
            "due_date": "2024-04-14",
            "items": [
                ("Legal consultation March 2024", 8, 250.00),
                ("Document review", 3, 180.00),
            ],
            "vat_rate": 22,
            "currency": "EUR",
            "payment": "Bank transfer - IBAN IT60 Y054 2811 1010 0000 0987 654",
        },
        {
            "file": "invoices/invoice_2024_003.pdf",
            "number": "INV-2024-087",
            "supplier": "CloudHost Inc.",
            "supplier_vat": "US-EIN-47-1234567",
            "client": "Umbrella Corp Europe Ltd",
            "client_vat": "GB123456789",
            "issue_date": "2024-03-20",
            "due_date": "2024-04-20",
            "items": [
                ("Cloud hosting Pro plan (March)", 1, 499.00),
                ("Extra bandwidth 500 GB", 500, 0.10),
                ("Managed backup", 1, 79.00),
            ],
            "vat_rate": 0,
            "currency": "USD",
            "payment": "Credit card on file",
        },
    ]

    for inv in invoices:
        p = new_doc()
        p.h1("INVOICE")
        p.kv("Invoice Number:", inv["number"])
        p.kv("Issue Date:", inv["issue_date"])
        p.kv("Due Date:", inv["due_date"])
        p.divider()

        p.h2("From")
        p.para(inv["supplier"])
        p.para("VAT: " + inv["supplier_vat"])
        p.ln(3)
        p.h2("To")
        p.para(inv["client"])
        p.para("VAT: " + inv["client_vat"])
        p.divider()

        p.h2("Items")
        p.table_row([("Description", 95, "L"), ("Qty", 20, "R"), ("Unit Price", 35, "R"), ("Amount", 0, "R")], bold=True)
        p.set_draw_color(200, 200, 200)
        p.line(p.l_margin, p.get_y(), p.w - p.r_margin, p.get_y())
        p.ln(2)

        subtotal = 0.0
        for desc, qty, unit in inv["items"]:
            amount = qty * unit
            subtotal += amount
            p.table_row([
                (desc, 95, "L"),
                (str(qty), 20, "R"),
                (f"{unit:.2f}", 35, "R"),
                (f"{amount:.2f}", 0, "R"),
            ])

        p.divider()
        vat_amount = subtotal * inv["vat_rate"] / 100
        total = subtotal + vat_amount
        curr = inv["currency"]

        p.table_row([("Subtotal", 150, "R"), (f"{curr} {subtotal:.2f}", 0, "R")])
        p.table_row([(f"VAT ({inv['vat_rate']}%)", 150, "R"), (f"{curr} {vat_amount:.2f}", 0, "R")])
        p.table_row([("TOTAL", 150, "R"), (f"{curr} {total:.2f}", 0, "R")], bold=True)

        p.divider()
        p.h2("Payment Details")
        p.para(inv["payment"])

        p.output(f"examples/{inv['file']}")
        print(f"  created: examples/{inv['file']}")


# ── Contracts ─────────────────────────────────────────────────────────────────

def make_contracts():
    contracts = [
        {
            "file": "contracts/nda_acme_globex.pdf",
            "type": "NON-DISCLOSURE AGREEMENT (NDA)",
            "party_a": "Acme Software Srl, Via Roma 1, Milan, Italy",
            "party_b": "Globex Corporation SpA, Corso Europa 5, Turin, Italy",
            "effective": "2024-01-15",
            "expiry": "2026-01-14",
            "law": "Italian law - Court of Milan",
            "notice": "30 days written notice",
            "renewal": "Yes - renews automatically for 1-year terms",
            "obligations": (
                "Both parties agree to keep confidential any proprietary information, "
                "trade secrets, and business data shared during the course of their collaboration. "
                "Neither party may disclose such information to third parties without prior written consent. "
                "Obligations survive termination for 3 years."
            ),
            "penalties": (
                "Breach of this agreement shall entitle the non-breaching party to seek "
                "injunctive relief and liquidated damages of EUR 50,000 per incident."
            ),
        },
        {
            "file": "contracts/service_agreement_cloudhost.pdf",
            "type": "SERVICE AGREEMENT",
            "party_a": "CloudHost Inc., 100 Market Street, San Francisco, CA, USA",
            "party_b": "Umbrella Corp Europe Ltd, 1 Tower Bridge, London, UK",
            "effective": "2024-03-01",
            "expiry": "Indefinite",
            "law": "English law - Courts of England and Wales",
            "notice": "60 days written notice",
            "renewal": "Yes - continuous until terminated",
            "obligations": (
                "CloudHost Inc. shall provide cloud infrastructure services including compute, "
                "storage, and managed database services with guaranteed uptime of 99.9% per "
                "calendar month. Umbrella Corp Europe Ltd shall pay monthly fees as per the "
                "attached pricing schedule within 30 days of invoice date."
            ),
            "penalties": (
                "Service credits of 10% of the monthly fee apply for each hour of downtime "
                "exceeding the SLA threshold, capped at 30% of the monthly fee."
            ),
        },
    ]

    for c in contracts:
        p = new_doc()
        p.h1(c["type"])
        p.kv("Effective Date:", c["effective"])
        p.kv("Expiry Date:", c["expiry"])
        p.kv("Governing Law:", c["law"])
        p.kv("Termination Notice:", c["notice"])
        p.kv("Auto-renewal:", c["renewal"])
        p.divider()

        p.h2("Party A")
        p.para(c["party_a"])
        p.ln(3)
        p.h2("Party B")
        p.para(c["party_b"])
        p.divider()

        p.h2("Key Obligations")
        p.para(c["obligations"])
        p.ln(3)
        p.h2("Penalties / Liquidated Damages")
        p.para(c["penalties"])
        p.divider()

        p.h2("Signatures")
        p.ln(6)
        p.set_font("Helvetica", "", 10)
        p.cell(90, 7, "Party A: _______________________")
        p.cell(0, 7, "Party B: _______________________", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        p.ln(2)
        p.cell(90, 7, "Date: __________________________")
        p.cell(0, 7, "Date: __________________________", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        p.output(f"examples/{c['file']}")
        print(f"  created: examples/{c['file']}")


# ── Receipts ──────────────────────────────────────────────────────────────────

def make_receipts():
    receipts = [
        {
            "file": "receipts/receipt_hotel.pdf",
            "merchant": "Grand Hotel Milano",
            "date": "2024-03-12",
            "items": [
                ("Room Superior (2 nights)", 2, 180.00),
                ("Breakfast", 2, 25.00),
                ("Parking", 2, 20.00),
            ],
            "vat": 10,
            "payment": "Corporate Visa ****4321",
            "category": "accommodation / travel",
        },
        {
            "file": "receipts/receipt_dinner.pdf",
            "merchant": "Ristorante Da Luigi",
            "date": "2024-03-12",
            "items": [
                ("Business dinner (4 persons)", 4, 45.00),
                ("Wine selection", 2, 28.00),
            ],
            "vat": 10,
            "payment": "Corporate Amex ****8765",
            "category": "meals / entertainment",
        },
        {
            "file": "receipts/receipt_software.pdf",
            "merchant": "JetBrains s.r.o.",
            "date": "2024-03-18",
            "items": [
                ("All Products Pack 1 year license", 1, 779.00),
            ],
            "vat": 0,
            "payment": "Credit card ****1122",
            "category": "software",
        },
    ]

    for rec in receipts:
        p = new_doc()
        p.h1("RECEIPT")
        p.kv("Merchant:", rec["merchant"])
        p.kv("Date:", rec["date"])
        p.kv("Payment method:", rec["payment"])
        p.divider()

        subtotal = 0.0
        for desc, qty, unit in rec["items"]:
            amount = qty * unit
            subtotal += amount
            p.table_row([
                (desc, 110, "L"),
                (f"x{qty}", 20, "R"),
                (f"EUR {amount:.2f}", 0, "R"),
            ])

        p.divider()
        vat_amount = subtotal * rec["vat"] / 100
        total = subtotal + vat_amount
        p.table_row([(f"VAT ({rec['vat']}%)", 150, "R"), (f"EUR {vat_amount:.2f}", 0, "R")])
        p.table_row([("TOTAL", 150, "R"), (f"EUR {total:.2f}", 0, "R")], bold=True)
        p.divider()
        p.para("Expense category: " + rec["category"], style="I", size=9)

        p.output(f"examples/{rec['file']}")
        print(f"  created: examples/{rec['file']}")


# ── Mixed docs ────────────────────────────────────────────────────────────────

def make_docs():
    import shutil
    shutil.copy("examples/invoices/invoice_2024_001.pdf", "examples/docs/invoice_001.pdf")
    shutil.copy("examples/contracts/nda_acme_globex.pdf", "examples/docs/nda_acme_globex.pdf")
    shutil.copy("examples/receipts/receipt_hotel.pdf", "examples/docs/receipt_hotel.pdf")
    print("  created: examples/docs/ (3 mixed documents)")


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    make_dirs()
    print("Generating invoices...")
    make_invoices()
    print("Generating contracts...")
    make_contracts()
    print("Generating receipts...")
    make_receipts()
    print("Populating docs/...")
    make_docs()
    print("\nDone. Sample documents are in code/examples/")
