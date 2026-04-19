import { apiFetchJson } from "../lib/apiFetch";

export interface Invite {
  id: string;
  org_id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
}

export const listInvites = (): Promise<{ invites: Invite[] }> =>
  apiFetchJson("/api/invites");

export const sendInvite = (email: string): Promise<{ status: string; email: string }> =>
  apiFetchJson("/api/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

export const revokeInvite = (id: string): Promise<{ status: string }> =>
  apiFetchJson(`/api/invites/${id}`, { method: "DELETE" });
