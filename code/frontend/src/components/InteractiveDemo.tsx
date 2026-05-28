import React, { useState, useRef, useEffect } from "react";
import {
  ArrowRight,
  Camera,
  Check,
  Clock,
  FileSignature,
  FileText,
  LayoutDashboard,
  Loader2,
  MessageSquare,
  Receipt,
  User,
  Zap,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type FileStatus = "queued" | "processing" | "done";
type CellValue = string | number | null;
type SubTab = "records" | "chat" | "dashboard";

type DemoFile = {
  name: string;
  size: string;
  record: Record<string, CellValue>;
};

type ChatQA = {
  question: string;
  answer: string;
};

type KpiTile = { kind: "kpi"; title: string; value: string; sub?: string };
type BarTile = { kind: "bar"; title: string; items: { label: string; value: number }[] };
type DashTile = KpiTile | BarTile;

type DemoDataset = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  fileType: "PDF" | "JPG";
  instruction: string;
  dashInstruction: string;
  columns: string[];
  files: DemoFile[];
  chatQAs: ChatQA[];
  dashTiles: DashTile[];
};

// ── Dataset data ───────────────────────────────────────────────────────────────

const DATASETS: DemoDataset[] = [
  {
    id: "invoice",
    label: "Invoices",
    icon: FileText,
    fileType: "PDF",
    instruction: "Extract vendor name, invoice number, total amount, and due date from these supplier invoices",
    dashInstruction: "Show me total invoiced per vendor, average invoice value, and flag invoices due in December",
    columns: ["vendor", "invoice_no", "total", "due_date"],
    files: [
      { name: "invoice_techcorp_2024.pdf", size: "1.2 MB", record: { vendor: "TechCorp S.r.l.", invoice_no: "INV-2024-0891", total: 4200, due_date: "2024-12-15" } },
      { name: "invoice_globex_q3.pdf",     size: "980 KB", record: { vendor: "Globex Ltd",       invoice_no: "GLX-7823",       total: 7800, due_date: "2024-10-30" } },
      { name: "invoice_acme_nov.pdf",      size: "1.5 MB", record: { vendor: "Acme Corp",         invoice_no: "ACM-2024-112",   total: 12400, due_date: "2024-12-01" } },
      { name: "invoice_waystar_2024.pdf",  size: "750 KB", record: { vendor: "Waystar Royco",     invoice_no: "WR-4410",        total: 2850, due_date: "2024-11-22" } },
      { name: "invoice_dunder_dec.pdf",    size: "640 KB", record: { vendor: "Dunder Mifflin",    invoice_no: "DM-2024-555",    total: 980, due_date: "2024-12-31" } },
    ],
    chatQAs: [
      { question: "What's the total invoiced amount?", answer: "Total invoiced: **€28,230** across 5 invoices.\nLargest: Acme Corp — €12,400 (INV ACM-2024-112)." },
      { question: "Which invoices are due in December?", answer: "3 invoices due in December:\n- TechCorp S.r.l. — €4,200 (Dec 15)\n- Acme Corp — €12,400 (Dec 1)\n- Dunder Mifflin — €980 (Dec 31)" },
    ],
    dashTiles: [
      { kind: "kpi", title: "Total invoiced", value: "€28,230", sub: "5 invoices" },
      { kind: "kpi", title: "Average invoice", value: "€5,646" },
      { kind: "kpi", title: "Largest invoice", value: "€12,400", sub: "Acme Corp" },
      { kind: "bar", title: "Amount by vendor", items: [
        { label: "Acme Corp", value: 12400 },
        { label: "Globex Ltd", value: 7800 },
        { label: "TechCorp", value: 4200 },
        { label: "Waystar", value: 2850 },
        { label: "Dunder", value: 980 },
      ]},
    ],
  },
  {
    id: "receipt",
    label: "Receipts",
    icon: Receipt,
    fileType: "JPG",
    instruction: "Extract store name, purchase date, total amount, and payment method from these receipts",
    dashInstruction: "Show me total spend by store and break down by payment method",
    columns: ["store", "date", "total", "payment_method"],
    files: [
      { name: "receipt_amazon_0312.jpg",    size: "320 KB", record: { store: "Amazon.it",   date: "2024-03-12", total: 141.58, payment_method: "Visa ****4821" } },
      { name: "receipt_carrefour_0315.jpg", size: "280 KB", record: { store: "Carrefour",   date: "2024-03-15", total: 14.97,  payment_method: "Contactless" } },
      { name: "receipt_lidl_0318.jpg",      size: "190 KB", record: { store: "Lidl",        date: "2024-03-18", total: 5.80,   payment_method: "Cash" } },
      { name: "receipt_zalando_0320.jpg",   size: "340 KB", record: { store: "Zalando",     date: "2024-03-20", total: 141.54, payment_method: "PayPal" } },
      { name: "receipt_esselunga_0322.jpg", size: "210 KB", record: { store: "Esselunga",   date: "2024-03-22", total: 10.55,  payment_method: "Fidelity card" } },
    ],
    chatQAs: [
      { question: "What's the total spend?", answer: "Total: **€314.44** across 5 receipts.\nMost expensive: Amazon.it at €141.58, followed by Zalando at €141.54." },
      { question: "Which payment methods were used?", answer: "4 different methods:\n- Visa: 1 (Amazon.it)\n- Contactless: 1 (Carrefour)\n- Cash: 1 (Lidl)\n- PayPal: 1 (Zalando)\n- Fidelity card: 1 (Esselunga)" },
    ],
    dashTiles: [
      { kind: "kpi", title: "Total spend", value: "€314.44", sub: "5 receipts" },
      { kind: "kpi", title: "Average receipt", value: "€62.89" },
      { kind: "kpi", title: "Largest purchase", value: "€141.58", sub: "Amazon.it" },
      { kind: "bar", title: "Amount by store", items: [
        { label: "Amazon.it", value: 14158 },
        { label: "Zalando",   value: 14154 },
        { label: "Esselunga", value: 1055 },
        { label: "Carrefour", value: 1497 },
        { label: "Lidl",      value: 580 },
      ]},
    ],
  },
  {
    id: "cv",
    label: "CVs",
    icon: User,
    fileType: "PDF",
    instruction: "Extract candidate name, email, top skills, and most recent company from these CVs",
    dashInstruction: "Show me how many candidates have each skill and how many companies are represented",
    columns: ["name", "email", "skills", "last_company"],
    files: [
      { name: "cv_mario_rossi.pdf",   size: "890 KB", record: { name: "Mario Rossi",   email: "mario.rossi@email.com",    skills: "Python, FastAPI, Docker",       last_company: "TechStartup S.r.l." } },
      { name: "cv_sara_bianchi.pdf",  size: "1.1 MB", record: { name: "Sara Bianchi",  email: "sara.bianchi@design.io",   skills: "Figma, UX Research, Framer",    last_company: "DesignCo" } },
      { name: "cv_luca_ferrari.pdf",  size: "760 KB", record: { name: "Luca Ferrari",  email: "luca.ferrari@ml.dev",      skills: "PyTorch, scikit-learn, SQL",    last_company: "DataLab S.r.l." } },
      { name: "cv_anna_colombo.pdf",  size: "920 KB", record: { name: "Anna Colombo",  email: "anna.colombo@infra.dev",   skills: "Kubernetes, Terraform, AWS",    last_company: "CloudOps S.r.l." } },
      { name: "cv_marco_ricci.pdf",   size: "1.0 MB", record: { name: "Marco Ricci",   email: "marco.ricci@frontend.dev", skills: "TypeScript, React, Next.js",    last_company: "WebCraft S.r.l." } },
    ],
    chatQAs: [
      { question: "Who has React or frontend skills?", answer: "2 candidates with frontend skills:\n- **Marco Ricci** — TypeScript, React, Next.js (WebCraft S.r.l.)\n- **Sara Bianchi** — Figma, UX Research, Framer (DesignCo)" },
      { question: "Which candidates have cloud or infra experience?", answer: "1 candidate:\n- **Anna Colombo** — Kubernetes, Terraform, AWS at CloudOps S.r.l." },
    ],
    dashTiles: [
      { kind: "kpi", title: "Candidates", value: "5" },
      { kind: "kpi", title: "Avg skills listed", value: "3 per CV" },
      { kind: "kpi", title: "Unique companies", value: "5" },
      { kind: "bar", title: "Skills distribution", items: [
        { label: "Python",     value: 2 },
        { label: "Docker",     value: 2 },
        { label: "TypeScript", value: 1 },
        { label: "Figma",      value: 1 },
        { label: "AWS",        value: 1 },
      ]},
    ],
  },
  {
    id: "utility",
    label: "Utility Bills",
    icon: Zap,
    fileType: "PDF",
    instruction: "Extract provider, billing period, consumption in kWh, and amount due from these utility bills",
    dashInstruction: "Show me monthly energy consumption and total spend — which month cost the most?",
    columns: ["provider", "period", "kwh", "amount_due"],
    files: [
      { name: "bill_enel_jan.pdf",  size: "420 KB", record: { provider: "Enel Energia",  period: "Jan 2024", kwh: 312, amount_due: 124.80 } },
      { name: "bill_enel_feb.pdf",  size: "410 KB", record: { provider: "Enel Energia",  period: "Feb 2024", kwh: 289, amount_due: 113.60 } },
      { name: "bill_a2a_mar.pdf",   size: "380 KB", record: { provider: "A2A Energia",   period: "Mar 2024", kwh: 334, amount_due: 141.20 } },
      { name: "bill_eni_apr.pdf",   size: "450 KB", record: { provider: "Eni gas e luce", period: "Apr 2024", kwh: 278, amount_due: 108.90 } },
      { name: "bill_enel_may.pdf",  size: "400 KB", record: { provider: "Enel Energia",  period: "May 2024", kwh: 241, amount_due: 91.50 } },
    ],
    chatQAs: [
      { question: "What's the total energy spend?", answer: "Total: **€580.00** over 5 months (Jan–May 2024).\nTotal consumption: 1,454 kWh — avg €0.399/kWh." },
      { question: "Which month had the highest bill?", answer: "**March 2024** — A2A Energia: €141.20 for 334 kWh.\nLowest: May 2024 (Enel) at €91.50 for 241 kWh." },
    ],
    dashTiles: [
      { kind: "kpi", title: "Total spend", value: "€580.00", sub: "5 months" },
      { kind: "kpi", title: "Total consumption", value: "1,454 kWh" },
      { kind: "kpi", title: "Peak month", value: "334 kWh", sub: "March 2024" },
      { kind: "bar", title: "kWh by month", items: [
        { label: "Jan", value: 312 },
        { label: "Feb", value: 289 },
        { label: "Mar", value: 334 },
        { label: "Apr", value: 278 },
        { label: "May", value: 241 },
      ]},
    ],
  },
  {
    id: "contract",
    label: "Contracts",
    icon: FileSignature,
    fileType: "PDF",
    instruction: "Extract contracting parties, end date, contract value, and governing law from these supplier contracts",
    dashInstruction: "Show me total contract value by counterparty and which contracts expire soonest",
    columns: ["parties", "end_date", "value", "governing_law"],
    files: [
      { name: "contract_techcorp.pdf",  size: "2.1 MB", record: { parties: "TechCorp / Acme Corp",  end_date: "2024-12-31", value: 50400,  governing_law: "Italian" } },
      { name: "contract_globex.pdf",    size: "1.8 MB", record: { parties: "Globex / DataLab",       end_date: "2025-02-28", value: 93600,  governing_law: "English" } },
      { name: "contract_acme.pdf",      size: "3.2 MB", record: { parties: "Acme / Initech",         end_date: "2026-05-31", value: 240000, governing_law: "New York" } },
      { name: "contract_waystar.pdf",   size: "1.5 MB", record: { parties: "Waystar / MediaBuy",     end_date: "2024-10-14", value: 17100,  governing_law: "German" } },
      { name: "nda_dunder.pdf",         size: "980 KB", record: { parties: "Dunder / Sabre",         end_date: "2026-01-31", value: null,   governing_law: "Pennsylvania" } },
    ],
    chatQAs: [
      { question: "What's the total contract value?", answer: "Total known value: **€401,100** across 4 contracts (1 NDA has no monetary value).\nLargest: Acme / Initech at €240,000." },
      { question: "Which contracts expire soonest?", answer: "Expiry order:\n1. Waystar / MediaBuy — Oct 14, 2024\n2. TechCorp / Acme Corp — Dec 31, 2024\n3. Globex / DataLab — Feb 28, 2025" },
    ],
    dashTiles: [
      { kind: "kpi", title: "Total value", value: "€401,100", sub: "4 contracts" },
      { kind: "kpi", title: "Largest contract", value: "€240,000", sub: "Acme / Initech" },
      { kind: "kpi", title: "Soonest expiry", value: "Oct 2024", sub: "Waystar / MediaBuy" },
      { kind: "bar", title: "Value by contract", items: [
        { label: "Acme",     value: 240000 },
        { label: "Globex",   value: 93600 },
        { label: "TechCorp", value: 50400 },
        { label: "Waystar",  value: 17100 },
      ]},
    ],
  },
  {
    id: "photos",
    label: "Photos",
    icon: Camera,
    fileType: "JPG",
    instruction: "Extract brand, model, condition, and estimated value from photos of equipment in our fleet",
    dashInstruction: "Show me total fleet value by machine and flag units in fair or poor condition",
    columns: ["brand", "model", "condition", "est_value"],
    files: [
      { name: "machine_cat_047.jpg",      size: "4.2 MB", record: { brand: "Caterpillar", model: "320 GC",       condition: "Good",      est_value: 45000 } },
      { name: "machine_jd_112.jpg",       size: "3.8 MB", record: { brand: "John Deere",  model: "544 L",        condition: "Excellent", est_value: 62000 } },
      { name: "machine_komatsu_08.jpg",   size: "5.1 MB", record: { brand: "Komatsu",     model: "D65EX-18",     condition: "Fair",      est_value: 38500 } },
      { name: "machine_liebherr_31.jpg",  size: "4.7 MB", record: { brand: "Liebherr",    model: "LTM 1090-4.2", condition: "Good",      est_value: 185000 } },
      { name: "machine_volvo_209.jpg",    size: "3.9 MB", record: { brand: "Volvo CE",    model: "A40G",         condition: "Poor",      est_value: 22000 } },
    ],
    chatQAs: [
      { question: "What's the total fleet value?", answer: "Total estimated fleet value: **€352,500**.\nMost valuable: Liebherr LTM 1090-4.2 at €185,000." },
      { question: "Which machines need attention?", answer: "2 machines below Good condition:\n- **Komatsu D65EX-18** — Fair (est. €38,500)\n- **Volvo A40G** — Poor (est. €22,000)" },
    ],
    dashTiles: [
      { kind: "kpi", title: "Fleet value", value: "€352,500", sub: "5 machines" },
      { kind: "kpi", title: "Average value", value: "€70,500" },
      { kind: "kpi", title: "Need attention", value: "2 machines", sub: "Fair or Poor condition" },
      { kind: "bar", title: "Value by machine", items: [
        { label: "Liebherr", value: 185000 },
        { label: "John Deere", value: 62000 },
        { label: "Caterpillar", value: 45000 },
        { label: "Komatsu", value: 38500 },
        { label: "Volvo CE", value: 22000 },
      ]},
    ],
  },
];

