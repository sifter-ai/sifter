import { MessageCircle, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ChatInterface } from "@/components/ChatInterface";
import { useSifts } from "@/hooks/useExtractions";

export function ChatPage() {
  const { data: sifts } = useSifts();
  const siftCount = sifts?.length ?? 0;

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b">
        <MessageCircle className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">Chat</h1>
          <p className="text-muted-foreground text-xs">Ask questions about your extracted data</p>
        </div>
        {siftCount > 0 && (
          <div className="ml-auto flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/5 px-3 py-1 text-xs text-amber-600 dark:text-amber-400">
            <Sparkles className="h-3 w-3" />
            <span>Agent · {siftCount} sift{siftCount !== 1 ? "s" : ""} available</span>
          </div>
        )}
      </div>

      {/* Chat area fills remaining height */}
      <div className="flex-1 overflow-hidden">
        <Card className="h-full rounded-none border-0">
          <CardContent className="p-0 h-full">
            <ChatInterface height="100%" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
