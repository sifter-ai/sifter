import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ChatInterface } from "@/components/ChatInterface";
import { useSifts } from "@/hooks/useExtractions";

export function ChatPage() {
  const [selectedSiftId, setSelectedSiftId] = useState<string | undefined>();
  const { data: sifts } = useSifts();

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b">
        <MessageCircle className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">Chat</h1>
          <p className="text-muted-foreground text-xs">Ask questions about your extracted data</p>
        </div>
        {sifts && sifts.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Sift:</label>
            <select
              className="flex h-8 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={selectedSiftId ?? ""}
              onChange={(e) => setSelectedSiftId(e.target.value || undefined)}
            >
              <option value="">Auto-detect</option>
              {sifts.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Chat area fills remaining height */}
      <div className="flex-1 overflow-hidden">
        <Card className="h-full rounded-none border-0">
          <CardContent className="p-0 h-full">
            <ChatInterface siftId={selectedSiftId} height="100%" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
