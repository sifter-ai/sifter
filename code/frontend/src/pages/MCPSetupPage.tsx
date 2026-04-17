import { useState } from "react";
import { Bot, Check, Copy, ExternalLink } from "lucide-react";

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

const claudeDesktopConfig = `{
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

const claudeCodeCmd = `claude mcp add sifter \\
  -e SIFTER_BASE_URL=http://localhost:8000 \\
  -e SIFTER_API_KEY=your-api-key \\
  -- uvx sifter-mcp`;

const cursorConfig = `{
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

export default function MCPSetupPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-primary/10">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-xl font-semibold">Use Sifter with your AI</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-8">
        Connect your Sifter documents to Claude, ChatGPT, or Cursor via the{" "}
        <a
          href="https://modelcontextprotocol.io"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4 hover:text-foreground transition-colors"
        >
          Model Context Protocol (MCP)
        </a>
        . Your LLM can then query records, run aggregations, and retrieve citations directly from your sifts.
      </p>

      <div className="space-y-8">
        {/* Claude Desktop */}
        <section>
          <h2 className="text-sm font-medium mb-1">Claude Desktop</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Add to{" "}
            <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono">
              ~/.claude/claude_desktop_config.json
            </code>
          </p>
          <CodeBlock code={claudeDesktopConfig} language="json" />
        </section>

        {/* Claude Code */}
        <section>
          <h2 className="text-sm font-medium mb-1">Claude Code (CLI)</h2>
          <p className="text-xs text-muted-foreground mb-3">Run once to register the server.</p>
          <CodeBlock code={claudeCodeCmd} language="bash" />
        </section>

        {/* Cursor */}
        <section>
          <h2 className="text-sm font-medium mb-1">Cursor</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Add to{" "}
            <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono">
              ~/.cursor/mcp.json
            </code>
          </p>
          <CodeBlock code={cursorConfig} language="json" />
        </section>

        {/* API key note */}
        <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Replace <code className="px-1 py-0.5 rounded bg-muted font-mono text-xs">your-api-key</code> with
          a key generated in{" "}
          <a href="/settings/account" className="underline underline-offset-4 hover:text-foreground transition-colors">
            Settings → Account
          </a>
          .
        </div>

        {/* Available tools */}
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

        <a
          href="https://docs.sifter.ai/mcp"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline underline-offset-4"
        >
          Full MCP documentation
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
