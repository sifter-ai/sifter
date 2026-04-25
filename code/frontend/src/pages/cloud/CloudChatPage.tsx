import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Send,
  Sparkles,
  MessageSquare,
  FileText,
  BarChart3,
  Search,
  ChevronRight,
  CheckCircle2,
  Wrench,
  CornerDownLeft,
} from "lucide-react";
import {
  fetchChatSessions,
  createChatSession,
  fetchChatSession,
  deleteChatSession,
  sendCloudChatMessage,
  fetchChatSuggestions,
  type ChatSession,
  type ChatMessageCloud,
} from "@/api/cloud";
import { fetchSifts } from "@/api/extractions";
import { BlockRenderer } from "@/components/cloud/BlockRenderer";
import { ShareBtn } from "@/components/cloud/ShareBtn";
import { ShareDialog } from "@/components/cloud/ShareDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// ---------- Starter prompts (editorial tiles on the welcome state) ----------

const STARTER_PROMPTS: { icon: typeof FileText; text: string }[] = [
  { icon: Search, text: "What are the main topics across my documents?" },
  { icon: BarChart3, text: "Show me a breakdown of records by category" },
  { icon: FileText, text: "Summarize the most recent sift I created" },
  { icon: Sparkles, text: "Suggest a dashboard I could build from my data" },
];

// ---------- Session grouping helpers ----------

type SessionBucket = "today" | "yesterday" | "week" | "older";
const BUCKET_LABEL: Record<SessionBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This week",
  older: "Older",
};
const BUCKET_ORDER: SessionBucket[] = ["today", "yesterday", "week", "older"];

