"""
Generate 5 realistic test contracts as PDF files using reportlab.
"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable, Table, TableStyle
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))


def make_styles():
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        name="ContractTitle",
        fontSize=18,
        fontName="Helvetica-Bold",
        alignment=TA_CENTER,
        spaceAfter=6,
        textColor=colors.HexColor("#1a1a2e"),
    ))
    styles.add(ParagraphStyle(
        name="SubTitle",
        fontSize=11,
        fontName="Helvetica",
        alignment=TA_CENTER,
        spaceAfter=18,
        textColor=colors.HexColor("#444444"),
    ))
    styles.add(ParagraphStyle(
        name="SectionHeader",
        fontSize=11,
        fontName="Helvetica-Bold",
        spaceBefore=14,
        spaceAfter=4,
        textColor=colors.HexColor("#1a1a2e"),
    ))
    styles.add(ParagraphStyle(
        name="BodyText2",
        fontSize=9.5,
        fontName="Helvetica",
        alignment=TA_JUSTIFY,
        spaceBefore=2,
        spaceAfter=4,
        leading=14,
    ))
    styles.add(ParagraphStyle(
        name="FieldLabel",
        fontSize=9,
        fontName="Helvetica-Bold",
        spaceBefore=3,
        spaceAfter=1,
    ))
    styles.add(ParagraphStyle(
        name="SignatureLabel",
        fontSize=9,
        fontName="Helvetica",
        spaceBefore=2,
    ))
    return styles


def hr():
    return HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cccccc"), spaceAfter=6, spaceBefore=6)


def section(title, styles):
    return Paragraph(title, styles["SectionHeader"])


def body(text, styles):
    return Paragraph(text, styles["BodyText2"])


def field(label, value, styles):
    return Paragraph(f"<b>{label}:</b> {value}", styles["BodyText2"])


def parties_table(party_a, party_b, styles):
    data = [
        [Paragraph("<b>PARTY A</b>", styles["BodyText2"]),
         Paragraph("<b>PARTY B</b>", styles["BodyText2"])],
        [Paragraph(party_a, styles["BodyText2"]),
         Paragraph(party_b, styles["BodyText2"])],
    ]
    t = Table(data, colWidths=[8.5 * cm, 8.5 * cm])
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#aaaaaa")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8eaf6")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def signature_table(party_a_name, party_b_name, styles):
    line = "___________________________"
    data = [
        [Paragraph("<b>For Party A</b>", styles["BodyText2"]),
         Paragraph("<b>For Party B</b>", styles["BodyText2"])],
        [Paragraph(f"{party_a_name}<br/>{line}<br/>Authorised Signatory<br/>Date: ____________", styles["SignatureLabel"]),
         Paragraph(f"{party_b_name}<br/>{line}<br/>Authorised Signatory<br/>Date: ____________", styles["SignatureLabel"])],
    ]
    t = Table(data, colWidths=[8.5 * cm, 8.5 * cm])
    t.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.HexColor("#aaaaaa")),
    ]))
    return t


def build_pdf(filename, story):
    path = os.path.join(OUTPUT_DIR, filename)
    doc = SimpleDocTemplate(
        path,
        pagesize=A4,
        rightMargin=2.5 * cm,
        leftMargin=2.5 * cm,
        topMargin=2.5 * cm,
        bottomMargin=2.5 * cm,
    )
    doc.build(story)
    print(f"  Created: {path}")


# ─────────────────────────────────────────────
# CONTRACT 1 — NDA (UK law, 30 days notice, no auto-renewal, no penalty)
# ─────────────────────────────────────────────
def contract_001(styles):
    story = []
    story.append(Paragraph("NON-DISCLOSURE AGREEMENT", styles["ContractTitle"]))
    story.append(Paragraph("Strictly Confidential", styles["SubTitle"]))
    story.append(hr())

    story.append(section("1. PARTIES", styles))
    story.append(Spacer(1, 4))
    story.append(parties_table(
        "Meridian Analytics Ltd\n20 King Street, London EC2V 8EH, United Kingdom\nCompany No. 09872341",
        "DataVault GmbH\nKarl-Marx-Allee 82, 10243 Berlin, Germany\nHRB 178432 B",
        styles
    ))

    story.append(section("2. KEY TERMS", styles))
    story.append(field("Contract Type", "Non-Disclosure Agreement (Mutual)", styles))
    story.append(field("Effective Date", "1 March 2024", styles))
    story.append(field("Expiry Date", "28 February 2026 (no auto-renewal)", styles))
    story.append(field("Governing Law", "Laws of England and Wales", styles))
    story.append(field("Jurisdiction", "Courts of England and Wales", styles))
    story.append(field("Termination Notice", "30 days written notice", styles))
    story.append(field("Auto-Renewal", "No", styles))

    story.append(section("3. PURPOSE", styles))
    story.append(body(
        "The Parties intend to explore a potential business collaboration relating to the "
        "development and commercialisation of data analytics products and services. In the course "
        "of such discussions, each Party may disclose confidential information to the other.",
        styles
    ))

    story.append(section("4. KEY OBLIGATIONS", styles))
    story.append(body(
        "Each receiving Party shall: (i) hold all Confidential Information in strict confidence "
        "and not disclose it to any third party without the prior written consent of the disclosing "
        "Party; (ii) use the Confidential Information solely for the Purpose and not for any "
        "commercial exploitation; (iii) restrict access to Confidential Information to employees "
        "or advisors who have a genuine need to know and are bound by equivalent obligations of "
        "confidentiality; and (iv) promptly notify the disclosing Party upon becoming aware of any "
        "actual or suspected breach of this Agreement.",
        styles
    ))

    story.append(section("5. EXCEPTIONS", styles))
    story.append(body(
        "The obligations in Clause 4 shall not apply to information that: (a) is or becomes "
        "publicly available other than through a breach of this Agreement; (b) was already known "
        "to the receiving Party prior to disclosure; (c) is independently developed by the "
        "receiving Party without use of the Confidential Information; or (d) is required to be "
        "disclosed by law or regulatory authority.",
        styles
    ))

    story.append(section("6. PENALTY CLAUSES", styles))
    story.append(body("Not applicable. This Agreement does not include financial penalty clauses.", styles))

    story.append(section("7. TERMINATION", styles))
    story.append(body(
        "Either Party may terminate this Agreement by providing 30 days written notice to the other "
        "Party. Upon termination, each Party shall promptly destroy or return all Confidential "
        "Information in its possession. Confidentiality obligations shall survive termination for "
        "a period of three (3) years.",
        styles
    ))

    story.append(Spacer(1, 20))
    story.append(hr())
    story.append(section("SIGNATURES", styles))
    story.append(signature_table("Meridian Analytics Ltd", "DataVault GmbH", styles))

    build_pdf("contract_001.pdf", story)


# ─────────────────────────────────────────────
# CONTRACT 2 — SERVICE AGREEMENT (Italy law, 60 days notice, auto-renewal, penalty)
# ─────────────────────────────────────────────
def contract_002(styles):
    story = []
    story.append(Paragraph("SERVICE AGREEMENT", styles["ContractTitle"]))
    story.append(Paragraph("Master Services Agreement — IT Consulting", styles["SubTitle"]))
    story.append(hr())

    story.append(section("1. PARTIES", styles))
    story.append(Spacer(1, 4))
    story.append(parties_table(
        "Nexus Digital S.r.l.\nVia Montenapoleone 8, 20121 Milano, Italy\nP.IVA: IT09876543210",
        "Aurora Retail S.p.A.\nCorso Vittorio Emanuele II 104, 10128 Torino, Italy\nP.IVA: IT01234567890",
        styles
    ))

    story.append(section("2. KEY TERMS", styles))
    story.append(field("Contract Type", "Master Service Agreement", styles))
    story.append(field("Effective Date", "15 January 2024", styles))
    story.append(field("Initial Term", "15 January 2024 – 14 January 2025", styles))
    story.append(field("Auto-Renewal", "Yes — renews automatically for successive 12-month periods unless terminated", styles))
    story.append(field("Governing Law", "Laws of the Italian Republic", styles))
    story.append(field("Jurisdiction", "Court of Milan (Tribunale di Milano)", styles))
    story.append(field("Termination Notice", "60 days written notice prior to renewal date", styles))
    story.append(field("Service Fee", "€18,500 per month, invoiced on the 1st of each month", styles))
    story.append(field("Payment Terms", "Net 30 days from invoice date", styles))

    story.append(section("3. SCOPE OF SERVICES", styles))
    story.append(body(
        "Nexus Digital S.r.l. (the \"Service Provider\") shall provide Aurora Retail S.p.A. (the "
        "\"Client\") with IT consulting services including: software architecture design, cloud "
        "migration support (AWS and Azure), cybersecurity assessment, and monthly infrastructure "
        "health reviews. Services shall be performed by qualified personnel in accordance with "
        "the Statement of Work attached as Schedule A.",
        styles
    ))

    story.append(section("4. KEY OBLIGATIONS", styles))
    story.append(body(
        "Service Provider: (i) shall dedicate a minimum of 160 man-hours per month to the Client's "
        "projects; (ii) shall provide a dedicated project manager as single point of contact; "
        "(iii) shall deliver monthly progress reports no later than the 5th of the following month. "
        "Client: (i) shall provide timely access to systems, data, and personnel required for "
        "delivery; (ii) shall pay all undisputed invoices within the agreed payment terms; "
        "(iii) shall not solicit or hire Service Provider employees during the term and for 12 months "
        "thereafter.",
        styles
    ))

    story.append(section("5. PENALTY CLAUSES", styles))
    story.append(body(
        "5.1 Late Payment Penalty: Overdue invoices shall accrue interest at 8% per annum above "
        "the European Central Bank reference rate, calculated daily, from the due date until "
        "full settlement. "
        "5.2 SLA Breach Penalty: In the event of service availability falling below 99.5% in any "
        "calendar month (excluding agreed maintenance windows), the Client shall be entitled to a "
        "service credit equal to 5% of the monthly fee for each full percentage point below the "
        "threshold, up to a maximum credit of 25% of the monthly fee. "
        "5.3 Early Termination Penalty: If the Client terminates this Agreement for convenience "
        "prior to the end of the Initial Term, a termination fee equal to three (3) months of the "
        "monthly service fee shall become immediately due and payable.",
        styles
    ))

    story.append(section("6. TERMINATION", styles))
    story.append(body(
        "Either Party may terminate this Agreement (a) for convenience by providing 60 days "
        "written notice prior to any renewal date; (b) immediately for material breach that "
        "remains uncured for 15 days following written notice; or (c) immediately upon the "
        "insolvency or liquidation of the other Party.",
        styles
    ))

    story.append(Spacer(1, 20))
    story.append(hr())
    story.append(section("SIGNATURES", styles))
    story.append(signature_table("Nexus Digital S.r.l.", "Aurora Retail S.p.A.", styles))

    build_pdf("contract_002.pdf", story)


# ─────────────────────────────────────────────
# CONTRACT 3 — EMPLOYMENT (Germany law, 30 days notice, no auto-renewal, no penalty)
# ─────────────────────────────────────────────
def contract_003(styles):
    story = []
    story.append(Paragraph("EMPLOYMENT CONTRACT", styles["ContractTitle"]))
    story.append(Paragraph("Fixed-Term Employment Agreement", styles["SubTitle"]))
    story.append(hr())

    story.append(section("1. PARTIES", styles))
    story.append(Spacer(1, 4))
    story.append(parties_table(
        "Brücke Engineering GmbH\nIndustriestraße 45, 70565 Stuttgart, Germany\nHRB 741285 — Amtsgericht Stuttgart",
        "Ms. Sophie Hartmann\nLerchenstraße 12, 70182 Stuttgart, Germany\nDate of Birth: 14 August 1990",
        styles
    ))

    story.append(section("2. KEY TERMS", styles))
    story.append(field("Contract Type", "Fixed-Term Employment Contract (§ 14 TzBfG)", styles))
    story.append(field("Position", "Senior Mechanical Engineer", styles))
    story.append(field("Department", "Research & Development", styles))
    story.append(field("Effective Date (Start)", "1 April 2024", styles))
    story.append(field("Expiry Date", "31 March 2026 (no auto-renewal; conversion to permanent by mutual agreement only)", styles))
    story.append(field("Governing Law", "Laws of the Federal Republic of Germany", styles))
    story.append(field("Jurisdiction", "Labour Court of Stuttgart (Arbeitsgericht Stuttgart)", styles))
    story.append(field("Termination Notice", "30 days notice to end of calendar month (Kündigungsfrist)", styles))
    story.append(field("Gross Annual Salary", "€72,000, paid in 12 equal monthly instalments", styles))
    story.append(field("Working Hours", "38 hours per week; flexible arrangement subject to departmental needs", styles))
    story.append(field("Annual Leave", "28 working days per calendar year", styles))

    story.append(section("3. SCOPE OF ROLE", styles))
    story.append(body(
        "The Employee shall design, develop, and test mechanical components for the Employer's "
        "industrial automation product line. Responsibilities include CAD modelling, prototype "
        "testing, root-cause analysis of field failures, and coordination with the production team "
        "to ensure manufacturability. The Employee reports to the Head of R&D.",
        styles
    ))

    story.append(section("4. KEY OBLIGATIONS", styles))
    story.append(body(
        "Employee: (i) shall perform their duties diligently and to the highest professional "
        "standard, devoting full working time exclusively to the Employer's business; (ii) shall "
        "immediately disclose any conflict of interest and refrain from competing activities during "
        "employment and for 12 months post-termination within the European Union; (iii) shall "
        "maintain strict confidentiality regarding trade secrets, client lists, and proprietary "
        "technical data both during and after employment. "
        "Employer: (i) shall provide the Employee with adequate equipment, tools, and a safe working "
        "environment in accordance with applicable health-and-safety regulations; (ii) shall pay "
        "salary and statutory social insurance contributions in a timely manner.",
        styles
    ))

    story.append(section("5. INTELLECTUAL PROPERTY", styles))
    story.append(body(
        "All inventions, designs, and works created by the Employee in the course of employment "
        "shall vest in the Employer pursuant to § 4 ArbnErfG (German Employee Inventions Act). "
        "The Employee shall promptly disclose all such creations and execute any instruments "
        "required to perfect the Employer's rights.",
        styles
    ))

    story.append(section("6. PENALTY CLAUSES", styles))
    story.append(body("Not applicable. No financial penalty clauses are included in this Contract.", styles))

    story.append(section("7. TERMINATION", styles))
    story.append(body(
        "This Contract terminates automatically on 31 March 2026. During the term, either party "
        "may terminate for cause (außerordentliche Kündigung) without notice pursuant to § 626 BGB. "
        "Ordinary termination requires 30 days written notice to the end of a calendar month. "
        "Upon termination, the Employee shall return all company property and equipment.",
        styles
    ))

    story.append(Spacer(1, 20))
    story.append(hr())
    story.append(section("SIGNATURES", styles))
    story.append(signature_table("Brücke Engineering GmbH", "Ms. Sophie Hartmann", styles))

    build_pdf("contract_003.pdf", story)


# ─────────────────────────────────────────────
# CONTRACT 4 — SUPPLY AGREEMENT (Spain law, 90 days notice, auto-renewal, penalty)
# ─────────────────────────────────────────────
def contract_004(styles):
    story = []
    story.append(Paragraph("SUPPLY AGREEMENT", styles["ContractTitle"]))
    story.append(Paragraph("Framework Supply Contract for Manufactured Components", styles["SubTitle"]))
    story.append(hr())

    story.append(section("1. PARTIES", styles))
    story.append(Spacer(1, 4))
    story.append(parties_table(
        "Iberia Components S.A.\nPolígono Industrial Can Parellada, Carrer de la Tecnologia 12\n08228 Terrassa, Barcelona, Spain\nCIF: A08765432",
        "ProMotor Automotive S.L.\nAvenida de la Industria 55, 28108 Alcobendas, Madrid, Spain\nCIF: B78654321",
        styles
    ))

    story.append(section("2. KEY TERMS", styles))
    story.append(field("Contract Type", "Framework Supply Agreement", styles))
    story.append(field("Effective Date", "1 June 2023", styles))
    story.append(field("Initial Term", "1 June 2023 – 31 May 2025", styles))
    story.append(field("Auto-Renewal", "Yes — renews automatically for 12-month periods; termination notice required 90 days before expiry", styles))
    story.append(field("Governing Law", "Laws of the Kingdom of Spain", styles))
    story.append(field("Jurisdiction", "Commercial Courts of Barcelona (Juzgados de lo Mercantil de Barcelona)", styles))
    story.append(field("Termination Notice", "90 days written notice before renewal date", styles))
    story.append(field("Minimum Annual Order", "€2,400,000 (two million four hundred thousand euros)", styles))
    story.append(field("Payment Terms", "Net 60 days from delivery and acceptance", styles))
    story.append(field("Incoterms", "DDP – Delivered Duty Paid (Buyer's warehouse, Alcobendas)", styles))

    story.append(section("3. SCOPE OF SUPPLY", styles))
    story.append(body(
        "Iberia Components S.A. (the \"Supplier\") agrees to supply ProMotor Automotive S.L. "
        "(the \"Buyer\") with precision-engineered aluminium castings, steel stampings, and "
        "associated sub-assemblies as set out in the Product Schedule (Annex I). All goods shall "
        "conform to ISO/TS 16949 quality standards and the Buyer's technical specifications "
        "current at the date of each Purchase Order.",
        styles
    ))

    story.append(section("4. KEY OBLIGATIONS", styles))
    story.append(body(
        "Supplier: (i) shall maintain a safety stock equivalent to 15 days of the Buyer's average "
        "weekly consumption at all times; (ii) shall achieve an On-Time-In-Full (OTIF) delivery "
        "rate of no less than 97% measured monthly; (iii) shall notify the Buyer at least 30 days "
        "in advance of any change to materials, production process, or sub-suppliers that may "
        "affect product quality or compliance. "
        "Buyer: (i) shall submit binding Purchase Orders no less than 20 business days prior to "
        "required delivery date; (ii) shall issue clear technical specifications and approve "
        "Engineering Change Requests within 10 business days; (iii) shall not source the "
        "contracted products from alternative suppliers without prior written consent during the "
        "term of this Agreement.",
        styles
    ))

    story.append(section("5. PENALTY CLAUSES", styles))
    story.append(body(
        "5.1 OTIF Penalty: For each calendar month in which the Supplier's OTIF rate falls below "
        "97%, the Buyer is entitled to deduct a penalty of 0.5% of the invoice value of all "
        "affected deliveries in that month, up to a maximum of 5% of the monthly invoice total. "
        "5.2 Quality Defects: In the event that the defect rate (PPM) exceeds 500 in any rolling "
        "three-month period, the Supplier shall bear the full cost of sorting, rework, and "
        "containment actions at the Buyer's facilities, plus a fixed penalty of €5,000 per "
        "occurrence. "
        "5.3 Shortfall Penalty: If the Buyer fails to meet the Minimum Annual Order in any "
        "contract year, the Buyer shall pay a shortfall fee equal to 8% of the difference between "
        "the Minimum Annual Order and the actual purchase value for that year.",
        styles
    ))

    story.append(section("6. TERMINATION", styles))
    story.append(body(
        "Either Party may terminate this Agreement for convenience by providing 90 days written "
        "notice prior to any renewal date. Either Party may terminate immediately upon material "
        "breach (including insolvency) that remains unremedied after 20 days written notice. "
        "Termination does not affect accrued rights or outstanding Purchase Orders which shall "
        "be completed in accordance with their terms.",
        styles
    ))

    story.append(Spacer(1, 20))
    story.append(hr())
    story.append(section("SIGNATURES", styles))
    story.append(signature_table("Iberia Components S.A.", "ProMotor Automotive S.L.", styles))

    build_pdf("contract_004.pdf", story)


# ─────────────────────────────────────────────
# CONTRACT 5 — DISTRIBUTION AGREEMENT (France law, 60 days notice, auto-renewal, penalty)
# ─────────────────────────────────────────────
def contract_005(styles):
    story = []
    story.append(Paragraph("EXCLUSIVE DISTRIBUTION AGREEMENT", styles["ContractTitle"]))
    story.append(Paragraph("Exclusive Distribution of Consumer Electronics — France & Benelux", styles["SubTitle"]))
    story.append(hr())

    story.append(section("1. PARTIES", styles))
    story.append(Spacer(1, 4))
    story.append(parties_table(
        "Luminos Tech S.A.S.\n14 Rue de Rivoli, 75001 Paris, France\nSIREN: 812 345 678 — RCS Paris",
        "BrightWave Distribution N.V.\nHerengracht 282, 1016 BX Amsterdam, The Netherlands\nKvK: 72345678",
        styles
    ))

    story.append(section("2. KEY TERMS", styles))
    story.append(field("Contract Type", "Exclusive Distribution Agreement", styles))
    story.append(field("Effective Date", "1 September 2023", styles))
    story.append(field("Initial Term", "1 September 2023 – 31 August 2025", styles))
    story.append(field("Auto-Renewal", "Yes — renews automatically for 12-month periods unless terminated", styles))
    story.append(field("Territory", "France, Belgium, the Netherlands, and Luxembourg (Benelux)", styles))
    story.append(field("Governing Law", "Laws of the French Republic", styles))
    story.append(field("Jurisdiction", "Commercial Court of Paris (Tribunal de commerce de Paris)", styles))
    story.append(field("Termination Notice", "60 days written notice before each renewal date", styles))
    story.append(field("Minimum Annual Purchase", "€3,600,000 (three million six hundred thousand euros)", styles))
    story.append(field("Distributor Margin", "22% off the Supplier's then-current price list", styles))
    story.append(field("Payment Terms", "Net 45 days from invoice date", styles))

    story.append(section("3. SCOPE & EXCLUSIVITY", styles))
    story.append(body(
        "Luminos Tech S.A.S. (the \"Supplier\") grants BrightWave Distribution N.V. (the "
        "\"Distributor\") the exclusive right to market, sell, and distribute the Products listed "
        "in Annex A (consumer smart-home devices, wireless audio equipment, and accessories) "
        "within the Territory during the term of this Agreement. The Supplier shall not appoint "
        "any other distributor or sell directly to customers within the Territory except for "
        "sales to governmental bodies and OEM partners pre-existing as of the Effective Date.",
        styles
    ))

    story.append(section("4. KEY OBLIGATIONS", styles))
    story.append(body(
        "Distributor: (i) shall use commercially reasonable efforts to promote and sell the "
        "Products throughout the Territory, maintaining an active field sales force of no fewer "
        "than 12 dedicated sales representatives; (ii) shall meet the Minimum Annual Purchase "
        "commitment; (iii) shall maintain at least €500,000 of product liability insurance at all "
        "times and provide the Supplier with evidence of such cover on request; (iv) shall not "
        "actively solicit customers outside the Territory. "
        "Supplier: (i) shall supply Products within 15 business days of a confirmed Purchase "
        "Order; (ii) shall provide marketing materials, product training, and technical support "
        "at no additional charge; (iii) shall not appoint additional distributors within the "
        "Territory without 6 months prior written notice and Distributor's written consent.",
        styles
    ))

    story.append(section("5. PENALTY CLAUSES", styles))
    story.append(body(
        "5.1 Minimum Purchase Shortfall: Should the Distributor fail to meet the Minimum Annual "
        "Purchase in any contract year, the Supplier may, at its option: (a) convert exclusivity "
        "to non-exclusive status for the following contract year; or (b) require a compensatory "
        "payment equal to 10% of the shortfall amount within 30 days of written demand. "
        "5.2 Late Payment: Overdue amounts shall bear interest at the French statutory late "
        "payment rate (taux d'intérêt légal majoré) plus 3 percentage points per annum, "
        "calculated daily, plus a fixed recovery indemnity of €40 per invoice as required under "
        "Article L. 441-10 of the French Commercial Code. "
        "5.3 Brand Damage: In the event of unauthorised modification of Products or use of "
        "Supplier trademarks outside agreed brand guidelines, the Supplier shall be entitled to "
        "claim liquidated damages of €25,000 per verified incident without prejudice to any "
        "further damages.",
        styles
    ))

    story.append(section("6. TERMINATION", styles))
    story.append(body(
        "Either Party may terminate for convenience by providing 60 days written notice prior to "
        "any renewal date. The Supplier may terminate immediately if the Distributor fails to meet "
        "the Minimum Annual Purchase for two consecutive years, or upon a change of control of "
        "the Distributor without prior written consent. Upon termination, the Distributor shall "
        "cease using all Supplier trademarks and return or destroy all marketing materials within "
        "30 days.",
        styles
    ))

    story.append(Spacer(1, 20))
    story.append(hr())
    story.append(section("SIGNATURES", styles))
    story.append(signature_table("Luminos Tech S.A.S.", "BrightWave Distribution N.V.", styles))

    build_pdf("contract_005.pdf", story)


if __name__ == "__main__":
    styles = make_styles()
    print("Generating contracts...")
    contract_001(styles)
    contract_002(styles)
    contract_003(styles)
    contract_004(styles)
    contract_005(styles)
    print("Done.")
