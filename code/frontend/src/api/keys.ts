import { APIKey, PaginatedResponse } from "./types";
import { apiFetchJson } from "../lib/apiFetch";

interface CreateKeyResponse {
  key: APIKey;
  plaintext: string;
}

export async function fetchApiKeys(): Promise<PaginatedResponse<APIKey>> {
  return apiFetchJson<PaginatedResponse<APIKey>>("/api/keys?limit=100");
}

export async function createApiKey(name: string): Promise<CreateKeyResponse> {
  return apiFetchJson<CreateKeyResponse>("/api/keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function revokeApiKey(keyId: string): Promise<void> {
  await apiFetchJson(`/api/keys/${keyId}`, { method: "DELETE" });
}
