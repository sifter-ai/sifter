import { useState } from "react";
import { Bot, Check, Copy, ExternalLink, KeyRound, Sparkles, Zap } from "lucide-react";
import { useConfig } from "@/context/ConfigContext";

const CLOUD_MCP_URL = "https://sifter.run/mcp";

function CodeBlock({ code, language = "json" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-lg border bg-muted/40 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/60">
        <span className="text-xs text-muted-foreground font-mono">{language}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="px-4 py-3 text-sm font-mono overflow-x-auto leading-relaxed">{code}</pre>
    </div>
  );
}

// ─── OSS (self-host, stdio) snippets ──────────────────────────────────────────

const ossClaudeDesktop = `{
  "mcpServers": {
    "sifter": {
      "command": "uvx",
      "args": ["sifter-mcp"],
      "env": {
        "SIFTER_BASE_URL": "http://localhost:8000",
        "SIFTER_API_KEY": "your-api-key"
      }
    }
  }
}`;

const ossClaudeCode = `claude mcp add sifter \\
  -e SIFTER_BASE_URL=http://localhost:8000 \\
  -e SIFTER_API_KEY=your-api-key \\
  -- uvx sifter-mcp`;

const ossCursor = `{
  "mcpServers": {
    "sifter": {
      "command": "uvx",
      "args": ["sifter-mcp"],
      "env": {
        "SIFTER_BASE_URL": "http://localhost:8000",
        "SIFTER_API_KEY": "your-api-key"
      }
    }
  }
}`;

// ─── Cloud (remote HTTP) snippet builders ─────────────────────────────────────

function cloudClaudeDesktop(url: string) {
  return `{
  "mcpServers": {
    "sifter": {
      "url": "${url}",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`;
}

function cloudClaudeCode(url: string) {
  return `claude mcp add sifter --url ${url} \\
  --header "Authorization: Bearer YOUR_API_KEY"`;
}

