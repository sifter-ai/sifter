import { apiFetchJson } from "../lib/apiFetch";
import type { ChatMessage, ChatResponse, ChatSession, SessionMessage } from "./types";

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

// ── Chat sessions ──────────────────────────────────────────────────

export const fetchChatSessions = (): Promise<{ items: ChatSession[] }> =>
  apiFetchJson("/api/chat/sessions");

export const createChatSession = (): Promise<ChatSession> =>
  apiFetchJson("/api/chat/sessions", { method: "POST" });

export const fetchChatSession = (
  id: string
): Promise<{ session: ChatSession; messages: SessionMessage[] }> =>
  apiFetchJson(`/api/chat/sessions/${id}`);

export const deleteChatSession = (id: string): Promise<void> =>
  apiFetchJson(`/api/chat/sessions/${id}`, { method: "DELETE" });

export const sendSessionMessage = (
  sessionId: string,
  content: string
): Promise<SessionMessage> =>
  apiFetchJson(`/api/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
