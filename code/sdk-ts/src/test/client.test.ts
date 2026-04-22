import { describe, it, expect, vi, beforeEach } from "vitest";
import { Sifter } from "../client.js";

function mockFetch(body: unknown, status = 200): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as Response);
}

const API_URL = "http://test.local";
const HEADERS = { "X-API-Key": "sk-test" };

describe("Sifter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: Sifter;

  beforeEach(() => {
    fetchMock = vi.fn();
    client = new Sifter({ apiUrl: API_URL, apiKey: "sk-test", fetch: fetchMock });
  });

  // ── createSift ──────────────────────────────────────────────────────────────

  describe("createSift", () => {
    it("POSTs to /api/sifts and returns a SiftHandle", async () => {
      const siftData = { id: "sift-1", name: "Test", status: "active", instructions: "..." };
      fetchMock.mockResolvedValue({
        ok: true, status: 200,
        json: async () => siftData,
        text: async () => "",
      } as Response);

      const sift = await client.createSift("Test", "...");

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/api/sifts`,
        expect.objectContaining({ method: "POST" }),
      );
      expect(sift.id).toBe("sift-1");
      expect(sift.name).toBe("Test");
    });

    it("includes description in the request body", async () => {
      fetchMock.mockResolvedValue({
        ok: true, status: 200,
        json: async () => ({ id: "s1", name: "N", status: "active" }),
        text: async () => "",
      } as Response);

      await client.createSift("N", "instructions", "a description");

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.description).toBe("a description");
    });

    it("throws SifterError on non-ok response", async () => {
      fetchMock.mockResolvedValue({
        ok: false, status: 422, statusText: "Unprocessable Entity",
        json: async () => ({ detail: "Invalid instructions" }),
        text: async () => "",
      } as Response);

      await expect(client.createSift("x", "y")).rejects.toMatchObject({
        name: "SifterError",
        status: 422,
      });
    });
  });

  // ── getSift ─────────────────────────────────────────────────────────────────

  describe("getSift", () => {
    it("GETs /api/sifts/:id", async () => {
      fetchMock.mockResolvedValue({
        ok: true, status: 200,
        json: async () => ({ id: "sift-42", name: "My sift", status: "active" }),
        text: async () => "",
      } as Response);

      const sift = await client.getSift("sift-42");

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/api/sifts/sift-42`,
        expect.objectContaining({ headers: HEADERS }),
      );
      expect(sift.id).toBe("sift-42");
    });
  });

  // ── listSifts ───────────────────────────────────────────────────────────────

  describe("listSifts", () => {
    it("returns the items array", async () => {
      const items = [
        { id: "s1", name: "A", status: "active" },
        { id: "s2", name: "B", status: "indexing" },
      ];
      fetchMock.mockResolvedValue({
        ok: true, status: 200,
        json: async () => ({ items }),
        text: async () => "",
      } as Response);

      const result = await client.listSifts();

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe("s1");
    });

    it("passes limit and offset as query params", async () => {
      fetchMock.mockResolvedValue({
        ok: true, status: 200,
        json: async () => ({ items: [] }),
        text: async () => "",
      } as Response);

      await client.listSifts(10, 20);

      const url = fetchMock.mock.calls[0]![0] as string;
      expect(url).toContain("limit=10");
      expect(url).toContain("offset=20");
    });
  });

  // ── createFolder ────────────────────────────────────────────────────────────

  describe("createFolder", () => {
    it("GETs /api/folders/by-path?path=...&create=true and returns a FolderHandle", async () => {
      fetchMock.mockResolvedValue({
        ok: true, status: 200,
        json: async () => ({ id: "folder-1", name: "Inbox", description: "" }),
        text: async () => "",
      } as Response);

      const folder = await client.createFolder("/inbox");

      const url = fetchMock.mock.calls[0]![0] as string;
      expect(url).toContain("/api/folders/by-path");
      expect(url).toContain("path=%2Finbox");
      expect(url).toContain("create=true");
      expect(folder.id).toBe("folder-1");
      expect(folder.name).toBe("Inbox");
    });
  });

  // ── getFolder ───────────────────────────────────────────────────────────────

  describe("getFolder", () => {
    it("GETs /api/folders/by-path?path=...", async () => {
      fetchMock.mockResolvedValue({
        ok: true, status: 200,
        json: async () => ({ id: "folder-7", name: "Contracts", description: "" }),
        text: async () => "",
      } as Response);

      const folder = await client.getFolder("/contracts");

      const url = fetchMock.mock.calls[0]![0] as string;
      expect(url).toContain("/api/folders/by-path");
      expect(url).toContain("path=%2Fcontracts");
      expect(folder.id).toBe("folder-7");
    });
  });

  // ── listFolders ─────────────────────────────────────────────────────────────

  describe("listFolders", () => {
    it("returns the items array", async () => {
      fetchMock.mockResolvedValue({
        ok: true, status: 200,
        json: async () => ({ items: [{ id: "f1", name: "A", description: "", document_count: 3 }] }),
        text: async () => "",
      } as Response);

      const result = await client.listFolders();
      expect(result[0]!.id).toBe("f1");
    });
  });

  // ── documentPageCount ───────────────────────────────────────────────────────

  describe("documentPageCount", () => {
    it("returns the total page count", async () => {
      fetchMock.mockResolvedValue({
        ok: true, status: 200,
        json: async () => ({ total: 5, items: [] }),
        text: async () => "",
      } as Response);

      const count = await client.documentPageCount("doc-1");
      expect(count).toBe(5);
    });
  });

  // ── documentPageImage ───────────────────────────────────────────────────────

  describe("documentPageImage", () => {
    it("GETs the page image as ArrayBuffer", async () => {
      const buf = new ArrayBuffer(8);
      fetchMock.mockResolvedValue({
        ok: true, status: 200,
        json: async () => ({}),
        text: async () => "",
        arrayBuffer: async () => buf,
      } as Response);

      const result = await client.documentPageImage("doc-1", 2, 200);

      const url = fetchMock.mock.calls[0]![0] as string;
      expect(url).toContain("/documents/doc-1/pages/2/image");
      expect(url).toContain("dpi=200");
      expect(result).toBe(buf);
    });
  });

  // ── constructor defaults ────────────────────────────────────────────────────

  describe("constructor", () => {
    it("strips trailing slash from apiUrl", async () => {
      fetchMock.mockResolvedValue({
        ok: true, status: 200,
        json: async () => ({ items: [] }),
        text: async () => "",
      } as Response);

      const c = new Sifter({ apiUrl: "http://test.local/", apiKey: "k", fetch: fetchMock });
      await c.listSifts();

      const url = fetchMock.mock.calls[0]![0] as string;
      expect(url).not.toContain("//api");
    });

    it("sends no auth header when apiKey is empty", async () => {
      fetchMock.mockResolvedValue({
        ok: true, status: 200,
        json: async () => ({ items: [] }),
        text: async () => "",
      } as Response);

      const c = new Sifter({ apiUrl: API_URL, apiKey: "", fetch: fetchMock });
      await c.listSifts();

      const opts = fetchMock.mock.calls[0]![1] as RequestInit;
      expect((opts.headers as Record<string, string>)["X-API-Key"]).toBeUndefined();
    });
  });
});
