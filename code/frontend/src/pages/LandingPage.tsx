import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Code2,
  Filter,
  Folder,
  GitBranch,
  LayoutDashboard,
  Terminal,
  Webhook,
  Zap,
} from "lucide-react";
import logo from "@/assets/logo.svg";

const DOCS_URL = "https://docs.sifter.ai";
const GITHUB_URL = "https://github.com/bfortunato/sifter";

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
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2">
              Docs
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2">
              GitHub
            </a>
            <Link to="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2">
              Sign in
            </Link>
            <Link to="/register"
              className="ml-2 bg-primary text-primary-foreground px-4 py-1.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
              Get Started →
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero: two-column ── */}
      <section className="py-16 md:py-24 overflow-hidden">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-[1fr_1.1fr] gap-10 items-center">

            {/* Left: text + code */}
            <div>
              <span className="inline-flex items-center gap-1.5 border border-primary/25 text-primary text-[11px] font-medium px-3 py-1 rounded-full bg-primary/5 mb-6 tracking-wide">
                Open Source · Apache 2.0
              </span>
              <h1 className="text-[2.6rem] md:text-[3.2rem] font-bold tracking-tight leading-[1.08] text-foreground">
                Turn documents<br />into structured<br />data — instantly.
              </h1>
              <p className="text-muted-foreground mt-5 leading-relaxed max-w-sm text-[15px]">
                Upload documents. Describe what to extract in natural language.
                Query results with real aggregations — not guesswork.
              </p>
              <div className="mt-7 flex gap-3 flex-wrap">
                <Link to="/register"
                  className="bg-primary text-primary-foreground px-5 py-2.5 rounded-md font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-2 text-sm">
                  Get Started <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <a href={DOCS_URL} target="_blank" rel="noopener noreferrer"
                  className="border border-input px-5 py-2.5 rounded-md text-sm font-medium hover:bg-muted/60 transition-colors">
                  Read the Docs
                </a>
              </div>

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

            {/* Right: hero image in white card */}
            <div className="relative">
              <div className="bg-white rounded-2xl shadow-2xl overflow-hidden ring-1 ring-black/5">
                <img
                  src="/images/hero.png"
                  alt="Documents becoming structured data"
                  className="w-full block"
                />
              </div>
              {/* Floating badge */}
              <div className="absolute -bottom-5 -left-5 hidden md:block bg-background border rounded-xl px-4 py-3 shadow-xl ring-1 ring-black/5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Works via</p>
                <p className="text-sm font-semibold mt-0.5 text-foreground">UI · API · SDK · MCP</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why not RAG ── */}
      <section className="py-24 bg-[#0a0a0b] text-white relative overflow-hidden">
        {/* subtle dot-grid */}
        <div className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }} />

        <div className="max-w-5xl mx-auto px-6 relative">
          {/* Heading */}
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

          {/* Concept illustration — white card so image background matches */}
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

          {/* Query prompt */}
          <div className="max-w-2xl mx-auto mb-7 bg-white/[0.04] border border-white/10 rounded-lg px-5 py-3.5 font-mono text-sm flex items-center gap-3">
            <span className="text-white/20 shrink-0">›</span>
            <span className="text-amber-300/90">
              "How much did I invoice to Acme Corp in September 2026?"
            </span>
          </div>

          {/* Comparison panels — SACRED, unchanged */}
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

      {/* ── How it works — 3 steps ── */}
      <section className="py-20 border-t">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-[11px] font-mono text-muted-foreground tracking-[0.18em] uppercase text-center mb-2">
            How it works
          </p>
          <h2 className="text-2xl font-bold text-center mb-14">Up and running in minutes</h2>
          <div className="grid md:grid-cols-3 gap-0 relative">
            {/* connector line */}
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

      {/* ── Features ── */}
      <section className="py-20 border-t bg-muted/20">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-[11px] font-mono text-muted-foreground tracking-[0.18em] uppercase text-center mb-2">
            Features
          </p>
          <h2 className="text-2xl font-bold text-center mb-12">
            Everything you need to process documents at scale
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <FeatureCard icon={<Filter />} title="Zero-config extraction">
              Define rules in natural language. Schema is inferred automatically from the first processed document.
            </FeatureCard>
            <FeatureCard icon={<Folder />} title="Multi-document pipelines">
              Link folders to multiple extractors. Every upload triggers all linked sifts automatically.
            </FeatureCard>
            <FeatureCard icon={<Zap />} title="Queryable results">
              Filter, sort, aggregate, and export. Ask questions in natural language over your extracted data.
            </FeatureCard>
            <FeatureCard icon={<Code2 />} title="Python SDK">
              Full async SDK with SiftHandle, FolderHandle, polling helpers, and event callbacks.
            </FeatureCard>
            <FeatureCard icon={<Terminal />} title="MCP server">
              Connect Claude Desktop or Cursor to your extracted records via the Model Context Protocol.
            </FeatureCard>
            <FeatureCard icon={<Webhook />} title="Webhooks">
              Fire HTTP callbacks on extraction events. Wildcard patterns. Retry on failure.
            </FeatureCard>
          </div>
        </div>
      </section>

      {/* ── Two ways to run Sifter ── */}
      <section className="py-20 border-t">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-[11px] font-mono text-muted-foreground tracking-[0.18em] uppercase text-center mb-2">
            Deployment
          </p>
          <h2 className="text-2xl font-bold text-center mb-12">Two ways to run Sifter</h2>
          <div className="grid md:grid-cols-2 gap-5">
            {/* Cloud */}
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

            {/* Self-hosted */}
            <div className="rounded-2xl border bg-[#111113] text-white p-8 flex flex-col gap-5">
              <div className="bg-white/10 text-white/80 rounded-lg p-2.5 w-fit">
                <GitBranch className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Sifter Self-hosted</h3>
                <p className="text-sm text-white/40 mt-1">Open source · Apache 2.0</p>
              </div>
              <p className="text-sm text-white/50 leading-relaxed flex-1">
                Run on your own infrastructure. Bring your own LLM API key. Full control over data, storage, and scaling.
              </p>
              <div className="font-mono text-xs bg-white/5 rounded-lg px-3 py-2 text-white/60 border border-white/10">
                docker compose up -d
              </div>
              <a href={DOCS_URL} target="_blank" rel="noopener noreferrer"
                className="text-sm font-medium text-white/60 hover:text-white inline-flex items-center gap-1.5 transition-colors">
                Read the docs <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Open source + MCP snippet ── */}
      <section className="py-16 border-t bg-muted/20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-1.5 bg-primary/8 text-primary text-xs font-medium px-3 py-1 rounded-full mb-5 border border-primary/20">
                <GitBranch className="h-3 w-3" /> Apache 2.0 · Self-hostable
              </div>
              <h2 className="text-2xl font-bold leading-tight">Open source.<br />No lock-in.</h2>
              <p className="text-muted-foreground mt-3 leading-relaxed text-sm">
                Inspect the code, bring your own LLM API key, run on any server with MongoDB.
                Connect Claude Desktop or Cursor via the MCP server in one line.
              </p>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                View on GitHub <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
            <div className="bg-[#111113] rounded-2xl p-5 font-mono text-xs border border-white/5">
              <p className="text-zinc-400 mb-3"># claude_desktop_config.json</p>
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
                  <span className="text-amber-300">"command"</span>
                  {": "}
                  <span className="text-emerald-400">"uvx"</span>
                  {",\n"}
                  {'      '}
                  <span className="text-amber-300">"args"</span>
                  {": ["}
                  <span className="text-emerald-400">"sifter-mcp"</span>
                  {"],\n"}
                  {'      '}
                  <span className="text-amber-300">"env"</span>
                  {": { "}
                  <span className="text-amber-300">"SIFTER_API_KEY"</span>
                  {": "}
                  <span className="text-emerald-400">"sk-..."</span>
                  {" }\n"}
                  {"    }\n"}
                  {"  }\n"}
                  {"}"}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── Enterprise ── */}
      <section className="py-16 border-t">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-xl font-semibold">Need SSO, on-prem, or a custom SLA?</h2>
          <p className="text-muted-foreground mt-2 text-sm max-w-md mx-auto">
            Dedicated deployments with SSO, audit logging, RBAC, BYOK LLM, and enterprise support.
          </p>
          <Link to="/enterprise"
            className="mt-6 inline-flex items-center gap-2 border border-input px-6 py-2.5 rounded-md text-sm font-medium hover:bg-muted/50 transition-colors">
            Contact us <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t py-8">
        <div className="flex items-center justify-between max-w-6xl mx-auto px-6 text-sm text-muted-foreground flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Sifter" className="h-5 w-5" />
            <span>Sifter — Apache 2.0</span>
          </div>
          <div className="flex items-center gap-5">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
              className="hover:text-foreground transition-colors">GitHub</a>
            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer"
              className="hover:text-foreground transition-colors">Docs</a>
            <Link to="/enterprise" className="hover:text-foreground transition-colors">Enterprise</Link>
            <Link to="/register" className="hover:text-foreground transition-colors">Get Started</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-xl p-6 bg-card hover:bg-muted/40 transition-colors group">
      <div className="text-primary mb-4">
        {React.cloneElement(icon as React.ReactElement, { className: "h-5 w-5" })}
      </div>
      <h3 className="font-semibold text-sm">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{children}</p>
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