function bucketFor(iso: string | null | undefined): SessionBucket {
  if (!iso) return "older";
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((today.getTime() - d.getTime()) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return "week";
  return "older";
}

function groupSessions(sessions: ChatSession[]): Record<SessionBucket, ChatSession[]> {
  const groups: Record<SessionBucket, ChatSession[]> = {
    today: [], yesterday: [], week: [], older: [],
  };
  for (const s of sessions) {
    const when = (s as unknown as { updated_at?: string }).updated_at ?? s.created_at ?? null;
    groups[bucketFor(when)].push(s);
  }
  return groups;
}

// ---------- UI atoms ----------

function SuggestionChips({
  siftIds,
  onSelect,
}: {
  siftIds: string[];
  onSelect: (s: string) => void;
}) {
  const { data } = useQuery({
    queryKey: ["chat-suggestions", siftIds],
    queryFn: () => fetchChatSuggestions(siftIds),
    enabled: siftIds.length > 0,
  });
  if (!data?.suggestions?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 pb-2">
      {data.suggestions.map((s) => (
        <button
          key={s}
          onClick={() => onSelect(s)}
          className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-xs text-primary hover:bg-primary/10 transition-colors"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function AssistantAvatar() {
  return (
    <div
      className="shrink-0 h-8 w-8 rounded-xl bg-gradient-to-br from-amber-500 via-amber-400 to-amber-500/70 flex items-center justify-center shadow-[0_4px_14px_-4px_hsl(40_92%_50%/0.5)] ring-1 ring-amber-400/30"
      aria-hidden
    >
      <span className="font-mono text-[13px] font-bold text-white tracking-tight leading-none">S</span>
    </div>
  );
}

function AgentSteps({ steps }: { steps: NonNullable<ChatMessageCloud["steps"]> }) {
  if (!steps.length) return null;
  return (
    <ol className="flex flex-col gap-1.5 mb-3">
      {steps.map((step, i) => (
        <li
          key={i}
          className="group flex items-center gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1.5 text-xs"
        >
          <span className="font-mono text-[10px] font-semibold text-muted-foreground/60 tabular-nums w-5">
            {String(i + 1).padStart(2, "0")}
          </span>
          <Wrench className="h-3 w-3 text-amber-500/80 shrink-0" strokeWidth={2.25} />
          <span className="font-medium text-foreground/90 truncate">{step.label}</span>
          <span className="ml-auto flex items-center gap-1 text-muted-foreground shrink-0">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            <span className="font-mono tabular-nums">{step.result_count}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function MessageBubble({ msg, onShare }: { msg: ChatMessageCloud; onShare?: () => void }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="group flex gap-3">
      <AssistantAvatar />
      <div className="flex-1 min-w-0 space-y-3 pt-0.5">
        {msg.steps && msg.steps.length > 0 && <AgentSteps steps={msg.steps} />}
        {msg.content && (
          <p className="text-[14px] leading-[1.65] whitespace-pre-wrap text-foreground/95">
            {msg.content}
          </p>
        )}
        {msg.blocks?.map((block, i) => (
          <div key={i} className="rounded-xl border border-border/60 bg-card/50 p-3.5">
            {block.title && (
              <p className="text-[10px] font-semibold tracking-[0.14em] uppercase text-muted-foreground/70 mb-2.5">
                {block.title}
              </p>
            )}
            <BlockRenderer block={block} />
          </div>
        ))}
        {onShare && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <ShareBtn onClick={onShare} size="sm" />
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

function AutoTextarea({
  value,
  onChange,
  onEnter,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEnter(); }
      }}
      placeholder={placeholder}
      rows={1}
      autoFocus={autoFocus}
      className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none max-h-[200px]"
    />
  );
}

function KeyboardHint() {
  return (
    <p className="mt-1.5 flex items-center justify-center gap-2 font-mono text-[10px] tracking-[0.08em] text-muted-foreground/60">
      <kbd className="px-1.5 py-0.5 rounded border border-border/70 bg-muted/50 text-[9px] font-semibold">
        Enter
      </kbd>
      <span>to send</span>
      <span className="text-muted-foreground/30">·</span>
      <kbd className="px-1.5 py-0.5 rounded border border-border/70 bg-muted/50 text-[9px] font-semibold">
        Shift
      </kbd>
      <span>+</span>
      <kbd className="px-1.5 py-0.5 rounded border border-border/70 bg-muted/50 text-[9px] font-semibold">
        Enter
      </kbd>
      <span>for newline</span>
    </p>
  );
}

// ---------- Page ----------

export default function CloudChatPage({ siftId }: { siftId?: string }) {
  const qc = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [welcomeInput, setWelcomeInput] = useState("");
  const [messages, setMessages] = useState<ChatMessageCloud[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedSiftIds] = useState<string[]>(siftId ? [siftId] : []);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<{ id: string; content: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ["cloud-chat-sessions"],
    queryFn: fetchChatSessions,
  });

  const { data: siftsData } = useQuery({
    queryKey: ["sifts", 200],
    queryFn: () => fetchSifts(200, 0),
  });

  const sessions = sessionsData?.items ?? [];
  const sifts = siftsData?.items ?? [];
  const activeSession = sessions.find((s: ChatSession) => s.id === activeSessionId);

  const groupedSessions = useMemo(() => groupSessions(sessions), [sessions]);

  const loadSession = async (id: string) => {
    setActiveSessionId(id);
    const { messages: msgs } = await fetchChatSession(id);
    setMessages(msgs);
  };

  const createMutation = useMutation({
    mutationFn: () => createChatSession({ sift_ids: sifts.map((s: any) => s.id) }),
    onSuccess: async (session) => {
      qc.invalidateQueries({ queryKey: ["cloud-chat-sessions"] });
      setMessages([]);
      setActiveSessionId(session.id);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteChatSession,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["cloud-chat-sessions"] });
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([]);
      }
      setDeleteSessionId(null);
    },
  });

  const sendMutation = useMutation({
    mutationFn: (args: { sessionId: string; content: string }) =>
      sendCloudChatMessage(args.sessionId, args.content),
    onMutate: ({ content }) => {
      const userMsg: ChatMessageCloud = {
        id: `tmp_${Date.now()}`,
        role: "user",
        content,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);
    },
    onSuccess: (msg) => {
      setMessages((prev) => [...prev, msg]);
      setIsTyping(false);
      qc.invalidateQueries({ queryKey: ["cloud-chat-sessions"] });
    },
    onError: () => setIsTyping(false),
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

  const siftCount = sifts.length;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Unified top rail — single h-14 row spans sidebar + chat, so borders & heights always align */}
      <header className="flex h-14 shrink-0 border-b">
        {/* Left slot: matches sidebar width + bg so the sidebar column reads as one continuous strip top-to-bottom */}
        <div className="w-60 shrink-0 flex items-center px-3 border-r bg-muted/20">
          <button
            onClick={() => {
              setActiveSessionId(null);
              setMessages([]);
            }}
            className="group relative w-full h-9 rounded-lg overflow-hidden bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1.5 shadow-sm hover:shadow-md transition-all hover:-translate-y-px active:translate-y-0 active:shadow-sm"
          >
            <span className="absolute inset-0 bg-gradient-to-t from-black/10 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Plus className="h-3.5 w-3.5 relative transition-transform group-hover:rotate-90" />
            <span className="relative">New chat</span>
          </button>
        </div>

        {/* Right slot: breadcrumb title + agent badge + actions */}
        <div className="flex-1 flex items-center gap-3 px-5 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/60 shrink-0">
              Chat
            </span>
            <span className="h-px w-5 bg-border shrink-0" aria-hidden />
            <span className="text-sm font-semibold tracking-tight text-foreground truncate">
              {activeSession?.title || (activeSessionId ? "New chat" : "New conversation")}
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

      {/* Body: sidebar + chat area share the remaining height */}
      <div className="flex flex-1 min-h-0">
        {/* Session list sidebar */}
        <aside className="w-60 shrink-0 border-r flex flex-col bg-muted/20">
          <nav className="flex-1 overflow-y-auto p-2">
            {sessionsLoading && (
              <div className="space-y-1.5 px-1 pt-2">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
              </div>
            )}

            {!sessionsLoading && sessions.length === 0 && (
              <div className="px-3 py-12 text-center space-y-2.5">
                <MessageSquare className="h-5 w-5 mx-auto text-muted-foreground/40" strokeWidth={1.5} />
                <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-muted-foreground/60">
                  No chats yet
                </p>
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
                        {items.map((s: ChatSession) => {
                          const isActive = activeSessionId === s.id;
                          return (
                            <div
                              key={s.id}
                              className={`group relative flex items-center gap-2 rounded-md pl-3 pr-1.5 py-1.5 cursor-pointer text-sm transition-colors ${
                                isActive
                                  ? "bg-primary/10 text-foreground"
                                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                              }`}
                              onClick={() => loadSession(s.id)}
                            >
                              {isActive && (
                                <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" />
                              )}
                              <span className={`truncate flex-1 ${isActive ? "font-medium" : ""}`}>
                                {s.title || "New chat"}
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteSessionId(s.id); }}
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
        </aside>

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          {!activeSessionId ? (
            /* ---------- Welcome / empty state ---------- */
            <div className="flex-1 overflow-y-auto relative">
              {/* Atmospheric backdrop — warm amber accent that matches the agent identity */}
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-[360px]"
                style={{
                  background:
                    "radial-gradient(900px 320px at 30% -10%, hsl(40 92% 58% / 0.10), transparent 60%), radial-gradient(700px 260px at 80% -15%, hsl(263 72% 52% / 0.07), transparent 55%)",
                }}
                aria-hidden
              />

              <div className="relative max-w-2xl mx-auto px-6 pt-20 pb-10 flex flex-col items-center text-center">
                {/* Editorial breadcrumb */}
                <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground/70 mb-6">
                  <Sparkles className="h-3 w-3 text-amber-500/80" strokeWidth={2.25} />
                  <span>Structured RAG</span>
                  <span className="h-px w-6 bg-border" aria-hidden />
                  <span>Conversational</span>
                </div>

                {/* Typographic headline */}
                <h1 className="text-[40px] leading-[1.02] font-bold tracking-[-0.03em] text-foreground">
                  What do you want to{" "}
                  <span className="relative inline-block">
                    <span className="relative z-10">know</span>
                    <span
                      className="absolute inset-x-[-4px] bottom-[0.08em] h-[0.28em] bg-amber-300/50 -z-0"
                      aria-hidden
                    />
                  </span>
                  ?
                </h1>

                <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground/90 max-w-lg">
                  {siftCount > 0 ? (
                    <>
                      Ask anything about your{" "}
                      <span className="font-semibold text-foreground/80">
                        {siftCount} sift{siftCount !== 1 ? "s" : ""}
                      </span>
                      . The agent searches, aggregates, and charts —{" "}
                      <span className="text-foreground/80">citations included.</span>
                    </>
                  ) : (
                    <>
                      Upload documents first, then ask the agent to search, summarize,
                      or visualise them. <span className="text-foreground/80">Plain English in, structured answers out.</span>
                    </>
                  )}
                </p>

                {/* Welcome input */}
                <div className="mt-10 w-full">
                  <div className="flex items-end gap-2 rounded-2xl border border-border/80 bg-card p-2 shadow-[0_8px_30px_-12px_hsl(var(--foreground)/0.12)] focus-within:border-amber-400/40 focus-within:shadow-[0_12px_40px_-12px_hsl(40_92%_50%/0.25)] transition-all">
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
                  <KeyboardHint />
                </div>

                {/* Starter prompts — editorial tiles with numeric index */}
                {siftCount > 0 && (
                  <div className="mt-10 w-full">
                    <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground/60 mb-3">
                      <span>Try one of these</span>
                      <span className="h-px flex-1 bg-border/70" aria-hidden />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {STARTER_PROMPTS.map(({ icon: Icon, text }, i) => (
                        <button
                          key={text}
                          onClick={() => handleWelcomeSend(text)}
                          disabled={createMutation.isPending || sendMutation.isPending}
                          className="group relative flex items-start gap-3 rounded-xl border border-border/60 bg-card/70 px-3.5 py-3 text-left text-sm hover:border-amber-400/40 hover:bg-amber-50/40 dark:hover:bg-amber-400/5 transition-all disabled:opacity-50 hover:-translate-y-[1px] hover:shadow-[0_6px_20px_-8px_hsl(40_92%_50%/0.3)]"
                        >
                          <span className="font-mono text-[10px] font-semibold tabular-nums text-amber-600/80 dark:text-amber-400/80 tracking-wider pt-0.5">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <Icon className="h-4 w-4 text-muted-foreground/60 group-hover:text-amber-600 dark:group-hover:text-amber-400 shrink-0 mt-0.5 transition-colors" strokeWidth={1.75} />
                          <span className="text-muted-foreground/90 group-hover:text-foreground transition-colors leading-snug flex-1">
                            {text}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ---------- Active session view ---------- */
            <>
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-5 py-8 space-y-7">
                  {messages.length === 0 && (
                    <SuggestionChips
                      siftIds={selectedSiftIds}
                      onSelect={(s) => setInput(s)}
                    />
                  )}
                  {messages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      msg={msg}
                      onShare={msg.role === "assistant" && msg.id && !msg.id.startsWith("tmp_")
                        ? () => setShareMsg({ id: msg.id, content: msg.content ?? "" })
                        : undefined}
                    />
                  ))}
                  {isTyping && <TypingDots />}
                  <div ref={bottomRef} />
                </div>
              </div>
              <div className="border-t bg-gradient-to-t from-background via-background to-background/80 backdrop-blur px-5 py-3 shrink-0">
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-end gap-2 rounded-2xl border border-border/80 bg-card p-2 shadow-sm focus-within:border-amber-400/40 focus-within:shadow-[0_6px_22px_-10px_hsl(40_92%_50%/0.2)] transition-all">
                    <AutoTextarea
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

      <ShareDialog
        open={!!shareMsg}
        onOpenChange={(v) => { if (!v) setShareMsg(null); }}
        title={shareMsg?.content?.slice(0, 60) ?? "Chat result"}
        kind="chat_message"
        sourceId={shareMsg?.id ?? ""}
      />
    </div>
  );
}
