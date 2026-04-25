import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Code2,
  Cpu,
  Database,
  ExternalLink,
  FileText,
  Filter,
  Folder,
  GitBranch,
  LayoutDashboard,
  Link2,
  MessageSquare,
  Plug,
  Quote,
  Search,
  Server,
  Shield,
  Terminal,
  Webhook,
} from "lucide-react";
import logo from "@/assets/logo.svg";

const DOCS_URL = "https://docs.sifter.run";
const GITHUB_URL = "https://github.com/sifter-ai/sifter";

const DEMO_OUTPUT = `{
  "vendor": "Acme Corp",
  "amount": 4200.00,
  "currency": "EUR",
  "date": "2024-03-15",
  "line_items": [
    {
      "description": "Consulting services",
      "qty": 3,
      "unit_price": 1400.00
    }
  ],
  "status": "unpaid"
}`;

export default function LandingPage() {

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Navbar ── */}
      <header className="bg-background/80 backdrop-blur border-b sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="Sifter" className="h-6 w-6" />
            <span className="text-primary font-bold tracking-tight">Sifter</span>
          </div>
          <nav className="flex items-center gap-1">
            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer"
              className="hidden sm:block text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2">
              Docs
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
              className="hidden sm:block text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2">
              GitHub
            </a>
            <Link to="/login"
              className="hidden sm:block text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2">
              Sign in
            </Link>
            <Link to="/register"
              className="ml-2 bg-primary text-primary-foreground px-4 py-1.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
              Try free →
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="py-16 md:py-24 overflow-hidden">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-[1fr_1.1fr] gap-10 items-center">

            {/* Left: text + code */}
            <div>
              <span className="inline-flex items-center gap-1.5 border border-primary/25 text-primary text-[11px] font-medium px-3 py-1 rounded-full bg-primary/5 mb-6 tracking-wide font-mono uppercase">
                Document intelligence, open source.
              </span>
              <h1 className="text-[2rem] sm:text-[2.6rem] md:text-[3.2rem] font-bold tracking-tight leading-[1.08] text-foreground">
                Structure any document.<br />
                <span className="text-primary">Query it like</span>{" "}
                <span className="text-primary">a database.</span>
              </h1>
              <p className="text-muted-foreground mt-5 leading-relaxed max-w-full md:max-w-sm text-[15px]">
                Upload invoices, CVs, contracts, utility bills — any document collection. Sifter extracts structured data with an LLM, stores it in MongoDB, and gives you a REST API, Python/TypeScript SDKs, and natural-language queries. No template configuration. No layout rules.
              </p>
              <div className="mt-7 flex gap-3 flex-wrap sm:flex-nowrap">
                <Link to="/register"
                  className="w-full sm:w-auto justify-center bg-primary text-primary-foreground px-5 py-2.5 rounded-md font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-2 text-sm">
                  Try Sifter free <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <a href={DOCS_URL + "/self-hosting/docker-compose"} target="_blank" rel="noopener noreferrer"
                  className="w-full sm:w-auto justify-center border border-input px-5 py-2.5 rounded-md text-sm font-medium hover:bg-muted/60 transition-colors inline-flex items-center gap-2">
                  Self-host with Docker <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                Free tier forever. No credit card required.
              </p>

              {/* Code snippet */}
              <div className="mt-8 bg-[#111113] rounded-xl p-4 font-mono text-[12px] border border-white/5">
                <div className="flex items-center gap-1.5 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                </div>
                <pre className="text-zinc-200 overflow-x-auto leading-relaxed">
                  <code>
                    <span className="text-violet-400">from</span>{" sifter "}
                    <span className="text-violet-400">import</span>{" Sifter\n\n"}
                    {"s = Sifter(api_key="}
                    <span className="text-emerald-400">"sk-..."</span>
                    {")\n"}
                    {"records = s.sift("}
                    <span className="text-emerald-400">"./invoices/"</span>
                    {", "}
                    <span className="text-amber-300">"client, date, total"</span>
                    {")\n"}
                    <span className="text-zinc-400">{"# [{\"client\": \"Acme\", \"date\": \"2024-01\", ...}]"}</span>
                  </code>
                </pre>
              </div>
            </div>

            {/* Right: hero image */}
            <div className="relative">
              <div className="bg-white rounded-2xl shadow-2xl overflow-hidden ring-1 ring-black/5">
                <img
                  src="/images/hero.png"
                  alt="Documents becoming structured data"
                  className="w-full block"
                />
              </div>
              <div className="absolute -bottom-5 -left-5 hidden md:block bg-background border rounded-xl px-4 py-3 shadow-xl ring-1 ring-black/5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Works via</p>
                <p className="text-sm font-semibold mt-0.5 text-foreground">UI · API · SDK · MCP</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social proof ── */}
      <section className="py-8 border-t border-b bg-muted/20">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-[11px] font-mono text-muted-foreground tracking-[0.18em] uppercase">
            Open source · MIT licensed · Self-hostable
          </p>
        </div>
      </section>

      {/* ── Why LLM extraction ── */}
      <section className="py-20 border-t">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-[11px] font-mono text-muted-foreground tracking-[0.18em] uppercase mb-2">
                Why LLM extraction
              </p>
              <h2 className="text-2xl font-bold leading-tight">
                Works on real-world documents, not ideal ones.
              </h2>
              <p className="text-muted-foreground mt-4 leading-relaxed text-sm">
                Traditional extractors break when the layout changes — a new invoice supplier, a CV with an unusual format, a contract with non-standard clause ordering. Sifter uses an LLM as the extraction engine, so it reads documents contextually, like a human would. The same sift handles 50 CVs from 50 different candidates, or utility bills from 10 different providers, without per-layout configuration.
              </p>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/40 p-4 flex items-center gap-4">
                <div className="text-2xl shrink-0">📄</div>
                <div className="text-sm">
                  <p className="font-medium text-red-700 dark:text-red-400">Template extractor</p>
                  <p className="text-muted-foreground text-xs mt-0.5">Layout A ✓ · Layout B ✗ · Layout C ✗</p>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900/40 p-4 flex items-center gap-4">
                <div className="text-2xl shrink-0">✨</div>
                <div className="text-sm">
                  <p className="font-medium text-emerald-700 dark:text-emerald-400">Sifter</p>
                  <p className="text-muted-foreground text-xs mt-0.5">Layout A ✓ · Layout B ✓ · Layout C ✓</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Illustrazione utilizzo ── */}
      <section className="py-20 border-b">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-[11px] font-mono text-muted-foreground tracking-[0.18em] uppercase text-center mb-2">
            See it in action
          </p>
          <h2 className="text-2xl font-bold text-center mb-10">Drop a document. Get structured data.</h2>

          <div className="border rounded-2xl overflow-hidden bg-card">
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
              {/* Left: input */}
              <div className="p-6 flex flex-col gap-4">
                <p className="text-[10px] font-mono text-muted-foreground tracking-[0.15em] uppercase">Input</p>
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 text-primary rounded-lg p-2.5">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">invoice_acme_2024-03.pdf</p>
                    <p className="text-xs text-muted-foreground">2 pages · 184 KB</p>
                  </div>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 font-mono text-xs text-muted-foreground">
                  <p className="text-foreground font-medium mb-1">Schema</p>
                  <p>Extract: vendor, amount, currency, date, line_items, payment_status</p>
                </div>
                <Link
                  to="/register"
                  className="mt-auto bg-primary text-primary-foreground px-4 py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-2 justify-center"
                >
                  Try free <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {/* Right: output */}
              <div className="p-6 bg-[#111113]">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-mono text-muted-foreground tracking-[0.15em] uppercase">Output</p>
                  <span className="text-[10px] font-mono text-zinc-500">7 fields</span>
                </div>
                <pre className="font-mono text-[11px] text-zinc-300 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                  {DEMO_OUTPUT}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why not RAG ── */}
      <section className="py-24 bg-[#0a0a0b] text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }} />

        <div className="max-w-5xl mx-auto px-6 relative">
          <div className="max-w-xl mb-12">
            <span className="text-[11px] font-mono tracking-[0.2em] uppercase text-amber-400/70">
              Why not RAG?
            </span>
            <h2 className="text-3xl md:text-[2.4rem] font-bold mt-2 leading-tight">
              RAG fails on<br />homogeneous collections.
            </h2>
            <p className="text-white/45 mt-3 leading-relaxed text-sm max-w-sm">
              You have 500 invoices. They all look alike to a similarity search.
              Now ask a real business question.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 md:p-8 mb-10 shadow-[0_0_60px_rgba(255,255,255,0.05)] ring-1 ring-white/10">
            <img
              src="/images/why-nor-rag.png"
              alt="RAG vs Sifter — similarity search vs structured aggregation"
              className="w-full block max-w-2xl mx-auto"
            />
            <div className="flex justify-between mt-4 max-w-2xl mx-auto px-2">
              <p className="text-[11px] text-zinc-500 font-mono">RAG · similarity, uncertain</p>
              <p className="text-[11px] text-zinc-500 font-mono">Sifter · structured, exact</p>
            </div>
          </div>

          <div className="max-w-2xl mx-auto mb-7 bg-white/[0.04] border border-white/10 rounded-lg px-5 py-3.5 font-mono text-sm flex items-center gap-3">
            <span className="text-white/20 shrink-0">›</span>
            <span className="text-amber-300/90">
              "How much did I invoice to Acme Corp in September 2026?"
            </span>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {/* RAG panel */}
            <div className="rounded-xl border border-red-500/20 bg-red-950/10 overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-red-500/15 flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                <span className="text-[11px] font-mono text-red-400 tracking-wide">
                  RAG · similarity search
                </span>
              </div>
              <div className="p-4 space-y-2 font-mono text-xs flex-1">
                <div className="bg-white/[0.03] rounded-md p-3 border-l-2 border-white/10">
                  <div className="text-white/20 mb-1">chunk_0082 · score 0.91</div>
                  <div className="text-white/50 line-through decoration-red-500/60">
                    Acme Corp · <span className="text-red-400/80">2026-03-14</span> · €4,200
                  </div>
                </div>
                <div className="bg-white/[0.03] rounded-md p-3 border-l-2 border-white/10">
                  <div className="text-white/20 mb-1">chunk_0217 · score 0.89</div>
                  <div className="text-white/50 line-through decoration-red-500/60">
                    <span className="text-red-400/80">Globex Ltd</span> · 2026-09-02 · €7,800
                  </div>
                </div>
                <div className="bg-white/[0.03] rounded-md p-3 border-l-2 border-white/10">
                  <div className="text-white/20 mb-1">chunk_0431 · score 0.87</div>
                  <div className="text-white/60">Acme Corp · 2026-09-18 · €12,400</div>
                </div>
                <div className="text-white/15 text-center py-2 text-[11px]">
                  ··· 492 invoices not retrieved
                </div>
              </div>
              <div className="px-4 py-3 border-t border-red-500/15 bg-red-950/20 space-y-1">
                <p className="text-[11px] text-red-400/90 font-mono">
                  "Approximately €12,400 – €20,000 based on available context"
                </p>
                <p className="text-[10px] text-red-500/60 font-mono">
                  ✗ wrong client in results · wrong month · 2 invoices missing
                </p>
              </div>
            </div>

            {/* Sifter panel */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-emerald-500/15 flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-[11px] font-mono text-emerald-400 tracking-wide">
                  Sifter · structured aggregation
                </span>
              </div>
              <div className="p-4 flex-1">
                <table className="w-full font-mono text-xs">
                  <thead>
                    <tr className="text-white/25 border-b border-white/10">
                      <th className="text-left pb-2 font-normal">client</th>
                      <th className="text-left pb-2 font-normal">date</th>
                      <th className="text-right pb-2 font-normal">total</th>
                    </tr>
                  </thead>
                  <tbody className="text-white/65">
                    <tr className="border-b border-white/[0.06]">
                      <td className="py-2">Acme Corp</td><td>2026-09-03</td>
                      <td className="text-right">€8,900</td>
                    </tr>
                    <tr className="border-b border-white/[0.06]">
                      <td className="py-2">Acme Corp</td><td>2026-09-18</td>
                      <td className="text-right">€12,400</td>
                    </tr>
                    <tr className="border-b border-white/[0.06]">
                      <td className="py-2">Acme Corp</td><td>2026-09-24</td>
                      <td className="text-right">€26,500</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="text-emerald-400 font-semibold">
                      <td colSpan={2} className="pt-3 text-emerald-400/70 font-normal">SUM · 3 records</td>
                      <td className="text-right pt-3">€47,800</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-emerald-500/15 bg-emerald-950/20">
                <p className="text-[11px] text-emerald-400/90 font-mono">
                  ✓ exact · complete · filter(client=Acme Corp, month=2026-09)
                </p>
              </div>
            </div>
          </div>

          <p className="text-center text-white/25 text-xs font-mono mt-10 leading-relaxed">
            "Total invoiced per client per month" is an aggregation query, not a retrieval query.
            <br />
            <span className="text-white/40">RAG was built for retrieval. Sifter was built for this.</span>
          </p>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-20 border-t">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-[11px] font-mono text-muted-foreground tracking-[0.18em] uppercase text-center mb-2">
            How it works
          </p>
          <h2 className="text-2xl font-bold text-center mb-14">Up and running in minutes</h2>
          <div className="grid md:grid-cols-3 gap-0 relative">
            <div className="hidden md:block absolute top-5 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px bg-border" />
            <Step n={1} title="Describe">
              Name a sift and describe what to extract in natural language.
            </Step>
            <Step n={2} title="Upload">
              Drag documents or connect a folder — every upload is processed automatically.
            </Step>
            <Step n={3} title="Query & export">
              Filter, aggregate, and export — or ask questions in natural language.
            </Step>
          </div>
        </div>
      </section>

      {/* ── USP — Chat / Query / Build ── */}
      <section className="py-20 border-t bg-muted/20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center mb-12">
            Everything you need to work with documents at scale.
          </h2>
          <div className="grid md:grid-cols-3 gap-5">
            <USPCard icon={<MessageSquare />} title="Chat">
              Ask questions about your documents in plain language.
              Get structured answers, not just text blobs.
              Works with Claude, ChatGPT, or any MCP-compatible client.
            </USPCard>
            <USPCard icon={<Search />} title="Query" accent>
              Define a schema. Sifter extracts exactly those fields — every time.
              Filter, sort, export. Your documents, like a database.
            </USPCard>
            <USPCard icon={<Plug />} title="Build">
              Python SDK. REST API. Webhooks. MCP server.
              Integrate Sifter into any stack, any language, any workflow.
              Open source, self-hostable, no vendor lock-in.
            </USPCard>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 border-t">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-[11px] font-mono text-muted-foreground tracking-[0.18em] uppercase text-center mb-2">
            Features
          </p>
          <h2 className="text-2xl font-bold text-center mb-12">
            Built for developers. Usable by everyone.
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <FeatureCard icon={<Filter />} title="Schema-driven extraction">
              Define your data model in natural language or JSON. Sifter extracts exactly those fields — every time.
            </FeatureCard>
            <FeatureCard icon={<Shield />} title="Verifiable citations">
              Every extracted field is anchored to a page number and source text. No hallucinations you can't trace.
            </FeatureCard>
            <FeatureCard icon={<Cpu />} title="Multi-LLM support">
              Works with OpenAI, Anthropic, Gemini, Mistral, and 50+ providers via LiteLLM. Bring your own key.
            </FeatureCard>
            <FeatureCard icon={<Folder />} title="Multi-document pipelines">
              Link folders to multiple extractors. Every upload triggers all linked sifts automatically.
            </FeatureCard>
            <FeatureCard icon={<Database />} title="NL query">
              Query extracted records in plain English. "Show invoices from last month above €1000."
            </FeatureCard>
            <FeatureCard icon={<Code2 />} title="Python + TypeScript SDK">
              Full async Python SDK and TypeScript client with typed schemas generated per sift.
            </FeatureCard>
            <FeatureCard icon={<Terminal />} title="MCP native">
              Sifter speaks MCP out of the box. Connect Claude Desktop, Cursor, or any MCP-compatible tool.
            </FeatureCard>
            <FeatureCard icon={<Webhook />} title="Webhooks + dashboards">
              Trigger automations on every extraction. Visualize results in real-time dashboards.
            </FeatureCard>
            <FeatureCard icon={<Server />} title="Self-hostable">
              Full Docker Compose stack. Your data, your infrastructure, your keys. MIT licensed.
            </FeatureCard>
          </div>
        </div>
      </section>

      {/* ── Use cases ── */}
      <section className="py-20 border-t bg-muted/20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-[11px] font-mono text-muted-foreground tracking-[0.18em] uppercase text-center mb-2">
            Use cases
          </p>
          <h2 className="text-2xl font-bold text-center mb-12">Any homogeneous document collection.</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: "🧾", title: "Invoices", desc: "Extract supplier, amounts, VAT, line items from any invoice format." },
              { icon: "📄", title: "CVs / Resumes", desc: "Turn a folder of candidates into a queryable talent database — works across any CV layout." },
              { icon: "📋", title: "Contracts", desc: "Pull parties, dates, governing law, and key obligations from contracts of any structure." },
              { icon: "💡", title: "Utility bills", desc: "Parse electricity, gas, water, and phone bills across all providers into a single dataset." },
              { icon: "🧾", title: "Receipts", desc: "Capture merchant, items, totals, and payment method from paper or digital receipts." },
              { icon: "🏦", title: "Bank statements", desc: "Extract transactions, balances, and period from statements regardless of bank format." },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="border rounded-xl p-5 bg-card flex gap-4 items-start">
                <span className="text-2xl shrink-0">{icon}</span>
                <div>
                  <h3 className="font-semibold text-sm">{title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-8">
            Any homogeneous document collection works — these are just the most common.
          </p>
        </div>
      </section>

      {/* ── MCP / Integrations ── */}
      <section className="py-20 border-t">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div>
              <div className="inline-flex items-center gap-1.5 bg-primary/8 text-primary text-xs font-medium px-3 py-1 rounded-full mb-5 border border-primary/20">
                <Link2 className="h-3 w-3" /> MCP native
              </div>
              <h2 className="text-2xl font-bold leading-tight">
                Your LLM can now<br />read your documents.
              </h2>
              <p className="text-muted-foreground mt-3 leading-relaxed text-sm">
                Sifter exposes an MCP server — the protocol that lets Claude, ChatGPT, Cursor,
                and other AI tools access external data. Point it at Sifter Cloud and your LLM
                gets instant, structured access to every document you've uploaded.
              </p>

              {/* Integration icons */}
              <div className="mt-6 flex flex-wrap gap-2">
                {["Claude Desktop", "ChatGPT", "Cursor", "Continue", "Zed"].map((name) => (
                  <span key={name}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-md border bg-muted/40 text-muted-foreground">
                    {name}
                  </span>
                ))}
              </div>

              <div className="mt-6 flex gap-4">
                <Link to="/register"
                  className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1.5">
                  Get your MCP URL <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <a href={DOCS_URL + "/integrations/mcp-server"} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors">
                  Read the MCP guide <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            <div className="bg-[#111113] rounded-2xl p-5 font-mono text-xs border border-white/5">
              <p className="text-zinc-400 mb-1 text-[10px] uppercase tracking-widest">
                claude_desktop_config.json
              </p>
              <p className="text-zinc-500 mb-3 text-[10px]">
                Paste this in Claude Desktop → Settings → MCP. That's it.
              </p>
              <pre className="text-zinc-200 leading-relaxed overflow-x-auto">
                <code>
                  {"{\n"}
                  {'  '}
                  <span className="text-amber-300">"mcpServers"</span>
                  {": {\n"}
                  {'    '}
                  <span className="text-amber-300">"sifter"</span>
                  {": {\n"}
                  {'      '}
                  <span className="text-amber-300">"type"</span>
                  {": "}
                  <span className="text-emerald-400">"http"</span>
                  {",\n"}
                  {'      '}
                  <span className="text-amber-300">"url"</span>
                  {": "}
                  <span className="text-emerald-400">"https://api.sifter.run/mcp/sk-..."</span>
                  {"\n"}
                  {"    }\n"}
                  {"  }\n"}
                  {"}"}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── OSS section ── */}
      <section className="py-16 border-t bg-muted/20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-1.5 bg-primary/8 text-primary text-xs font-medium px-3 py-1 rounded-full mb-5 border border-primary/20">
                <GitBranch className="h-3 w-3" /> MIT · Self-hostable
              </div>
              <h2 className="text-2xl font-bold leading-tight">Open source at the core.</h2>
              <p className="text-muted-foreground mt-3 leading-relaxed text-sm">
                Sifter is MIT-licensed and fully open source. Self-host the complete stack —
                chat, dashboards, webhooks, SDK, and MCP stdio — with a single Docker Compose command.
                No features crippled, no artificial limitations.
              </p>

              {/* OSS metrics */}
              <div className="mt-6 flex gap-6">
                <div>
                  <p className="text-sm font-semibold">📦 MIT</p>
                  <p className="text-xs text-muted-foreground">license</p>
                </div>
              </div>

              <div className="mt-6 flex gap-4">
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1.5">
                  View on GitHub <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <a href={DOCS_URL + "/self-hosting/docker-compose"} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors">
                  Read the docs <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            <div className="bg-[#111113] rounded-2xl p-5 font-mono text-xs border border-white/5">
              <p className="text-zinc-400 mb-3"># self-host in two commands</p>
              <pre className="text-zinc-200 leading-relaxed">
                <code>
                  <span className="text-zinc-500">$ </span>
                  {"git clone https://github.com/sifter-ai/sifter\n"}
                  <span className="text-zinc-500">$ </span>
                  {"docker compose up"}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="py-20 border-t">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-[11px] font-mono text-muted-foreground tracking-[0.18em] uppercase text-center mb-2">
            Pricing
          </p>
          <h2 className="text-2xl font-bold text-center mb-3">Start free. Scale when you need to.</h2>
          <p className="text-sm text-muted-foreground text-center max-w-xl mx-auto mb-12">
            All paid plans include the same features — API access, MCP remote, Google Drive connector,
            advanced chat, live dashboards, and webhooks.
            The only difference is the number of extractions per month.
            1 extraction = 1 document processed by a sift (up to 10 pages).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <PricingCard name="Free" price="$0" period="forever" docs="10 extractions/mo" sifts="3 sifts" features={[
              "1 workspace",
              "Web UI",
              "7-day retention",
              "No API access",
              "No MCP remote",
            ]} cta="Try Sifter" highlighted={false} />
            <PricingCard name="Starter" price="$19" period="per month" docs="500 extractions/mo" sifts="10 sifts" features={[
              "Multiple workspaces",
              "Full REST API",
              "MCP remote endpoint",
              "Google Drive connector",
              "Mail-to-upload",
              "CSV export",
              "Unlimited retention",
            ]} cta="Start free →" highlighted={false} />
            <PricingCard name="Pro" price="$49" period="per month" docs="3,000 extractions/mo" sifts="∞ sifts" features={[
              "Everything in Starter",
              "SSO (Google)",
              "Audit log",
            ]} cta="Get started →" highlighted={true} />
            <PricingCard name="Business" price="$149" period="per month" docs="15,000 extractions/mo" sifts="∞ sifts" features={[
              "Everything in Pro",
              "PDF report export",
              "Advanced webhooks",
              "Unlimited shares",
            ]} cta="Get started" highlighted={false} />
            <PricingCard name="Scale" price="$399" period="per month" docs="50,000 extractions/mo" sifts="∞ sifts" features={[
              "Everything in Business",
              "Share via email + PDF",
              "Priority support",
            ]} cta="Get started" highlighted={false} />
          </div>

          <p className="text-center text-xs text-muted-foreground mt-8">
            Or self-host for free.{" "}
            <a href={DOCS_URL + "/self-hosting/docker-compose"} target="_blank" rel="noopener noreferrer"
              className="text-primary hover:underline">
              Docker setup guide →
            </a>
            {"  ·  "}
            <Link to="/enterprise" className="text-primary hover:underline">
              Enterprise — custom SLA, BYOK LLM, on-prem →
            </Link>
          </p>
        </div>
      </section>

      {/* ── Two ways to run ── */}
      <section className="py-20 border-t bg-muted/20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-[11px] font-mono text-muted-foreground tracking-[0.18em] uppercase text-center mb-2">
            Deployment
          </p>
          <h2 className="text-2xl font-bold text-center mb-12">Two ways to run Sifter</h2>
          <div className="grid md:grid-cols-2 gap-5">
            <div className="rounded-2xl border bg-gradient-to-br from-primary/5 to-background p-8 flex flex-col gap-5 relative overflow-hidden">
              <div className="absolute top-4 right-4 text-[10px] font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                Recommended
              </div>
              <div className="bg-primary/10 text-primary rounded-lg p-2.5 w-fit">
                <LayoutDashboard className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Sifter Cloud</h3>
                <p className="text-sm text-muted-foreground mt-1">Sign up and start in minutes</p>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                No infrastructure to manage. Web UI, REST API, Python SDK, and MCP — all on Sifter's hosted platform.
              </p>
              <Link to="/register"
                className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1.5">
                Get started free <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="rounded-2xl border bg-[#111113] text-white p-8 flex flex-col gap-5">
              <div className="bg-white/10 text-white/80 rounded-lg p-2.5 w-fit">
                <GitBranch className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Sifter Self-hosted</h3>
                <p className="text-sm text-white/40 mt-1">Open source · MIT</p>
              </div>
              <p className="text-sm text-white/50 leading-relaxed flex-1">
                Run on your own infrastructure. Bring your own LLM API key. Full control over data, storage, and scaling.
              </p>
              <div className="font-mono text-xs bg-white/5 rounded-lg px-3 py-2 text-white/60 border border-white/10">
                docker compose up -d
              </div>
              <a href={DOCS_URL + "/self-hosting/docker-compose"} target="_blank" rel="noopener noreferrer"
                className="text-sm font-medium text-white/60 hover:text-white inline-flex items-center gap-1.5 transition-colors">
                Read the docs <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-24 border-t bg-[#0a0a0b] text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }} />
        <div className="max-w-2xl mx-auto px-6 text-center relative">
          <h2 className="text-3xl md:text-4xl font-bold">Start extracting in minutes.</h2>
          <p className="text-white/45 mt-3 text-sm">
            Free tier forever. Self-host anytime. No credit card required.
          </p>
          <div className="mt-8 flex gap-3 justify-center flex-wrap">
            <Link to="/register"
              className="bg-primary text-primary-foreground px-6 py-3 rounded-md font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-2">
              Try Sifter free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/enterprise"
              className="border border-white/20 text-white/80 px-6 py-3 rounded-md font-medium hover:bg-white/5 transition-colors inline-flex items-center gap-2">
              Book a demo <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-6 text-white/25 text-xs">
            Questions?{" "}
            <a href="mailto:hello@sifter.ai" className="text-white/40 hover:text-white/60 transition-colors">
              hello@sifter.ai
            </a>
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t py-12 bg-muted/10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <img src={logo} alt="Sifter" className="h-5 w-5" />
                <span className="font-bold text-primary">Sifter</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Open-source document intelligence. MIT licensed.
              </p>
            </div>

            {/* Product */}
            <div>
              <p className="text-xs font-semibold mb-3 tracking-wide">Product</p>
              <div className="flex flex-col gap-2">
                {[
                  { label: "Features", to: "/#features" },
                  { label: "Pricing", to: "/#pricing" },
                  { label: "Changelog", href: DOCS_URL + "/resources/changelog" },
                  { label: "Roadmap", href: GITHUB_URL + "/issues" },
                  { label: "Enterprise", to: "/enterprise" },
                ].map((l) => (
                  <FooterLink key={l.label} {...l} />
                ))}
              </div>
            </div>

            {/* Developers */}
            <div>
              <p className="text-xs font-semibold mb-3 tracking-wide">Developers</p>
              <div className="flex flex-col gap-2">
                {[
                  { label: "Docs", href: DOCS_URL },
                  { label: "SDK reference", href: DOCS_URL + "/integrations/python-sdk" },
                  { label: "MCP guide", href: DOCS_URL + "/integrations/mcp-server" },
                  { label: "API reference", href: DOCS_URL + "/integrations/rest-api" },
                  { label: "Self-hosting", href: DOCS_URL + "/self-hosting/docker-compose" },
                ].map((l) => (
                  <FooterLink key={l.label} {...l} />
                ))}
              </div>
            </div>

            {/* Company */}
            <div>
              <p className="text-xs font-semibold mb-3 tracking-wide">Company</p>
              <div className="flex flex-col gap-2">
                {[
                  { label: "GitHub ↗", href: GITHUB_URL },
                  { label: "Twitter ↗", href: "https://twitter.com/sifterai" },
                  { label: "Discord ↗", href: "https://discord.gg/sifter" },
                  { label: "Blog", href: DOCS_URL + "/resources/changelog" },
                ].map((l) => (
                  <FooterLink key={l.label} {...l} />
                ))}
              </div>
            </div>

            {/* Legal */}
            <div>
              <p className="text-xs font-semibold mb-3 tracking-wide">Legal</p>
              <div className="flex flex-col gap-2">
                {[
                  { label: "Privacy", to: "/privacy" },
                  { label: "Terms", to: "/terms" },
                  { label: "Cookie policy", to: "/privacy" },
                ].map((l) => (
                  <FooterLink key={l.label} {...l} />
                ))}
              </div>
            </div>
          </div>

          <div className="border-t pt-6 flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-muted-foreground">© 2025 Sifter. MIT Licensed.</p>
            <p className="text-xs text-muted-foreground">
              <a href="mailto:hello@sifter.ai" className="hover:text-foreground transition-colors">
                hello@sifter.ai
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FeatureCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-xl p-6 bg-card hover:bg-muted/40 transition-colors">
      <div className="text-primary mb-4">
        {React.cloneElement(icon as React.ReactElement, { className: "h-5 w-5" })}
      </div>
      <h3 className="font-semibold text-sm">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{children}</p>
    </div>
  );
}