// ── Animation constants ────────────────────────────────────────────────────────

const TIMINGS = [850, 1150, 1350, 1550, 1750];
type Phase = "first" | "parallel" | "done";

function fileStatus(idx: number, phase: Phase, revealedRows: number): FileStatus {
  if (phase === "done") return "done";
  if (phase === "first") return idx === 0 ? "processing" : "queued";
  return idx < revealedRows ? "done" : "processing";
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ tile }: { tile: KpiTile }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide">{tile.title}</p>
      <p className="text-2xl font-bold mt-1 tabular-nums">{tile.value}</p>
      {tile.sub && <p className="text-[11px] text-muted-foreground mt-0.5">{tile.sub}</p>}
    </div>
  );
}

function BarCard({ tile }: { tile: BarTile }) {
  const max = Math.max(...tile.items.map((d) => d.value));
  return (
    <div className="rounded-xl border bg-muted/20 p-4 col-span-full md:col-span-1">
      <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide mb-3">{tile.title}</p>
      <div className="space-y-2">
        {tile.items.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground w-20 shrink-0 truncate">{item.label}</span>
            <div className="flex-1 bg-muted rounded-full h-1.5">
              <div
                className="bg-primary rounded-full h-1.5 transition-all duration-700"
                style={{ width: `${(item.value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        if (line.startsWith("- ")) {
          return (
            <div key={i} className="flex gap-1.5 pl-2">
              <span className="text-muted-foreground">·</span>
              <span dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} />
            </div>
          );
        }
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return (
          <p key={i} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} />
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type ChatState =
  | { phase: "idle" }
  | { phase: "typing"; question: string }
  | { phase: "answered"; question: string; answer: string };

export function InteractiveDemo() {
  const [activeTab, setActiveTab] = useState(0);
  const [phase, setPhase] = useState<Phase>("done");
  const [revealedRows, setRevealedRows] = useState(DATASETS[0].files.length);
  const [subTab, setSubTab] = useState<SubTab>("records");
  const [chatState, setChatState] = useState<ChatState>({ phase: "idle" });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function animate(tabIdx: number) {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setActiveTab(tabIdx);
    setPhase("first");
    setRevealedRows(0);
    setChatState({ phase: "idle" });

    timers.current.push(setTimeout(() => {
      setPhase("parallel");
      setRevealedRows(1);
    }, TIMINGS[0]));

    for (let i = 1; i < DATASETS[tabIdx].files.length; i++) {
      const rows = i + 1;
      const isLast = rows === DATASETS[tabIdx].files.length;
      timers.current.push(setTimeout(() => {
        setRevealedRows(rows);
        if (isLast) setPhase("done");
      }, TIMINGS[i]));
    }
  }

  function askQuestion(qa: ChatQA) {
    if (chatState.phase === "typing") return;
    setChatState({ phase: "typing", question: qa.question });
    const t = setTimeout(() => {
      setChatState({ phase: "answered", question: qa.question, answer: qa.answer });
    }, 900);
    timers.current.push(t);
  }

  // reset chat when switching sub-tab
  useEffect(() => {
    if (subTab !== "chat") setChatState({ phase: "idle" });
  }, [subTab]);

  const dataset = DATASETS[activeTab];

  const subTabClass = (value: SubTab) =>
    `flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
      subTab === value
        ? "bg-muted text-foreground"
        : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="border rounded-2xl overflow-hidden bg-card">

      {/* Dataset tab bar */}
      <div className="border-b px-4 py-2.5 flex gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {DATASETS.map((ds, i) => {
          const Icon = ds.icon;
          return (
            <button
              key={ds.id}
              onClick={() => { animate(i); setSubTab("records"); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === i
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {ds.label}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="grid md:grid-cols-[280px_1fr] divide-y md:divide-y-0 md:divide-x">

        {/* Left: file queue + inferred schema */}
        <div className="p-4 flex flex-col gap-3">
          <p className="text-[10px] font-mono text-muted-foreground tracking-[0.15em] uppercase">
            {dataset.files.length} files · {dataset.fileType}
          </p>
          <div className="space-y-0.5">
            {dataset.files.map((f, i) => {
              const status = fileStatus(i, phase, revealedRows);
              return (
                <div key={f.name} className="flex items-center gap-2 px-1.5 py-1.5 rounded-md">
                  {status === "queued"     && <Clock   className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30" />}
                  {status === "processing" && <Loader2 className="h-3.5 w-3.5 shrink-0 text-emerald-500 animate-spin" />}
                  {status === "done"       && <Check   className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                  <span className={`text-[11px] font-mono truncate ${status === "queued" ? "text-muted-foreground/40" : "text-foreground"}`}>
                    {f.name}
                  </span>
                </div>
              );
            })}
          </div>

          <div className={`mt-auto pt-3 border-t transition-opacity duration-300 ${phase === "first" ? "opacity-0" : "opacity-100"}`}>
            <p className="text-[10px] font-mono text-muted-foreground tracking-[0.15em] uppercase mb-1.5">
              Inferred schema
            </p>
            <div className="flex flex-wrap gap-1">
              {dataset.columns.map((col) => (
                <span key={col} className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  {col}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right: sub-tabs + content */}
        <div className="p-5 flex flex-col gap-4 min-h-[340px]">

          {/* Sub-tab bar */}
          <div className="flex gap-1">
            <button className={subTabClass("records")} onClick={() => setSubTab("records")}>
              <FileText className="h-3.5 w-3.5" />
              Records
            </button>
            <button className={subTabClass("chat")} onClick={() => setSubTab("chat")}>
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
            </button>
            <button className={subTabClass("dashboard")} onClick={() => setSubTab("dashboard")}>
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </button>
          </div>

          {/* ── Records ── */}
          {subTab === "records" && (
            <>
              <div className="flex items-start gap-2.5 rounded-lg border bg-muted/30 px-3.5 py-2.5">
                <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0 mt-px" />
                <p className="text-sm leading-snug text-foreground">"{dataset.instruction}"</p>
              </div>

              <div className="overflow-x-auto flex-1">
                {phase === "first" ? (
                  <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground font-mono">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
                    Inferring schema from first document…
                  </div>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b">
                        {dataset.columns.map((col) => (
                          <th key={col} className="pb-2 pr-5 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-normal whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dataset.files.slice(0, revealedRows).map((f) => (
                        <tr key={f.name} className="border-b last:border-0">
                          {dataset.columns.map((col) => {
                            const val = f.record[col];
                            return (
                              <td key={col} className="py-2 pr-5 max-w-[150px]">
                                {val === null
                                  ? <span className="text-muted-foreground/40 font-mono text-[10px]">—</span>
                                  : <span className="block truncate">{String(val)}</span>
                                }
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {phase === "parallel" && revealedRows < dataset.files.length && (
                        <tr>
                          <td colSpan={dataset.columns.length} className="py-2">
                            <span className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground/50">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              extracting {dataset.files.length - revealedRows} more in parallel…
                            </span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* ── Chat ── */}
          {subTab === "chat" && (
            <div className="flex flex-col gap-4 flex-1">
              {/* Suggested questions */}
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide">Ask a question</p>
                <div className="flex flex-wrap gap-2">
                  {dataset.chatQAs.map((qa) => (
                    <button
                      key={qa.question}
                      onClick={() => askQuestion(qa)}
                      disabled={chatState.phase === "typing"}
                      className="text-xs border rounded-full px-3 py-1.5 hover:bg-muted transition-colors text-left disabled:opacity-50"
                    >
                      {qa.question}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conversation */}
              {chatState.phase !== "idle" && (
                <div className="flex flex-col gap-3 flex-1">
                  {/* User bubble */}
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2.5 text-sm">
                      {chatState.question}
                    </div>
                  </div>

                  {/* Assistant */}
                  <div className="flex gap-3 items-start">
                    <div className="shrink-0 h-7 w-7 rounded-lg bg-gradient-to-br from-amber-500 via-amber-400 to-amber-500/70 flex items-center justify-center">
                      <span className="font-mono text-[11px] font-bold text-white leading-none">S</span>
                    </div>
                    {chatState.phase === "typing" ? (
                      <div className="flex gap-1 pt-2.5">
                        {[0, 1, 2].map((i) => (
                          <span key={i} className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm leading-relaxed text-foreground">
                        <SimpleMarkdown text={(chatState as { phase: "answered"; answer: string }).answer} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Dashboard ── */}
          {subTab === "dashboard" && (
            <>
              <div className="flex items-start gap-2.5 rounded-lg border bg-muted/30 px-3.5 py-2.5">
                <LayoutDashboard className="h-3.5 w-3.5 text-primary shrink-0 mt-px" />
                <p className="text-sm leading-snug text-foreground">"{dataset.dashInstruction}"</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 flex-1">
              {dataset.dashTiles.map((tile, i) =>
                tile.kind === "kpi"
                  ? <KpiCard key={i} tile={tile} />
                  : <BarCard key={i} tile={tile} />
              )}
            </div>
            </>
          )}

          <a
            href="https://app.sifter.run/register"
            className="inline-flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary transition-colors mt-auto"
          >
            Try with your documents
            <ArrowRight className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
