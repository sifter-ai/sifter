import { apiFetchJson } from "../lib/apiFetch";

export interface OrgInfo {
  org_id: string;
  name: string;
  role: string;
  owner_user_id?: string;
  created_at?: string;
}

export interface OrgMember {
  user_id: string;
  email: string;
  full_name: string;
  role: "owner" | "admin" | "member";
  joined_at?: string;
}

export const listOrgs = (): Promise<{ orgs: OrgInfo[]; current_org_id: string }> =>
  apiFetchJson("/api/orgs");

export const switchOrg = (org_id: string): Promise<{ access_token: string; org_id: string }> =>
  apiFetchJson("/api/orgs/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ org_id }),
  });

export const getMyOrg = (): Promise<OrgInfo> =>
  apiFetchJson("/api/orgs/me");

export const listMembers = (): Promise<{ members: OrgMember[] }> =>
  apiFetchJson("/api/orgs/me/members");

export const removeMember = (userId: string): Promise<{ status: string }> =>
  apiFetchJson(`/api/orgs/me/members/${userId}`, { method: "DELETE" });

export const createOrg = (name: string): Promise<{ access_token: string; org_id: string }> =>
  apiFetchJson("/api/orgs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
