import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronRight, CheckCircle2, CornerDownLeft, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChat } from "@/hooks/useChat";
import type { ChatMessage, ToolCallTrace } from "@/api/types";

export interface ChatInterfaceHandle {
  submit: (text: string) => void;
}

interface ChatInterfaceProps {
  siftId?: string;
  height?: string;
  /** Hides the keyboard hint below the input — useful inside compact tabs */
  compact?: boolean;
  /** Called whenever the message list changes — lets parents derive UI from the transcript (e.g. touched sifts). */
  onMessagesChange?: (messages: ChatMessage[]) => void;
}

// ---------- atoms ----------

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

function DataTable({ data }: { data: Record<string, unknown>[] }) {
  if (!data.length) return null;
  const cols = Object.keys(data[0]);
  return (
    <div className="overflow-x-auto rounded-lg border border-border/60 bg-background/40 text-xs">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border/60 bg-muted/40">
            {cols.map((c) => (
              <th
                key={c}
                className="px-3 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 20).map((row, i) => (
            <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
              {cols.map((c) => (
                <td key={c} className="px-3 py-1.5 text-foreground/90">
                  {row[c] === null || row[c] === undefined ? (
                    <span className="text-muted-foreground/40">—</span>
                  ) : (
                    String(row[c])
                  )}
                </td>
              ))}
            </tr>
          ))}
          {data.length > 20 && (
            <tr>
              <td
                colSpan={cols.length}
                className="px-3 py-2 text-[11px] font-mono text-muted-foreground/60 bg-muted/20"
              >
                +{data.length - 20} more rows
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PipelineToggle({ pipeline }: { pipeline: Record<string, unknown>[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        View pipeline
      </button>
      {open && (
        <pre className="mt-2 text-[11px] bg-muted/40 text-foreground/80 p-3 rounded-lg overflow-x-auto font-mono border border-border/50">
          {JSON.stringify(pipeline, null, 2)}
        </pre>
      )}
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

function TraceList({ traces }: { traces: ToolCallTrace[] }) {
  if (!traces.length) return null;
  return (
    <ol className="flex flex-col gap-1.5 mb-2">
      {traces.map((trace, i) => {
        const label = TOOL_LABELS[trace.tool] ?? trace.tool;
        const siftSuffix = trace.args["sift_id"] ? String(trace.args["sift_id"]).slice(-6) : null;
        return (
          <li
            key={i}
            className="group flex items-center gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1.5 text-xs"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <span className="font-mono text-[10px] font-semibold text-muted-foreground/60 tabular-nums w-5 shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <Wrench className="h-3 w-3 text-amber-500/80 shrink-0" strokeWidth={2.25} />
            <span className="font-medium text-foreground/90 truncate">{label}</span>
            {siftSuffix && (
              <span className="font-mono text-[10px] text-muted-foreground/50 shrink-0">· {siftSuffix}</span>
            )}
            <span className="ml-auto flex items-center gap-1.5 text-muted-foreground shrink-0">
              <span className="font-mono text-[10px] text-muted-foreground/50 tabular-nums">{trace.duration_ms}ms</span>
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            </span>
          </li>
        );
      })}
    </ol>
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
        em: ({ children }) => <em className="italic">{children}</em>,
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
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>
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
          <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {children}
          </th>
        ),
        td: ({ children }) => <td className="px-3 py-2 text-foreground/90">{children}</td>,
      }}
    >
      {children}
    </ReactMarkdown>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
          <Markdown className="prose-invert">{message.content}</Markdown>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <AssistantAvatar />
      <div className="flex-1 min-w-0 space-y-3 pt-0.5">
        {message.trace && message.trace.length > 0 && <TraceList traces={message.trace} />}
        {message.content && (
          <div className="text-[14px] text-foreground/95">
            <Markdown>{message.content}</Markdown>
          </div>
        )}
        {message.data && message.data.length > 0 && (
          <DataTable data={message.data as Record<string, unknown>[]} />
        )}
        {message.pipeline && message.pipeline.length > 0 && (
          <PipelineToggle pipeline={message.pipeline as Record<string, unknown>[]} />
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
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}>(function AutoTextarea({ value, onChange, onEnter, placeholder, disabled, autoFocus }, ref) {
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
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onEnter();
        }
      }}
      placeholder={placeholder}
      rows={1}
      disabled={disabled}
      autoFocus={autoFocus}
      className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none max-h-[200px] disabled:opacity-60"
    />
  );
});

function KeyboardHint() {
  return (
    <p className="mt-2 flex items-center justify-center gap-2 font-mono text-[10px] tracking-[0.08em] text-muted-foreground/55">
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

// ---------- component ----------

export const ChatInterface = forwardRef<ChatInterfaceHandle, ChatInterfaceProps>(function ChatInterface(
  { siftId, height = "500px", compact = false, onMessagesChange },
  ref,
) {
  const [input, setInput] = useState("");
  const { messages, isLoading, sendMessage } = useChat(siftId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    onMessagesChange?.(messages);
  }, [messages, onMessagesChange]);

  useImperativeHandle(ref, () => ({
    submit: (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;
      sendMessage(trimmed);
    },
  }), [sendMessage, isLoading]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput("");
    textareaRef.current?.focus();
  };

  return (
    <div className="flex flex-col" style={{ height }}>
      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto px-5 py-6 space-y-6">
          {messages.length === 0 && (
            <div className="py-12 text-center space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
                Ready when you are
              </p>
              <p className="text-sm text-muted-foreground/80">
                Ask anything about your documents. The agent searches across every sift automatically.
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          {isLoading && <TypingDots />}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      <div className="border-t px-5 py-3 shrink-0 bg-gradient-to-t from-background via-background to-background/80 backdrop-blur">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2 rounded-2xl border border-border/80 bg-card p-2 shadow-sm focus-within:border-amber-400/40 focus-within:shadow-[0_6px_22px_-10px_hsl(40_92%_50%/0.22)] transition-all">
            <AutoTextarea
              ref={textareaRef}
              value={input}
              onChange={setInput}
              onEnter={handleSend}
              placeholder="Ask about your data…"
              disabled={isLoading}
              autoFocus
            />
            <Button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              size="icon"
              className="h-8 w-8 shrink-0 bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-600 text-white"
            >
              <CornerDownLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
            </Button>
          </div>
          {!compact && <KeyboardHint />}
        </div>
      </div>
    </div>
  );
});
