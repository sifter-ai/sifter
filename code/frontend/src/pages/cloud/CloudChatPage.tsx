import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Send, Loader2 } from "lucide-react";
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

function MessageBubble({ msg }: { msg: ChatMessageCloud }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {msg.content && <p className="text-sm">{msg.content}</p>}
      {msg.blocks?.map((block, i) => (
        <div key={i} className="rounded-lg border p-3">
          {block.title && <p className="text-xs font-medium text-muted-foreground mb-2">{block.title}</p>}
          <BlockRenderer block={block} />
        </div>
      ))}
    </div>
  );
}

export default function CloudChatPage({ siftId }: { siftId?: string }) {
  const qc = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessageCloud[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedSiftIds, setSelectedSiftIds] = useState<string[]>(siftId ? [siftId] : []);
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

  const loadSession = async (id: string) => {
    setActiveSessionId(id);
    const { messages: msgs } = await fetchChatSession(id);
    setMessages(msgs);
  };

  const createMutation = useMutation({
    mutationFn: () => createChatSession({ sift_ids: selectedSiftIds }),
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
    },
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) => {
      if (!activeSessionId) throw new Error("No session");
      return sendCloudChatMessage(activeSessionId, content);
    },
    onMutate: (content) => {
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
    },
    onError: () => setIsTyping(false),
  });

  const handleSend = () => {
    const content = input.trim();
    if (!content || sendMutation.isPending) return;
    setInput("");
    sendMutation.mutate(content);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r flex flex-col">
        <div className="p-3 border-b space-y-2">
          {!siftId && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Sifts</p>
              {sifts.map((s: any) => (
                <label key={s.id} className="flex items-center gap-2 text-sm py-0.5">
                  <input
                    type="checkbox"
                    checked={selectedSiftIds.includes(s.id)}
                    onChange={(e) =>
                      setSelectedSiftIds((prev) =>
                        e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                      )
                    }
                    className="accent-primary"
                  />
                  <span className="truncate">{s.name}</span>
                </label>
              ))}
            </div>
          )}
          <Button
            size="sm"
            className="w-full gap-1"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || selectedSiftIds.length === 0}
          >
            <Plus className="h-3.5 w-3.5" />New chat
          </Button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {sessionsLoading && <Skeleton className="h-8 w-full" />}
          {sessions.map((s: ChatSession) => (
            <div
              key={s.id}
              className={`group flex items-center justify-between gap-1 rounded-md px-2 py-1.5 cursor-pointer text-sm transition-colors ${
                activeSessionId === s.id ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/60"
              }`}
              onClick={() => loadSession(s.id)}
            >
              <span className="truncate flex-1">{s.title || "Chat"}</span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(s.id); }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </nav>
      </aside>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-h-0">
        {!activeSessionId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Create a new chat to get started.
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <SuggestionChips
                  siftIds={selectedSiftIds}
                  onSelect={(s) => { setInput(s); }}
                />
              )}
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              {isTyping && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Thinking…</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div className="border-t p-3 flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                }}
                placeholder="Ask anything about your documents…"
                rows={1}
                className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Button size="sm" onClick={handleSend} disabled={!input.trim() || sendMutation.isPending}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
