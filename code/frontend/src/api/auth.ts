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
  full_name: string,
  privacy_accepted: boolean
): Promise<AuthResponse> {
  return apiFetchJson<AuthResponse>("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, full_name, privacy_accepted }),
  });
}

export async function deleteAccount(): Promise<void> {
  await apiFetchJson("/api/auth/me", { method: "DELETE" });
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

export async function updateProfile(data: { full_name?: string; email?: string }): Promise<User> {
  return apiFetchJson<User>("/api/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function changePassword(current_password: string, new_password: string): Promise<void> {
  await apiFetchJson("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password, new_password }),
  });
}

export async function uploadAvatar(file: File): Promise<User> {
  const form = new FormData();
  form.append("file", file);
  return apiFetchJson<User>("/api/auth/avatar", { method: "POST", body: form });
}
