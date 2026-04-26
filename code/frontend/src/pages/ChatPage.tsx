import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Sparkles, Plus, Database, Trash2, MessageSquare,
  ChevronDown, ChevronRight, CheckCircle2, Wrench, CornerDownLeft, Send, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useSifts } from "@/hooks/useExtractions";
import {
  fetchChatSessions, createChatSession, fetchChatSession,
  deleteChatSession, sendSessionMessage,
} from "@/api/chat";
import type { ChatSession, SessionMessage, Sift, ToolCallTrace } from "@/api/types";

// ── Session grouping ──────────────────────────────────────────

type Bucket = "today" | "yesterday" | "week" | "older";
const BUCKET_LABEL: Record<Bucket, string> = {
  today: "Today", yesterday: "Yesterday", week: "This week", older: "Older",
};
const BUCKET_ORDER: Bucket[] = ["today", "yesterday", "week", "older"];

function bucketFor(iso: string | null | undefined): Bucket {
  if (!iso) return "older";
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return "week";
  return "older";
}

function groupSessions(sessions: ChatSession[]): Record<Bucket, ChatSession[]> {
  const g: Record<Bucket, ChatSession[]> = { today: [], yesterday: [], week: [], older: [] };
  for (const s of sessions) g[bucketFor(s.updated_at ?? s.created_at)].push(s);
  return g;
}

// ── Scope helpers ─────────────────────────────────────────────

function collectTouchedSiftIds(messages: SessionMessage[]): Set<string> {
  const ids = new Set<string>();
  for (const m of messages) {
    for (const t of m.trace ?? []) {
      const id = t.args?.["sift_id"];
      if (typeof id === "string" && id) ids.add(id);
    }
  }
  return ids;
}

// ── UI atoms ──────────────────────────────────────────────────

function AssistantAvatar() {
  return (
    <div
      className="shrink-0 h-8 w-8 rounded-xl bg-gradient-to-br from-amber-500 via-amber-400 to-amber-500/70 flex items-center justify-center shadow-[0_4px_14px_-4px_hsl(40_92%_50%/0.45)] ring-1 ring-amber-400/30"
      aria-hidden
    >
      <span className="font-mono text-[13px] font-bold text-white tracking-tight leading-none">S</span>
    </div>
  );
}

function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          h1: ({ children }) => <h1 className="mb-1 text-base font-bold">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-1 text-sm font-bold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1 text-sm font-semibold">{children}</h3>,
          code: ({ children, className }) =>
            className ? (
              <pre className="my-2 overflow-x-auto rounded-lg border border-border/50 bg-muted/50 p-3 font-mono text-xs">
                <code>{children}</code>
              </pre>
            ) : (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8em]">{children}</code>
            ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-80">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-lg border border-border/50">
              <table className="w-full text-[13px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-border/50">{children}</tbody>,
          tr: ({ children }) => <tr className="divide-x divide-border/50">{children}</tr>,
          th: ({ children }) => (
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</th>
          ),
          td: ({ children }) => <td className="px-3 py-2 text-foreground/90">{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  list_sifts: "Listed sifts",
  get_sift: "Got sift info",
  list_records: "Listed records",
  query_sift: "Queried sift",
  aggregate_sift: "Ran aggregation",
  find_records: "Filtered records",
};

