/**
 * Authenticated fetch wrapper.
 * Injects Authorization: Bearer <token> header from localStorage.
 * On 401: clears token and dispatches "sifter:auth-expired" event.
 */

const TOKEN_KEY = "sifter_token";

// Allow overriding the API base URL via env var (e.g. Cloudflare Pages → api.sifter.run).
// Falls back to same-origin (empty string) for OSS self-hosted and local dev.
const _API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${_API_BASE}${path}`;
}

export class AuthError extends Error {
  constructor() {
    super("Authentication expired");
    this.name = "AuthError";
  }
}

export class PlanLimitError extends Error {
  code: string;
  plan: string;
  upgrade_url: string;
  constructor(detail: { code: string; plan: string; upgrade_url: string }) {
    super(`Plan limit: ${detail.code}`);
    this.name = "PlanLimitError";
    this.code = detail.code;
    this.plan = detail.plan;
    this.upgrade_url = detail.upgrade_url;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  url = apiUrl(url);
  const token = getToken();
  const headers = new Headers(options.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    clearToken();
    window.dispatchEvent(new CustomEvent("sifter:auth-expired"));
    throw new AuthError();
  }

  return response;
}

export async function parseApiError(response: Response): Promise<Error> {
  const text = await response.text();
  let json: { detail?: unknown; message?: unknown } | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON — fall through to raw text
  }
  if (json && typeof json === "object") {
    const detail = json.detail;
    if (
      response.status === 402 &&
      detail &&
      typeof detail === "object" &&
      (detail as { error?: string }).error === "plan_limit"
    ) {
      const planDetail = detail as { code: string; plan: string; upgrade_url: string; error: string };
      window.dispatchEvent(new CustomEvent("sifter:plan-limit", { detail: planDetail }));
      return new PlanLimitError(planDetail);
    }
    const message = detail ?? json.message;
    if (message != null) {
      return new Error(typeof message === "string" ? message : JSON.stringify(message));
    }
  }
  return new Error(text || `Request failed: ${response.status}`);
}

export async function apiFetchJson<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await apiFetch(url, options);
  if (!response.ok) {
    throw await parseApiError(response);
  }
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}
