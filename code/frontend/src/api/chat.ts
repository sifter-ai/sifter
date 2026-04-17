import { apiFetchJson } from "../lib/apiFetch";
import type { ChatMessage, ChatResponse } from "./types";

export const sendChatMessage = (
  message: string,
  siftId?: string,
  history: ChatMessage[] = []
): Promise<ChatResponse> =>
  apiFetchJson<ChatResponse>("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      sift_id: siftId,
      history: history.map(({ role, content }) => ({ role, content })),
    }),
  });