function USPCard({ icon, title, children, accent }: {
  icon: React.ReactNode; title: string; children: React.ReactNode; accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-7 flex flex-col gap-4 ${accent ? "bg-primary text-primary-foreground" : "border bg-card"}`}>
      <div className={`rounded-xl p-3 w-fit ${accent ? "bg-white/15" : "bg-primary/10 text-primary"}`}>
        {React.cloneElement(icon as React.ReactElement, { className: "h-5 w-5" })}
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className={`text-sm leading-relaxed ${accent ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
        {children}
      </p>
    </div>
  );
}

function UseCaseCard({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-xl p-6 bg-card flex flex-col gap-4">
      <span className="text-[10px] font-mono tracking-[0.18em] uppercase text-primary bg-primary/8 px-2.5 py-1 rounded-full w-fit border border-primary/20">
        {label}
      </span>
      <h3 className="font-semibold">{title}</h3>
      <div className="flex gap-3 flex-1">
        <Quote className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground leading-relaxed italic">{children}</p>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 text-center px-6 relative">
      <div className="w-10 h-10 rounded-full bg-background border-2 border-primary text-primary text-sm font-bold flex items-center justify-center mx-auto relative z-10">
        {n}
      </div>
      <h3 className="font-semibold mt-4 text-sm">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{children}</p>
    </div>
  );
}

function PricingCard({
  name, price, period, docs, sifts, features, cta, highlighted,
}: {
  name: string; price: string; period: string; docs: string; sifts: string;
  features: string[]; cta: string; highlighted: boolean;
}) {
  return (
    <div className={highlighted
      ? "relative rounded-2xl border-2 border-primary bg-gradient-to-b from-primary/5 to-background p-6 flex flex-col shadow-lg"
      : "rounded-2xl border bg-card p-6 flex flex-col"
    }>
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-semibold px-3 py-1 rounded-full tracking-wide uppercase">
          Most popular
        </div>
      )}
      <h3 className="font-semibold text-base">{name}</h3>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-3xl font-bold tracking-tight">{price}</span>
        <span className="text-xs text-muted-foreground">/ {period}</span>
      </div>
      <div className="mt-4 pb-4 border-b">
        <p className="text-sm font-medium">{docs}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sifts}</p>
      </div>
      <ul className="mt-4 space-y-2 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link to="/register"
        className={highlighted
          ? "mt-6 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium text-center hover:opacity-90 transition-opacity"
          : "mt-6 border border-input px-4 py-2 rounded-md text-sm font-medium text-center hover:bg-muted/60 transition-colors"
        }
      >
        {cta}
      </Link>
    </div>
  );
}

function FooterLink({ label, to, href }: { label: string; to?: string; href?: string }) {
  const cls = "text-xs text-muted-foreground hover:text-foreground transition-colors";
  if (to) return <Link to={to} className={cls}>{label}</Link>;
  return <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{label}</a>;
}
