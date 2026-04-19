/**
 * Tests for the folders, documents API layer.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchFolders,
  fetchFolder,
  createFolder,
  updateFolder,
  deleteFolder,
  fetchFolderExtractors,
  linkExtractor,
  unlinkExtractor,
  fetchFolderDocuments,
  fetchDocument,
  deleteDocument,
  reprocessDocument,
} from "../api/folders";

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
});

// ---- Folders ----

describe("fetchFolders", () => {
  it("returns paginated response of folders", async () => {
    const data = [{ id: "f1", name: "Invoices", description: "", document_count: 3 }];
    vi.stubGlobal("fetch", mockFetch(200, paginated(data)));
    const result = await fetchFolders();
    expect(result.items).toEqual(data);
    expect(result.total).toBe(data.length);
    expect(fetch).toHaveBeenCalledWith(
      "/api/folders?limit=200&offset=0",
      expect.objectContaining({})
    );
  });

  it("throws on error", async () => {
    vi.stubGlobal("fetch", mockFetch(500, { detail: "Server error" }));
    await expect(fetchFolders()).rejects.toThrow();
  });
});

describe("fetchFolder", () => {
  it("fetches a single folder with extractors", async () => {
    const data = { id: "f1", name: "Invoices", extractors: [] };
    vi.stubGlobal("fetch", mockFetch(200, data));
    const result = await fetchFolder("f1");
    expect(result).toEqual(data);
    expect(fetch).toHaveBeenCalledWith("/api/folders/f1", expect.objectContaining({}));
  });

  it("throws on 404", async () => {
    vi.stubGlobal("fetch", mockFetch(404, { detail: "Not found" }));
    await expect(fetchFolder("missing")).rejects.toThrow();
  });
});

describe("createFolder", () => {
  it("posts with name and description", async () => {
    const created = { id: "f1", name: "Contracts", description: "Legal docs" };
    vi.stubGlobal("fetch", mockFetch(200, created));
    const result = await createFolder("Contracts", "Legal docs");
    expect(result).toEqual(created);
    expect(fetch).toHaveBeenCalledWith(
      "/api/folders",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Contracts", description: "Legal docs" }),
      })
    );
  });

  it("defaults description to empty string when omitted", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { id: "f2", name: "Misc", description: "" }));
    await createFolder("Misc");
    expect(fetch).toHaveBeenCalledWith(
      "/api/folders",
      expect.objectContaining({
        body: JSON.stringify({ name: "Misc", description: "" }),
      })
    );
  });
});

describe("updateFolder", () => {
  it("sends PATCH with payload", async () => {
    const updated = { id: "f1", name: "Renamed", description: "" };
    vi.stubGlobal("fetch", mockFetch(200, updated));
    const result = await updateFolder("f1", { name: "Renamed" });
    expect(result).toEqual(updated);
    expect(fetch).toHaveBeenCalledWith(
      "/api/folders/f1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed" }),
      })
    );
  });
});

describe("deleteFolder", () => {
  it("sends DELETE request", async () => {
    vi.stubGlobal("fetch", mockFetch(200, {}));
    await deleteFolder("f1");
    expect(fetch).toHaveBeenCalledWith(
      "/api/folders/f1",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

// ---- Folder-Sift Links ----

describe("fetchFolderExtractors", () => {
  it("fetches extractors for a folder as paginated response", async () => {
    const data = [{ sift_id: "s1", folder_id: "f1", status: "active" }];
    vi.stubGlobal("fetch", mockFetch(200, paginated(data)));
    const result = await fetchFolderExtractors("f1");
    expect(result.items).toEqual(data);
    expect(fetch).toHaveBeenCalledWith(
      "/api/folders/f1/extractors?limit=100",
      expect.objectContaining({})
    );
  });
});

describe("linkExtractor", () => {
  it("posts sift_id to folder extractors", async () => {
    const linked = { sift_id: "s1", folder_id: "f1", status: "active" };
    vi.stubGlobal("fetch", mockFetch(200, linked));
    const result = await linkExtractor("f1", "s1");
    expect(result).toEqual(linked);
    expect(fetch).toHaveBeenCalledWith(
      "/api/folders/f1/extractors",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sift_id: "s1" }),
      })
    );
  });
});

describe("unlinkExtractor", () => {
  it("sends DELETE to folder extractor", async () => {
    vi.stubGlobal("fetch", mockFetch(200, {}));
    await unlinkExtractor("f1", "s1");
    expect(fetch).toHaveBeenCalledWith(
      "/api/folders/f1/extractors/s1",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

// ---- Documents ----

describe("fetchFolderDocuments", () => {
  it("returns paginated response of documents in a folder", async () => {
    const docs = [
      {
        id: "d1",
        filename: "inv_001.pdf",
        original_filename: "invoice.pdf",
        content_type: "application/pdf",
        size_bytes: 12345,
        uploaded_at: "2024-01-01T00:00:00Z",
        sift_statuses: [],
      },
    ];
    vi.stubGlobal("fetch", mockFetch(200, paginated(docs)));
    const result = await fetchFolderDocuments("f1");
    expect(result.items).toEqual(docs);
    expect(result.total).toBe(docs.length);
    expect(fetch).toHaveBeenCalledWith(
      "/api/folders/f1/documents?limit=50&offset=0",
      expect.objectContaining({})
    );
  });
});

describe("fetchDocument", () => {
  it("fetches a single document with sift_statuses", async () => {
    const data = {
      id: "d1",
      filename: "inv_001.pdf",
      sift_statuses: [{ sift_id: "s1", status: "done" }],
    };
    vi.stubGlobal("fetch", mockFetch(200, data));
    const result = await fetchDocument("d1");
    expect(result).toEqual(data);
    expect(fetch).toHaveBeenCalledWith(
      "/api/documents/d1",
      expect.objectContaining({})
    );
  });
});

describe("deleteDocument", () => {
  it("sends DELETE request", async () => {
    vi.stubGlobal("fetch", mockFetch(200, {}));
    await deleteDocument("d1");
    expect(fetch).toHaveBeenCalledWith(
      "/api/documents/d1",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

describe("reprocessDocument", () => {
  it("reprocesses all sifts when no sift_id given", async () => {
    const resp = { document_id: "d1", enqueued_for: ["s1", "s2"] };
    vi.stubGlobal("fetch", mockFetch(200, resp));
    const result = await reprocessDocument("d1");
    expect(result.enqueued_for).toEqual(["s1", "s2"]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/documents/d1/reprocess",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sift_id: undefined }),
      })
    );
  });

  it("reprocesses a specific sift when sift_id given", async () => {
    const resp = { document_id: "d1", enqueued_for: ["s1"] };
    vi.stubGlobal("fetch", mockFetch(200, resp));
    await reprocessDocument("d1", "s1");
    expect(fetch).toHaveBeenCalledWith(
      "/api/documents/d1/reprocess",
      expect.objectContaining({
        body: JSON.stringify({ sift_id: "s1" }),
      })
    );
  });
});
