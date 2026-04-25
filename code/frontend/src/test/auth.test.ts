/**
 * Tests for the auth, keys, webhooks and orgs API layer.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { login, register, fetchMe, switchOrg } from "../api/auth";
import { fetchApiKeys, createApiKey, revokeApiKey } from "../api/keys";
import { fetchWebhooks, createWebhook, deleteWebhook } from "../api/webhooks";
import { listOrgs, getMyOrg, listMembers, removeMember } from "../api/orgs";

// ---- Helpers ----

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers({ "content-type": "application/json" }),
  });
}

function paginated<T>(items: T[]) {
  return { items, total: items.length, limit: 1000, offset: 0 };
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

// ---- Auth ----

describe("login", () => {
  it("posts credentials and returns token + user", async () => {
    const resp = {
      access_token: "jwt-token",
      token_type: "bearer",
      user: { id: "u1", email: "a@b.com", full_name: "Alice" },
    };
    vi.stubGlobal("fetch", mockFetch(200, resp));
    const result = await login("a@b.com", "password");
    expect(result.access_token).toBe("jwt-token");
    expect(result.user.email).toBe("a@b.com");
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "a@b.com", password: "password" }),
      })
    );
  });

  it("throws on 401", async () => {
    vi.stubGlobal("fetch", mockFetch(401, { detail: "Invalid credentials" }));
    await expect(login("a@b.com", "wrong")).rejects.toThrow();
  });
});

describe("register", () => {
  it("posts registration data and returns token", async () => {
    const resp = {
      access_token: "jwt-token",
      token_type: "bearer",
      user: { id: "u2", email: "new@b.com", full_name: "Bob" },
    };
    vi.stubGlobal("fetch", mockFetch(200, resp));
    const result = await register("new@b.com", "pass123", "Bob", true);
    expect(result.access_token).toBe("jwt-token");
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "new@b.com", password: "pass123", full_name: "Bob", privacy_accepted: true }),
      })
    );
  });

  it("throws on 409 duplicate email", async () => {
    vi.stubGlobal("fetch", mockFetch(409, { detail: "Email already registered" }));
    await expect(register("dup@b.com", "pass", "Bob", true)).rejects.toThrow();
  });
});

describe("fetchMe", () => {
  it("fetches current user", async () => {
    const user = { id: "u1", email: "a@b.com", full_name: "Alice" };
    vi.stubGlobal("fetch", mockFetch(200, user));
    const result = await fetchMe();
    expect(result).toEqual(user);
    expect(fetch).toHaveBeenCalledWith("/api/auth/me", expect.objectContaining({}));
  });
});

describe("switchOrg", () => {
  it("posts org_id and returns new token", async () => {
    const resp = { access_token: "new-jwt", token_type: "bearer", user: { id: "u1" }, org_id: "org2" };
    vi.stubGlobal("fetch", mockFetch(200, resp));
    const result = await switchOrg("org2");
    expect(result.org_id).toBe("org2");
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/switch-org",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ org_id: "org2" }),
      })
    );
  });
});

// ---- API Keys ----

describe("fetchApiKeys", () => {
  it("returns list of API keys", async () => {
    const keys = [
      { id: "k1", name: "CI Bot", prefix: "sk-ab", created_at: "2024-01-01T00:00:00Z" },
    ];
    vi.stubGlobal("fetch", mockFetch(200, paginated(keys)));
    const result = await fetchApiKeys();
    expect(result.items).toEqual(keys);
    expect(fetch).toHaveBeenCalledWith("/api/keys?limit=100", expect.objectContaining({}));
  });
});

describe("createApiKey", () => {
  it("creates a key and returns plaintext", async () => {
    const resp = {
      key: { id: "k1", name: "Deploy", prefix: "sk-xy", created_at: "2024-01-01T00:00:00Z" },
      plaintext: "sk-xy1234secret",
    };
    vi.stubGlobal("fetch", mockFetch(200, resp));
    const result = await createApiKey("Deploy");
    expect(result.plaintext).toBe("sk-xy1234secret");
    expect(fetch).toHaveBeenCalledWith(
      "/api/keys",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Deploy" }),
      })
    );
  });
});

describe("revokeApiKey", () => {
  it("sends DELETE request", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { deleted: true }));
    await revokeApiKey("k1");
    expect(fetch).toHaveBeenCalledWith(
      "/api/keys/k1",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

// ---- Webhooks ----

describe("fetchWebhooks", () => {
  it("returns list of webhooks", async () => {
    const hooks = [
      { id: "h1", events: ["sift.completed"], url: "https://example.com/hook", sift_id: null, created_at: "2024-01-01T00:00:00Z" },
    ];
    vi.stubGlobal("fetch", mockFetch(200, paginated(hooks)));
    const result = await fetchWebhooks();
    expect(result.items).toEqual(hooks);
    expect(fetch).toHaveBeenCalledWith(
      "/api/webhooks?limit=100",
      expect.objectContaining({})
    );
  });
});

describe("createWebhook", () => {
  it("creates webhook with events and url", async () => {
    const created = { id: "h1", events: ["sift.completed"], url: "https://example.com/hook", sift_id: null, created_at: "2024-01-01T00:00:00Z" };
    vi.stubGlobal("fetch", mockFetch(200, created));
    const result = await createWebhook({ events: ["sift.completed"], url: "https://example.com/hook" });
    expect(result).toEqual(created);
    expect(fetch).toHaveBeenCalledWith(
      "/api/webhooks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ events: ["sift.completed"], url: "https://example.com/hook" }),
      })
    );
  });

  it("creates webhook scoped to a sift", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { id: "h2" }));
    await createWebhook({ events: ["sift.document.processed"], url: "https://example.com/hook", sift_id: "s1" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/webhooks",
      expect.objectContaining({
        body: JSON.stringify({ events: ["sift.document.processed"], url: "https://example.com/hook", sift_id: "s1" }),
      })
    );
  });
});

describe("deleteWebhook", () => {
  it("sends DELETE request", async () => {
    vi.stubGlobal("fetch", mockFetch(200, {}));
    await deleteWebhook("h1");
    expect(fetch).toHaveBeenCalledWith(
      "/api/webhooks/h1",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

// ---- Orgs ----

describe("listOrgs", () => {
  it("returns list of orgs with current_org_id", async () => {
    const resp = { orgs: [{ org_id: "org1", name: "Acme Corp", role: "owner" }], current_org_id: "org1" };
    vi.stubGlobal("fetch", mockFetch(200, resp));
    const result = await listOrgs();
    expect(result.orgs[0].name).toBe("Acme Corp");
    expect(fetch).toHaveBeenCalledWith("/api/orgs", expect.objectContaining({}));
  });
});

describe("listMembers", () => {
  it("returns org members", async () => {
    const resp = { members: [{ user_id: "m1", email: "a@b.com", role: "owner" }] };
    vi.stubGlobal("fetch", mockFetch(200, resp));
    const result = await listMembers();
    expect(result.members[0].email).toBe("a@b.com");
    expect(fetch).toHaveBeenCalledWith("/api/orgs/me/members", expect.objectContaining({}));
  });
});

describe("removeMember", () => {
  it("removes member by user_id", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { status: "removed" }));
    const result = await removeMember("m1");
    expect(result.status).toBe("removed");
    expect(fetch).toHaveBeenCalledWith("/api/orgs/me/members/m1", expect.objectContaining({ method: "DELETE" }));
  });
});
