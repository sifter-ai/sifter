import { Organization, OrganizationMember } from "./types";
import { apiFetchJson } from "../lib/apiFetch";

export async function fetchOrgs(): Promise<Organization[]> {
  return apiFetchJson<Organization[]>("/api/orgs");
}

export async function createOrg(name: string): Promise<{ org: Organization; access_token: string }> {
  return apiFetchJson("/api/orgs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function fetchMembers(orgId: string): Promise<OrganizationMember[]> {
  return apiFetchJson<OrganizationMember[]>(`/api/orgs/${orgId}/members`);
}

export async function addMember(orgId: string, email: string, role: string): Promise<OrganizationMember> {
  return apiFetchJson<OrganizationMember>(`/api/orgs/${orgId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role }),
  });
}
