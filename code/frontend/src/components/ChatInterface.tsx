import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChat } from "@/hooks/useChat";
import type { ChatMessage } from "@/api/types";

interface ChatInterfaceProps {
  siftId?: string;
  /** CSS height for the chat area. Defaults to "500px". Use "100%" to fill parent. */
  height?: string;
}

function DataTable({ data }: { data: Record<string, unknown>[] }) {
  if (!data.length) return null;
  const cols = Object.keys(data[0]);
  return (
    <div className="overflow-x-auto rounded border mt-2 text-xs">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            {cols.map((c) => (
              <th key={c} className="px-3 py-1.5 text-left font-medium text-muted-foreground">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 20).map((row, i) => (
            <tr key={i} className="border-b last:border-0">
              {cols.map((c) => (
                <td key={c} className="px-3 py-1.5">
                  {row[c] === null || row[c] === undefined ? "—" : String(row[c])}
                </td>
              ))}
            </tr>
          ))}
          {data.length > 20 && (
            <tr>
              <td colSpan={cols.length} className="px-3 py-1.5 text-muted-foreground">
                ... {data.length - 20} more rows
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
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs opacity-70 hover:opacity-100 transition-opacity"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        View pipeline
      </button>
      {open && (
        <pre className="mt-1 text-xs bg-black/10 dark:bg-white/10 p-2 rounded overflow-x-auto">
          {JSON.stringify(pipeline, null, 2)}
        </pre>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        {!isUser && message.data && message.data.length > 0 && (
          <DataTable data={message.data as Record<string, unknown>[]} />
        )}
        {!isUser && message.pipeline && message.pipeline.length > 0 && (
          <PipelineToggle pipeline={message.pipeline as Record<string, unknown>[]} />
        )}
      </div>
    </div>
  );
}

export function ChatInterface({ siftId, height = "500px" }: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const { messages, isLoading, sendMessage } = useChat(siftId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput("");
  };

  return (
    <div className="flex flex-col" style={{ height }}>
      <ScrollArea className="flex-1 p-4">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground py-12 text-sm">
            <p>Ask questions about your extracted data.</p>
            <p className="mt-1">e.g. "What's the total amount?" or "Show top clients by value"</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        {isLoading && (
          <div className="flex justify-start mb-4">
            <div className="bg-muted rounded-lg px-4 py-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </ScrollArea>
      <div className="border-t p-4 flex gap-2">
        <Input
          placeholder="Ask about your data..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          disabled={isLoading}
        />
        <Button onClick={handleSend} disabled={isLoading || !input.trim()} size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