function cloudCursor(url: string) {
  return `{
  "mcpServers": {
    "sifter": {
      "url": "${url}",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MCPSetupPage() {
  const { mode } = useConfig();

  return (
    <div className="relative min-h-full">
      {/* Atmospheric backdrop */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[240px] -z-10"
        style={{
          background:
            "radial-gradient(900px 280px at 25% -10%, hsl(263 72% 52% / 0.10), transparent 60%), radial-gradient(700px 220px at 85% -20%, hsl(160 72% 45% / 0.07), transparent 55%)",
        }}
        aria-hidden
      />
      <div className="px-6 py-10 max-w-6xl mx-auto space-y-8">
        {/* Editorial header */}
        <header className="flex items-end justify-between gap-6 flex-wrap pb-6 border-b border-border/70">
          <div className="flex-1 min-w-0 space-y-2.5">
            <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground/70">
              <Bot className="h-3 w-3 text-primary/80" strokeWidth={2.25} />
              <span>Build</span>
              <span className="h-px w-6 bg-border" aria-hidden />
              <span>AI clients</span>
            </div>
            <h1 className="text-[34px] leading-[1.05] font-bold tracking-[-0.025em] text-foreground">
              MCP
            </h1>
            <p className="text-sm text-muted-foreground/90 max-w-xl leading-relaxed">
              Let Claude, ChatGPT, Gemini, Cursor — any MCP-aware client — query your sifts directly via the{" "}
              <a
                href="https://modelcontextprotocol.io"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 text-foreground/85 hover:text-foreground transition-colors"
              >
                Model Context Protocol
              </a>
              .{" "}
              <span className="text-foreground/80">Every sift becomes a tool they can call.</span>
            </p>
          </div>
        </header>

        {mode === "cloud" ? <CloudMCPBody /> : <OssMCPBody />}
      </div>
    </div>
  );
}

// ─── Cloud body — remote, zero install, Starter+ ──────────────────────────────

function CloudMCPBody() {
  const remoteUrl = CLOUD_MCP_URL;
  const [copiedUrl, setCopiedUrl] = useState(false);

  const copyUrl = async () => {
    await navigator.clipboard.writeText(remoteUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div className="max-w-3xl space-y-8">
      {/* Hero: the remote endpoint */}
      <section className="rounded-2xl border bg-gradient-to-br from-primary/[0.08] via-transparent to-emerald-500/[0.06] p-6 space-y-4 relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full blur-3xl opacity-40"
          style={{ background: "radial-gradient(closest-side, hsl(160 72% 45% / 0.3), transparent)" }}
          aria-hidden
        />
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-primary/90">
          <Sparkles className="h-3 w-3" strokeWidth={2.25} />
          <span>Sifter Cloud MCP</span>
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold tracking-tight">
            One URL. One API key. Zero install.
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
            Paste this endpoint into any MCP-aware client — Claude Desktop, ChatGPT, Gemini, Cursor,
            Claude Code — and authenticate with your Sifter API key in the{" "}
            <code className="font-mono text-foreground/85">Authorization</code> header. We host the server,
            rotate keys, and stream tool calls straight through to your org.
          </p>
        </div>

        {/* Step 1 — URL pill */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-primary text-[9px] font-semibold">
              1
            </span>
            <span>Endpoint</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-background/80 backdrop-blur px-3 py-2.5 font-mono text-sm">
            <span className="text-[10px] tracking-[0.12em] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 shrink-0">
              Streamable HTTP
            </span>
            <code className="flex-1 truncate text-foreground/90">{remoteUrl}</code>
            <button
              onClick={copyUrl}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              {copiedUrl ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copiedUrl ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {/* Step 2 — Authorization header */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-primary text-[9px] font-semibold">
              2
            </span>
            <span>Authentication</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-background/80 backdrop-blur px-3 py-2.5 font-mono text-sm">
            <KeyRound
              className="h-3.5 w-3.5 text-primary/80 shrink-0"
              strokeWidth={2.25}
              aria-hidden
            />
            <code className="flex-1 truncate text-foreground/90">
              Authorization: Bearer <span className="text-muted-foreground">&lt;your-api-key&gt;</span>
            </code>
          </div>
          <p className="text-[11px] text-muted-foreground/90 leading-relaxed px-0.5">
            Generate a key in{" "}
            <a
              href="/api-keys"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              API Keys
            </a>
            , then paste it as the <code className="font-mono text-foreground/80">Bearer</code> token.
            The same key unlocks REST, SDK, and MCP.
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-amber-200/70 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/30 px-3 py-2.5">
          <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" strokeWidth={2.25} />
          <div className="text-xs leading-relaxed space-y-0.5">
            <p className="text-amber-900 dark:text-amber-200 font-medium">
              Remote MCP is a <span className="font-semibold">Starter</span> feature.
            </p>
            <p className="text-amber-800/80 dark:text-amber-300/80">
              Free-plan API keys receive <code className="font-mono">402</code> on any tool call.{" "}
              <a href="/settings/billing" className="underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100">
                Upgrade →
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* Client configs */}
      <section>
        <h2 className="text-sm font-medium mb-1">Claude Desktop</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Add to{" "}
          <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono">
            ~/.claude/claude_desktop_config.json
          </code>
        </p>
        <CodeBlock code={cloudClaudeDesktop(remoteUrl)} language="json" />
      </section>

      <section>
        <h2 className="text-sm font-medium mb-1">Claude Code (CLI)</h2>
        <p className="text-xs text-muted-foreground mb-3">Run once to register the remote server.</p>
        <CodeBlock code={cloudClaudeCode(remoteUrl)} language="bash" />
      </section>

      <section>
        <h2 className="text-sm font-medium mb-1">Cursor</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Add to{" "}
          <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono">~/.cursor/mcp.json</code>
        </p>
        <CodeBlock code={cloudCursor(remoteUrl)} language="json" />
      </section>

      <ToolsList />

      <DocsLink />
    </div>
  );
}

// ─── OSS body — stdio / self-host ─────────────────────────────────────────────

function OssMCPBody() {
  return (
    <div className="max-w-3xl space-y-8">
      <section>
        <h2 className="text-sm font-medium mb-1">Claude Desktop</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Add to{" "}
          <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono">
            ~/.claude/claude_desktop_config.json
          </code>
        </p>
        <CodeBlock code={ossClaudeDesktop} language="json" />
      </section>

      <section>
        <h2 className="text-sm font-medium mb-1">Claude Code (CLI)</h2>
        <p className="text-xs text-muted-foreground mb-3">Run once to register the server.</p>
        <CodeBlock code={ossClaudeCode} language="bash" />
      </section>

      <section>
        <h2 className="text-sm font-medium mb-1">Cursor</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Add to{" "}
          <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono">~/.cursor/mcp.json</code>
        </p>
        <CodeBlock code={ossCursor} language="json" />
      </section>

      <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Replace <code className="px-1 py-0.5 rounded bg-muted font-mono text-xs">your-api-key</code>{" "}
        with a key generated in{" "}
        <a href="/api-keys" className="underline underline-offset-4 hover:text-foreground transition-colors">
          API Keys
        </a>
        .
      </div>

      <ToolsList />

      <DocsLink />
    </div>
  );
}

function ToolsList() {
  return (
    <section>
      <h2 className="text-sm font-medium mb-3">Available tools</h2>
      <div className="grid gap-2">
        {[
          { name: "list_sifts", desc: "List all your sifts and their schemas" },
          { name: "query_records", desc: "Filter and retrieve records with DSL" },
          { name: "aggregate", desc: "Run aggregation pipelines (sum, count, group by…)" },
          { name: "natural_language_query", desc: "Ask a question, get records + citations" },
          { name: "get_document", desc: "Retrieve document metadata and pages" },
          { name: "upload_document", desc: "Upload a document to a folder" },
        ].map(({ name, desc }) => (
          <div key={name} className="flex items-start gap-3 text-sm">
            <code className="shrink-0 px-2 py-0.5 rounded bg-muted font-mono text-xs mt-0.5">
              {name}
            </code>
            <span className="text-muted-foreground">{desc}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DocsLink() {
  return (
    <a
      href="https://sifterai.mintlify.app/integrations/mcp-server"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline underline-offset-4"
    >
      Full MCP documentation
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}
