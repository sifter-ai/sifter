import { describe, it, expect, vi, beforeEach } from "vitest";
import { FolderHandle } from "../folder.js";
import { SiftHandle } from "../sift.js";

const API_URL = "http://test.local";
const HEADERS = { "X-API-Key": "sk-test" };

function makeFolder(fetchMock: typeof globalThis.fetch, overrides: Record<string, unknown> = {}): FolderHandle {
  return new FolderHandle(
    { id: "folder-1", name: "Inbox", description: "", document_count: 0, ...overrides },
    API_URL,
    HEADERS,
    fetchMock,
  );
}

function makeSift(fetchMock: typeof globalThis.fetch, id = "sift-1"): SiftHandle {
  return new SiftHandle(
    { id, name: "Test", status: "active", default_folder_id: null },
    API_URL,
    HEADERS,
    fetchMock,
  );
}

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function errResponse(status: number, detail: string): Response {
  return {
    ok: false,
    status,
    statusText: "Error",
    json: async () => ({ detail }),
    text: async () => detail,
  } as Response;
}

describe("FolderHandle", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let folder: FolderHandle;

  beforeEach(() => {
    fetchMock = vi.fn();
    folder = makeFolder(fetchMock);
  });

  // ── accessors ───────────────────────────────────────────────────────────────

  it("exposes id and name", () => {
    const f = makeFolder(fetchMock, { id: "f-99", name: "Contracts" });
    expect(f.id).toBe("f-99");
    expect(f.name).toBe("Contracts");
  });

  // ── documents ───────────────────────────────────────────────────────────────

  describe("documents", () => {
    it("GETs /api/folders/:id/documents and returns items", async () => {
      const items = [{ id: "doc-1", filename: "invoice.pdf" }];
      fetchMock.mockResolvedValue(okResponse({ items }));

      const docs = await folder.documents();

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/api/folders/folder-1/documents`,
        expect.objectContaining({ headers: HEADERS }),
      );
      expect(docs).toHaveLength(1);
    });

    it("falls back to raw array when response has no items key", async () => {
      const raw = [{ id: "doc-1" }];
      fetchMock.mockResolvedValue(okResponse(raw));

      const docs = await folder.documents();
      expect(docs).toEqual(raw);
    });
  });

  // ── addSift ─────────────────────────────────────────────────────────────────

  describe("addSift", () => {
    it("POSTs sift_id to /api/folders/:id/extractors", async () => {
      fetchMock.mockResolvedValue(okResponse({}));

      const sift = makeSift(fetchMock, "sift-42");
      const result = await folder.addSift(sift);

      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${API_URL}/api/folders/folder-1/extractors`);
      expect((opts as RequestInit).method).toBe("POST");
      const body = JSON.parse((opts as RequestInit).body as string);
      expect(body.sift_id).toBe("sift-42");
      expect(result).toBe(folder); // chaining
    });
  });

  // ── removeSift ──────────────────────────────────────────────────────────────

  describe("removeSift", () => {
    it("DELETEs /api/folders/:id/extractors/:siftId", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204, json: async () => ({}), text: async () => "" } as Response);

      const sift = makeSift(fetchMock, "sift-5");
      const result = await folder.removeSift(sift);

      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${API_URL}/api/folders/folder-1/extractors/sift-5`);
      expect((opts as RequestInit).method).toBe("DELETE");
      expect(result).toBe(folder); // chaining
    });
  });

  // ── sifts ───────────────────────────────────────────────────────────────────

  describe("sifts", () => {
    it("GETs /api/folders/:id/extractors", async () => {
      const siftList = [{ id: "sift-1" }, { id: "sift-2" }];
      fetchMock.mockResolvedValue(okResponse(siftList));

      const result = await folder.sifts();

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/api/folders/folder-1/extractors`,
        expect.objectContaining({ headers: HEADERS }),
      );
      expect(result).toHaveLength(2);
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe("update", () => {
    it("PATCHes name and description, returns same instance", async () => {
      fetchMock.mockResolvedValue(okResponse({ id: "folder-1", name: "Renamed", description: "New desc" }));

      const result = await folder.update({ name: "Renamed", description: "New desc" });

      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${API_URL}/api/folders/folder-1`);
      expect((opts as RequestInit).method).toBe("PATCH");
      const body = JSON.parse((opts as RequestInit).body as string);
      expect(body.name).toBe("Renamed");
      expect(result).toBe(folder);
      expect(result.name).toBe("Renamed");
    });
  });

  // ── delete ──────────────────────────────────────────────────────────────────

  describe("delete", () => {
    it("sends DELETE to /api/folders/:id", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204, json: async () => ({}), text: async () => "" } as Response);

      await folder.delete();

      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${API_URL}/api/folders/folder-1`);
      expect((opts as RequestInit).method).toBe("DELETE");
    });
  });

  // ── error handling ───────────────────────────────────────────────────────────

  describe("error handling", () => {
    it("throws SifterError on 403", async () => {
      fetchMock.mockResolvedValue(errResponse(403, "Forbidden"));

      await expect(folder.documents()).rejects.toMatchObject({
        name: "SifterError",
        status: 403,
        message: "Forbidden",
      });
    });

    it("throws SifterError on 404 when adding a sift", async () => {
      fetchMock.mockResolvedValue(errResponse(404, "Sift not found"));

      const sift = makeSift(fetchMock);
      await expect(folder.addSift(sift)).rejects.toMatchObject({
        name: "SifterError",
        status: 404,
      });
    });
  });
});
