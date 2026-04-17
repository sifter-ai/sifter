import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Send, Sparkles, MessageSquare, FileText, BarChart3, Search, ChevronRight, Database, CheckCircle2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const STARTER_PROMPTS: { icon: typeof FileText; text: string }[] = [
  { icon: Search, text: "What are the main topics across my documents?" },
  { icon: BarChart3, text: "Show me a breakdown of records by category" },
  { icon: FileText, text: "Summarize the most recent sift I created" },
  { icon: Sparkles, text: "Suggest a dashboard I could build from my data" },
];

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
    <div className="shrink-0 h-7 w-7 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-sm">
      <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
    </div>
  );
}

function AgentSteps({ steps }: { steps: NonNullable<ChatMessageCloud["steps"]> }) {
  if (!steps.length) return null;
  return (
    <div className="flex flex-col gap-1.5 mb-3 pb-3 border-b border-border/50">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
          <Database className="h-3 w-3 shrink-0 text-primary/60" />
          <span className="font-medium">{step.label}</span>
          <span className="text-muted-foreground/50">·</span>
          <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
          <span>{step.result_count} risultati</span>
        </div>
      ))}
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessageCloud }) {
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
    <div className="flex gap-3">
      <AssistantAvatar />
      <div className="flex-1 min-w-0 space-y-3 pt-0.5">
        {msg.steps && msg.steps.length > 0 && <AgentSteps steps={msg.steps} />}
        {msg.content && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        )}
        {msg.blocks?.map((block, i) => (
          <div key={i} className="rounded-lg border bg-card p-3">
            {block.title && (
              <p className="text-xs font-medium text-muted-foreground mb-2">{block.title}</p>
            )}
            <BlockRenderer block={block} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-3">
      <AssistantAvatar />
      <div className="flex items-center gap-1 pt-2.5">
        <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
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

export default function CloudChatPage({ siftId }: { siftId?: string }) {
  const qc = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [welcomeInput, setWelcomeInput] = useState("");
  const [messages, setMessages] = useState<ChatMessageCloud[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedSiftIds] = useState<string[]>(siftId ? [siftId] : []);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ["cloud-chat-sessions"],
    queryFn: fetchChatSessions,
  });

  const { data: siftsData } = useQuery({
    queryKey: ["sifts"],
    queryFn: fetchSifts,
  });

  const sessions = sessionsData?.items ?? [];
  const sifts = siftsData ?? [];
  const activeSession = sessions.find((s: ChatSession) => s.id === activeSessionId);

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
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/60 shrink-0">
              Chat
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
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
            {sessions.length > 0 && (
              <p className="px-2 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
                Recent
              </p>
            )}
            <div className="space-y-0.5">
              {sessionsLoading && <Skeleton className="h-8 w-full" />}
              {!sessionsLoading && sessions.length === 0 && (
                <div className="px-3 py-8 text-center space-y-2">
                  <MessageSquare className="h-5 w-5 mx-auto text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground/70 leading-relaxed">
                    Your chats will<br />appear here
                  </p>
                </div>
              )}
              {sessions.map((s: ChatSession) => {
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
          </nav>
        </aside>

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-h-0">
        {!activeSessionId ? (
          /* Welcome / empty state */
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-6 pt-16 pb-10 flex flex-col items-center text-center">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg mb-5">
                <Sparkles className="h-7 w-7 text-primary-foreground" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">
                How can I help you today?
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {siftCount > 0
                  ? `Ask anything about your ${siftCount} sift${siftCount !== 1 ? "s" : ""}. I can search, aggregate, and chart your data.`
                  : "Upload documents first, then ask the agent to search, summarize, or visualize them."}
              </p>

              {/* Welcome input */}
              <div className="mt-8 w-full">
                <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/30 transition-shadow">
                  <AutoTextarea
                    value={welcomeInput}
                    onChange={setWelcomeInput}
                    onEnter={() => handleWelcomeSend()}
                    placeholder={siftCount > 0 ? "Ask anything about your documents…" : "Ask anything…"}
                    autoFocus
                  />
                  <Button
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => handleWelcomeSend()}
                    disabled={!welcomeInput.trim() || createMutation.isPending || sendMutation.isPending}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground/70">
                  Press Enter to send · Shift+Enter for newline
                </p>
              </div>

              {/* Starter prompts */}
              {siftCount > 0 && (
                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                  {STARTER_PROMPTS.map(({ icon: Icon, text }) => (
                    <button
                      key={text}
                      onClick={() => handleWelcomeSend(text)}
                      disabled={createMutation.isPending || sendMutation.isPending}
                      className="group flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left text-sm hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-50"
                    >
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                        {text}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-5 py-6 space-y-6">
                {messages.length === 0 && (
                  <SuggestionChips
                    siftIds={selectedSiftIds}
                    onSelect={(s) => setInput(s)}
                  />
                )}
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
                {isTyping && <TypingDots />}
                <div ref={bottomRef} />
              </div>
            </div>
            <div className="border-t bg-background/80 backdrop-blur px-5 py-3 shrink-0">
              <div className="max-w-3xl mx-auto">
                <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/30 transition-shadow">
                  <AutoTextarea
                    value={input}
                    onChange={setInput}
                    onEnter={handleSend}
                    placeholder="Ask a follow-up…"
                  />
                  <Button
                    size="icon"
                    className="h-8 w-8 shrink-0"
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
    </div>
  );
}
