import { User } from "./types";
import { apiFetchJson } from "../lib/apiFetch";

interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
  org_id?: string;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return apiFetchJson<AuthResponse>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export async function register(
  email: string,
  password: string,
  full_name: string
): Promise<AuthResponse> {
  return apiFetchJson<AuthResponse>("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, full_name }),
  });
}

export async function fetchMe(): Promise<User> {
  return apiFetchJson<User>("/api/auth/me");
}

export async function googleAuth(credential: string): Promise<AuthResponse> {
  return apiFetchJson<AuthResponse>("/api/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
}

export async function switchOrg(org_id: string): Promise<AuthResponse> {
  return apiFetchJson<AuthResponse>("/api/auth/switch-org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ org_id }),
  });
}