function TraceItem({ trace, index }: { trace: ToolCallTrace; index: number }) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[trace.tool] ?? trace.tool;
  const siftSuffix = trace.args["sift_id"] ? String(trace.args["sift_id"]).slice(-6) : null;
  const hasDetail = Object.keys(trace.args).length > 0 || trace.result !== undefined;
  return (
    <li className="rounded-lg border border-border/50 bg-muted/30 text-xs overflow-hidden">
      <button
        onClick={() => hasDetail && setOpen((o) => !o)}
        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left ${hasDetail ? "hover:bg-muted/50 transition-colors" : ""}`}
      >
        <span className="font-mono text-[10px] font-semibold text-muted-foreground/60 tabular-nums w-5 shrink-0">
          {String(index + 1).padStart(2, "0")}
        </span>
        {hasDetail
          ? open ? <ChevronDown className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                 : <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          : <Wrench className="h-3 w-3 text-amber-500/80 shrink-0" strokeWidth={2.25} />}
        <span className="font-medium text-foreground/90 truncate">{label}</span>
        {siftSuffix && (
          <span className="font-mono text-[10px] text-muted-foreground/50 shrink-0">· {siftSuffix}</span>
        )}
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums">{trace.duration_ms}ms</span>
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        </span>
      </button>
      {open && (
        <div className="border-t border-border/40 divide-y divide-border/40">
          {Object.keys(trace.args).length > 0 && (
            <div className="px-3 py-2 space-y-1">
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">Request</span>
              <pre className="text-[11px] text-foreground/80 overflow-x-auto font-mono leading-relaxed">
                {JSON.stringify(trace.args, null, 2)}
              </pre>
            </div>
          )}
          {trace.result !== undefined && (
            <div className="px-3 py-2 space-y-1">
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">Response</span>
              <pre className="text-[11px] text-foreground/80 overflow-x-auto font-mono leading-relaxed max-h-64 overflow-y-auto">
                {JSON.stringify(trace.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function MessageBubble({ msg }: { msg: SessionMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
          <Markdown className="prose-invert">{msg.content}</Markdown>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <AssistantAvatar />
      <div className="flex-1 min-w-0 space-y-3 pt-0.5">
        {msg.trace && msg.trace.length > 0 && (
          <ol className="flex flex-col gap-1.5 mb-2">
            {msg.trace.map((t, i) => <TraceItem key={i} trace={t} index={i} />)}
          </ol>
        )}
        {msg.content && (
          <div className="text-[14px] text-foreground/95">
            <Markdown>{msg.content}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-3">
      <AssistantAvatar />
      <div className="flex items-center gap-1 pt-3">
        <span className="w-1.5 h-1.5 bg-amber-500/70 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 bg-amber-500/70 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1.5 h-1.5 bg-amber-500/70 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}

const AutoTextarea = forwardRef<HTMLTextAreaElement, {
  value: string; onChange: (v: string) => void; onEnter: () => void;
  placeholder?: string; autoFocus?: boolean; disabled?: boolean;
}>(function AutoTextarea({ value, onChange, onEnter, placeholder, autoFocus, disabled }, ref) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const setRefs = (el: HTMLTextAreaElement | null) => {
    (innerRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
  };
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);
  return (
    <textarea
      ref={setRefs}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEnter(); } }}
      placeholder={placeholder}
      rows={1}
      autoFocus={autoFocus}
      disabled={disabled}
      className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none max-h-[200px] disabled:opacity-60"
    />
  );
});

function SiftScopeItem({ sift }: { sift: Sift }) {
  return (
    <Link
      to={`/sifts/${sift.id}`}
      className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-muted-foreground hover:bg-muted/60 hover:text-foreground"
    >
      <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 group-hover:text-primary transition-colors" strokeWidth={1.75} />
      <span className="truncate flex-1 text-[12px]">{sift.name}</span>
    </Link>
  );
}

// ── Session list ──────────────────────────────────────────────

function SessionList({
  sessionsLoading, sessions, groupedSessions, activeSessionId, onSelect, onDelete,
}: {
  sessionsLoading: boolean;
  sessions: ChatSession[];
  groupedSessions: Record<Bucket, ChatSession[]>;
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto p-2">
      {sessionsLoading && (
        <div className="space-y-1.5 px-1 pt-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
        </div>
      )}
      {!sessionsLoading && sessions.length === 0 && (
        <div className="px-3 py-12 text-center space-y-2.5">
          <MessageSquare className="h-5 w-5 mx-auto text-muted-foreground/40" strokeWidth={1.5} />
          <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground/60">No chats yet</p>
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
            Start a new conversation to<br />see it land here.
          </p>
        </div>
      )}
      {!sessionsLoading && sessions.length > 0 && (
        <div className="space-y-3 pt-1">
          {BUCKET_ORDER.map((bucket) => {
            const items = groupedSessions[bucket];
            if (!items.length) return null;
            return (
              <div key={bucket}>
                <p className="px-2 pb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                  {BUCKET_LABEL[bucket]}
                </p>
                <div className="space-y-0.5">
                  {items.map((s) => {
                    const isActive = activeSessionId === s.id;
                    return (
                      <div
                        key={s.id}
                        className={`group relative flex items-center gap-2 rounded-md pl-3 pr-1.5 py-1.5 cursor-pointer text-sm transition-colors ${
                          isActive ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        }`}
                        onClick={() => onSelect(s.id)}
                      >
                        {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" />}
                        <span className={`truncate flex-1 text-[12px] ${isActive ? "font-medium" : ""}`}>
                          {s.title || "New chat"}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-1 rounded"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </nav>
  );
}

// ── Page ──────────────────────────────────────────────────────

export function ChatPage() {
  const qc = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [input, setInput] = useState("");
  const [welcomeInput, setWelcomeInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: fetchChatSessions,
  });

  const { data: siftsPage } = useSifts();
  const sifts = siftsPage?.items ?? [];
  const siftCount = sifts.length;

  const sessions = sessionsData?.items ?? [];
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const groupedSessions = useMemo(() => groupSessions(sessions), [sessions]);

  const touchedIds = useMemo(() => collectTouchedSiftIds(messages), [messages]);
  const hasTouched = touchedIds.size > 0;
  const touchedSifts = useMemo(
    () => sifts.filter((s) => touchedIds.has(s.id)),
    [sifts, touchedIds],
  );

  const loadSession = async (id: string) => {
    setActiveSessionId(id);
    setShowSessions(false);
    const { messages: msgs } = await fetchChatSession(id);
    setMessages(msgs);
    setInput("");
  };

  const createMutation = useMutation({
    mutationFn: createChatSession,
    onSuccess: (session) => {
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
      setActiveSessionId(session.id);
      setMessages([]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteChatSession,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
      if (activeSessionId === id) { setActiveSessionId(null); setMessages([]); }
      setDeleteSessionId(null);
    },
  });

  const sendMutation = useMutation({
    mutationFn: ({ sessionId, content }: { sessionId: string; content: string }) =>
      sendSessionMessage(sessionId, content),
    onMutate: ({ content }) => {
      const isFirst = messages.length === 0;
      const userMsg: SessionMessage = {
        id: `tmp_${Date.now()}`, session_id: activeSessionId!, role: "user",
        content, trace: [], created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);
      return { isFirst };
    },
    onSuccess: (msg, _vars, context) => {
      setMessages((prev) => [...prev, msg]);
      setIsTyping(false);
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
      inputRef.current?.focus();
      // Refetch after delay to pick up LLM-generated title from background task
      if (context?.isFirst) {
        setTimeout(() => qc.invalidateQueries({ queryKey: ["chat-sessions"] }), 3000);
      }
    },
    onError: () => { setIsTyping(false); inputRef.current?.focus(); },
  });

  const handleSend = () => {
    const content = input.trim();
    if (!activeSessionId || !content || sendMutation.isPending) return;
    setInput("");
    sendMutation.mutate({ sessionId: activeSessionId, content });
  };

  const handleWelcomeSend = async (prompt?: string) => {
    const content = (prompt ?? welcomeInput).trim();
    if (!content || createMutation.isPending || sendMutation.isPending) return;
    setWelcomeInput("");
    const session = await createMutation.mutateAsync();
    sendMutation.mutate({ sessionId: session.id, content });
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top rail */}
      <header className="flex h-14 shrink-0 border-b">
        {/* Desktop: new chat button */}
        <div className="hidden md:flex w-56 shrink-0 items-center px-3 border-r bg-muted/20">
          <button
            onClick={() => { setActiveSessionId(null); setMessages([]); setInput(""); }}
            className="group relative w-full h-9 rounded-lg overflow-hidden bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1.5 shadow-sm hover:shadow-md transition-all hover:-translate-y-px active:translate-y-0 active:shadow-sm"
          >
            <span className="absolute inset-0 bg-gradient-to-t from-black/10 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Plus className="h-3.5 w-3.5 relative transition-transform group-hover:rotate-90" />
            <span className="relative">New chat</span>
          </button>
        </div>

        {/* Mobile: sessions toggle */}
        <button
          className="md:hidden h-14 w-14 shrink-0 flex items-center justify-center border-r text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          onClick={() => setShowSessions(true)}
          aria-label="Open sessions"
        >
          <MessageSquare className="h-4.5 w-4.5" />
        </button>

        <div className="flex-1 flex items-center gap-3 px-4 sm:px-5 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/60 shrink-0">Chat</span>
            <span className="h-px w-5 bg-border shrink-0" aria-hidden />
            <span className="text-sm font-semibold tracking-tight text-foreground truncate">
              {activeSession?.title || (activeSessionId ? "New chat" : "Ask your documents")}
            </span>
          </div>

          {siftCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/5 px-2.5 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
              </span>
              <Sparkles className="h-3 w-3" />
              <span>Agent · {siftCount} sift{siftCount !== 1 ? "s" : ""}</span>
            </div>
          )}

          {activeSessionId && (
            <button
              onClick={() => setDeleteSessionId(activeSessionId)}
              className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors shrink-0"
              title="Delete chat"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Session list — left sidebar (desktop) */}
        <aside className="hidden md:flex w-56 shrink-0 border-r flex-col bg-muted/20">
          <SessionList
            sessionsLoading={sessionsLoading}
            sessions={sessions}
            groupedSessions={groupedSessions}
            activeSessionId={activeSessionId}
            onSelect={loadSession}
            onDelete={(id) => setDeleteSessionId(id)}
          />
        </aside>

        {/* Session list — mobile overlay */}
        {showSessions && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div className="w-72 bg-background border-r flex flex-col shadow-xl">
              <div className="flex items-center justify-between px-3 py-3 border-b shrink-0">
                <span className="font-semibold text-sm">Chats</span>
                <button
                  onClick={() => setShowSessions(false)}
                  className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-3 py-2 border-b shrink-0">
                <button
                  onClick={() => { setActiveSessionId(null); setMessages([]); setInput(""); setShowSessions(false); }}
                  className="group relative w-full h-9 rounded-lg overflow-hidden bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5 transition-transform group-hover:rotate-90" />
                  <span>New chat</span>
                </button>
              </div>
              <SessionList
                sessionsLoading={sessionsLoading}
                sessions={sessions}
                groupedSessions={groupedSessions}
                activeSessionId={activeSessionId}
                onSelect={loadSession}
                onDelete={(id) => { setShowSessions(false); setDeleteSessionId(id); }}
              />
            </div>
            <div className="flex-1 bg-black/30" onClick={() => setShowSessions(false)} />
          </div>
        )}

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          {!activeSessionId ? (
            /* Welcome state */
            <div className="flex-1 overflow-y-auto relative">
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-[320px]"
                style={{ background: "radial-gradient(900px 280px at 30% -10%, hsl(40 92% 58% / 0.09), transparent 60%), radial-gradient(600px 240px at 80% -15%, hsl(263 72% 52% / 0.06), transparent 55%)" }}
                aria-hidden
              />
              <div className="relative max-w-2xl mx-auto px-6 pt-16 pb-10 flex flex-col items-center text-center">
                <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground/70 mb-6">
                  <Sparkles className="h-3 w-3 text-amber-500/80" strokeWidth={2.25} />
                  <span>Structured RAG</span>
                  <span className="h-px w-6 bg-border" aria-hidden />
                  <span>Conversational</span>
                </div>
                <h1 className="text-[36px] leading-[1.05] font-bold tracking-[-0.03em] text-foreground">
                  What do you want to{" "}
                  <span className="relative inline-block">
                    <span className="relative z-10">know</span>
                    <span className="absolute inset-x-[-4px] bottom-[0.08em] h-[0.28em] bg-amber-300/50 -z-0" aria-hidden />
                  </span>
                  ?
                </h1>
                <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground/90 max-w-lg">
                  {siftCount > 0 ? (
                    <>Ask anything about your <span className="font-semibold text-foreground/80">{siftCount} sift{siftCount !== 1 ? "s" : ""}</span>. The agent searches, aggregates, and cites — all in plain English.</>
                  ) : (
                    <>Upload documents first, then ask the agent to search, summarise, or visualise them.</>
                  )}
                </p>
                <div className="mt-10 w-full">
                  <div className="flex items-end gap-2 rounded-2xl border border-border/80 bg-card p-2 shadow-[0_8px_30px_-12px_hsl(var(--foreground)/0.12)] focus-within:border-amber-400/40 focus-within:shadow-[0_12px_40px_-12px_hsl(40_92%_50%/0.22)] transition-all">
                    <AutoTextarea
                      value={welcomeInput}
                      onChange={setWelcomeInput}
                      onEnter={() => handleWelcomeSend()}
                      placeholder={siftCount > 0 ? "Ask anything about your documents…" : "Ask anything…"}
                      autoFocus
                    />
                    <Button
                      size="icon"
                      className="h-8 w-8 shrink-0 bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-600 text-white shadow-sm"
                      onClick={() => handleWelcomeSend()}
                      disabled={!welcomeInput.trim() || createMutation.isPending || sendMutation.isPending}
                    >
                      <CornerDownLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </Button>
                  </div>
                  <p className="mt-1.5 flex items-center justify-center gap-2 font-mono text-[10px] tracking-[0.08em] text-muted-foreground/60">
                    <kbd className="px-1.5 py-0.5 rounded border border-border/70 bg-muted/50 text-[9px] font-semibold">Enter</kbd>
                    <span>to send</span>
                    <span className="text-muted-foreground/30">·</span>
                    <kbd className="px-1.5 py-0.5 rounded border border-border/70 bg-muted/50 text-[9px] font-semibold">Shift</kbd>
                    <span>+</span>
                    <kbd className="px-1.5 py-0.5 rounded border border-border/70 bg-muted/50 text-[9px] font-semibold">Enter</kbd>
                    <span>for newline</span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Active session */
            <>
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-5 py-8 space-y-7">
                  {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
                  {isTyping && <TypingDots />}
                  <div ref={bottomRef} />
                </div>
              </div>
              <div className="border-t bg-gradient-to-t from-background via-background to-background/80 backdrop-blur px-5 py-3 shrink-0">
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-end gap-2 rounded-2xl border border-border/80 bg-card p-2 shadow-sm focus-within:border-amber-400/40 focus-within:shadow-[0_6px_22px_-10px_hsl(40_92%_50%/0.2)] transition-all">
                    <AutoTextarea
                      ref={inputRef}
                      value={input}
                      onChange={setInput}
                      onEnter={handleSend}
                      placeholder="Ask a follow-up…"
                    />
                    <Button
                      size="icon"
                      className="h-8 w-8 shrink-0 bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-600 text-white"
                      onClick={handleSend}
                      disabled={!input.trim() || sendMutation.isPending}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Scope panel — right side (desktop only) */}
        <aside className="hidden lg:flex w-56 shrink-0 border-l border-border/70 flex-col bg-card/60">
          <div className="flex items-center gap-2 px-3 py-3 border-b border-border/60 shrink-0">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Scope</span>
            <span className="h-px flex-1 bg-border/50" aria-hidden />
            {hasTouched && (
              <span className="font-mono text-[10px] tabular-nums text-amber-600/80 dark:text-amber-400/80">
                {touchedIds.size}
              </span>
            )}
          </div>
          <nav className="flex-1 overflow-y-auto p-2">
            {!hasTouched ? (
              <div className="flex flex-col items-center justify-center h-full py-10 gap-2.5 text-center px-3">
                <Database className="h-5 w-5 text-muted-foreground/30" strokeWidth={1.5} />
                <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
                  Ask a question to see which sifts the agent uses
                </p>
              </div>
            ) : (
              <div className="space-y-0.5 pt-1">
                {touchedSifts.map((s) => <SiftScopeItem key={s.id} sift={s} />)}
              </div>
            )}
          </nav>
          <div className="border-t border-border/60 px-3 py-2.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/50">
            <CornerDownLeft className="h-3 w-3" strokeWidth={2} />
            <span>Press enter to ask</span>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={!!deleteSessionId}
        onOpenChange={(open) => { if (!open) setDeleteSessionId(null); }}
        title="Delete chat?"
        description="This chat and its messages will be permanently removed."
        confirmLabel="Delete chat"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteSessionId && deleteMutation.mutate(deleteSessionId)}
      />
    </div>
  );
}
