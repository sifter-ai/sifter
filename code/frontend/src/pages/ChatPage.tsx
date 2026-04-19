import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  FileText,
  Search,
  Sparkles,
  Plus,
  Database,
  CornerDownLeft,
} from "lucide-react";
import { ChatInterface } from "@/components/ChatInterface";
import { useSifts } from "@/hooks/useExtractions";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { Sift } from "@/api/types";

// Editorial starter prompts — match CloudChatPage energy
const STARTER_PROMPTS: { icon: typeof FileText; text: string }[] = [
  { icon: Search, text: "What are the main topics across my documents?" },
  { icon: BarChart3, text: "Show me a breakdown of records by category" },
  { icon: FileText, text: "Summarize the most recent sift I created" },
  { icon: Sparkles, text: "Suggest a dashboard I could build from my data" },
];

function SiftScopeItem({ sift }: { sift: Sift }) {
  return (
    <Link
      to={`/sifts/${sift.id}`}
      className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
    >
      <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 group-hover:text-amber-500 transition-colors" strokeWidth={1.75} />
      <span className="truncate flex-1">{sift.name}</span>
      <span className="font-mono text-[10px] tabular-nums text-muted-foreground/50 shrink-0">
        {sift.processed_documents}
      </span>
    </Link>
  );
}

export function ChatPage() {
  const { data: sifts, isLoading: siftsLoading } = useSifts();
  const siftCount = sifts?.length ?? 0;
  const [clearKey, setClearKey] = useState(0);

  const visibleSifts = useMemo(() => (sifts ?? []).slice(0, 12), [sifts]);
  const hiddenCount = Math.max(0, siftCount - visibleSifts.length);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Unified top rail — mirrors FolderBrowserPage for visual consistency */}
      <header className="flex h-14 shrink-0 border-b">
        {/* Left slot — matches the inner sidebar width below, bg-muted/20 so the column reads as one strip */}
        <div className="w-60 shrink-0 flex items-center px-3 border-r bg-muted/20">
          <button
            onClick={() => setClearKey((k) => k + 1)}
            className="group relative w-full h-9 rounded-lg overflow-hidden bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1.5 shadow-sm hover:shadow-md transition-all hover:-translate-y-px active:translate-y-0 active:shadow-sm"
          >
            <span className="absolute inset-0 bg-gradient-to-t from-black/10 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Plus className="h-3.5 w-3.5 relative transition-transform group-hover:rotate-90" />
            <span className="relative">New question</span>
          </button>
        </div>

        {/* Right slot — breadcrumb + contextual actions */}
        <div className="flex-1 flex items-center gap-3 px-5 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/60 shrink-0">
              Chat
            </span>
            <span className="h-px w-5 bg-border shrink-0" aria-hidden />
            <span className="text-sm font-semibold tracking-tight text-foreground truncate">
              Ask your documents
            </span>
          </div>

          {siftCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/5 px-2.5 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
              </span>
              <Sparkles className="h-3 w-3" />
              <span>
                Agent · {siftCount} sift{siftCount !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Body — inner sidebar (sifts scope + starters) + main chat */}
      <div className="flex flex-1 min-h-0">
        {/* Inner sidebar */}
        <aside className="w-60 shrink-0 border-r flex flex-col bg-muted/20">
          <nav className="flex-1 overflow-y-auto p-2 space-y-5">
            {/* Sifts in scope */}
            <div>
              <div className="flex items-center gap-2 px-2 pb-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                  In scope
                </span>
                <span className="h-px flex-1 bg-border/70" aria-hidden />
              </div>
              {siftsLoading ? (
                <div className="space-y-1 px-1">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
                </div>
              ) : siftCount === 0 ? (
                <div className="px-3 py-8 text-center space-y-2">
                  <Database className="h-5 w-5 mx-auto text-muted-foreground/40" strokeWidth={1.5} />
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">
                    No sifts yet
                  </p>
                  <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                    Create a sift to give the<br />agent something to search.
                  </p>
                  <Link to="/">
                    <Button size="sm" variant="outline" className="h-7 mt-2 text-[11px] gap-1">
                      <Plus className="h-3 w-3" /> New sift
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {visibleSifts.map((s) => (
                    <SiftScopeItem key={s.id} sift={s} />
                  ))}
                  {hiddenCount > 0 && (
                    <p className="px-2 pt-1 font-mono text-[10px] text-muted-foreground/50">
                      +{hiddenCount} more
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Starter prompts — read-only hints for now (ChatInterface owns the input) */}
            {siftCount > 0 && (
              <div>
                <div className="flex items-center gap-2 px-2 pb-2">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                    Starters
                  </span>
                  <span className="h-px flex-1 bg-border/70" aria-hidden />
                </div>
                <ul className="space-y-1">
                  {STARTER_PROMPTS.map(({ icon: Icon, text }, i) => (
                    <li
                      key={text}
                      className="flex items-start gap-2 rounded-md px-2 py-1.5 text-[12px] text-muted-foreground/80 leading-snug"
                    >
                      <span className="font-mono text-[10px] font-semibold tabular-nums text-amber-600/70 dark:text-amber-400/70 pt-[1px] shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <Icon className="h-3.5 w-3.5 text-muted-foreground/50 mt-0.5 shrink-0" strokeWidth={1.75} />
                      <span className="truncate" title={text}>
                        {text}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 px-2 font-mono text-[10px] text-muted-foreground/45 leading-relaxed">
                  Paste any of these into the chat to try
                </p>
              </div>
            )}
          </nav>

          {/* Footer hint */}
          <div className="border-t px-3 py-2.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/50">
            <CornerDownLeft className="h-3 w-3" strokeWidth={2} />
            <span>Press enter to ask</span>
          </div>
        </aside>

        {/* Main chat panel */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Subtle atmospheric backdrop — amber warmth near the top */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[280px]"
            style={{
              background:
                "radial-gradient(900px 260px at 25% -20%, hsl(40 92% 58% / 0.09), transparent 60%), radial-gradient(600px 220px at 85% -15%, hsl(263 72% 52% / 0.06), transparent 55%)",
            }}
            aria-hidden
          />
          <div className="relative flex-1 min-h-0">
            <ChatInterface key={clearKey} height="100%" />
          </div>
        </div>
      </div>
    </div>
  );
}
