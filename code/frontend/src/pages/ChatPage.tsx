import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  Plus,
  Database,
  CornerDownLeft,
} from "lucide-react";
import { ChatInterface, type ChatInterfaceHandle } from "@/components/ChatInterface";
import { useSifts } from "@/hooks/useExtractions";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { ChatMessage, Sift } from "@/api/types";

function SiftScopeItem({ sift, touched }: { sift: Sift; touched: boolean }) {
  return (
    <Link
      to={`/sifts/${sift.id}`}
      className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
        touched
          ? "bg-amber-400/10 text-foreground hover:bg-amber-400/15"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
      title={touched ? "Consulted in this conversation" : undefined}
    >
      <Database
        className={`h-3.5 w-3.5 shrink-0 transition-colors ${
          touched ? "text-amber-500" : "text-muted-foreground/50 group-hover:text-amber-500"
        }`}
        strokeWidth={1.75}
      />
      <span className={`truncate flex-1 ${touched ? "font-medium" : ""}`}>{sift.name}</span>
      {touched ? (
        <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60 animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
        </span>
      ) : (
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground/50 shrink-0">
          {sift.processed_documents}
        </span>
      )}
    </Link>
  );
}

function collectTouchedSiftIds(messages: ChatMessage[]): Set<string> {
  const ids = new Set<string>();
  for (const m of messages) {
    if (!m.trace) continue;
    for (const t of m.trace) {
      const id = t.args?.["sift_id"];
      if (typeof id === "string" && id) ids.add(id);
    }
  }
  return ids;
}

export function ChatPage() {
  const { data: siftsPage, isLoading: siftsLoading } = useSifts();
  const sifts = siftsPage?.items;
  const siftCount = sifts?.length ?? 0;
  const [clearKey, setClearKey] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatRef = useRef<ChatInterfaceHandle>(null);

  // Reset touched-sift tracking whenever the user hits "New question"
  useEffect(() => {
    setMessages([]);
  }, [clearKey]);

  const touchedIds = useMemo(() => collectTouchedSiftIds(messages), [messages]);
  const hasTouched = touchedIds.size > 0;

  // Sort sifts so touched ones float to the top during the conversation
  const sortedSifts = useMemo(() => {
    if (!sifts) return [];
    if (!hasTouched) return sifts;
    return [...sifts].sort((a, b) => {
      const ta = touchedIds.has(a.id) ? 0 : 1;
      const tb = touchedIds.has(b.id) ? 0 : 1;
      return ta - tb;
    });
  }, [sifts, touchedIds, hasTouched]);

  const visibleSifts = sortedSifts.slice(0, 12);
  const hiddenCount = Math.max(0, siftCount - visibleSifts.length);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Unified top rail — mirrors FolderBrowserPage */}
      <header className="flex h-14 shrink-0 border-b">
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

      {/* Body — inner sidebar (dynamic scope) + main chat */}
      <div className="flex flex-1 min-h-0">
        <aside className="w-60 shrink-0 border-r flex flex-col bg-muted/20">
          <nav className="flex-1 overflow-y-auto p-2">
            <div className="flex items-center gap-2 px-2 pb-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                Scope
              </span>
              <span className="h-px flex-1 bg-border/70" aria-hidden />
              {hasTouched && (
                <span className="font-mono text-[10px] tabular-nums text-amber-600/80 dark:text-amber-400/80">
                  {touchedIds.size}/{siftCount}
                </span>
              )}
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
                  <SiftScopeItem key={s.id} sift={s} touched={touchedIds.has(s.id)} />
                ))}
                {hiddenCount > 0 && (
                  <p className="px-2 pt-1 font-mono text-[10px] text-muted-foreground/50">
                    +{hiddenCount} more
                  </p>
                )}
              </div>
            )}

            {hasTouched && (
              <p className="mt-4 px-2 font-mono text-[10px] leading-relaxed text-muted-foreground/55">
                <span className="text-amber-600/80 dark:text-amber-400/80">●</span> sifts the agent
                consulted in this conversation
              </p>
            )}
          </nav>

          <div className="border-t px-3 py-2.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/50">
            <CornerDownLeft className="h-3 w-3" strokeWidth={2} />
            <span>Press enter to ask</span>
          </div>
        </aside>

        {/* Main chat panel */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[280px]"
            style={{
              background:
                "radial-gradient(900px 260px at 25% -20%, hsl(40 92% 58% / 0.09), transparent 60%), radial-gradient(600px 220px at 85% -15%, hsl(263 72% 52% / 0.06), transparent 55%)",
            }}
            aria-hidden
          />
          <div className="relative flex-1 min-h-0">
            <ChatInterface
              key={clearKey}
              ref={chatRef}
              height="100%"
              onMessagesChange={setMessages}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
