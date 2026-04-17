import { describe, it, expect, vi, beforeEach } from "vitest";
import { SiftHandle } from "../sift.js";

const API_URL = "http://test.local";
const HEADERS = { "X-API-Key": "sk-test" };

function makeSift(fetchMock: typeof globalThis.fetch, overrides: Record<string, unknown> = {}): SiftHandle {
  return new SiftHandle(
    { id: "sift-1", name: "Test sift", status: "active", default_folder_id: null, ...overrides },
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

describe("SiftHandle", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let sift: SiftHandle;

  beforeEach(() => {
    fetchMock = vi.fn();
    sift = makeSift(fetchMock);
  });

  // ── accessors ───────────────────────────────────────────────────────────────

  it("exposes id, name, status, defaultFolderId", () => {
    const s = makeSift(fetchMock, { id: "s1", name: "N", status: "indexing", default_folder_id: "f-1" });
    expect(s.id).toBe("s1");
    expect(s.name).toBe("N");
    expect(s.status).toBe("indexing");
    expect(s.defaultFolderId).toBe("f-1");
  });

  it("defaultFolderId is null when not set", () => {
    expect(sift.defaultFolderId).toBeNull();
  });

  // ── records ─────────────────────────────────────────────────────────────────

  describe("records", () => {
    it("GETs /api/sifts/:id/records and returns items", async () => {
      const items = [
        { id: "r1", document_id: "d1", extracted_data: { total: 100 } },
        { id: "r2", document_id: "d2", extracted_data: { total: 200 } },
      ];
      fetchMock.mockResolvedValue(okResponse({ items }));

      const result = await sift.records();

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/sifts/sift-1/records"),
        expect.any(Object),
      );
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe("r1");
    });

    it("passes cursor when provided", async () => {
      fetchMock.mockResolvedValue(okResponse({ items: [] }));
      await sift.records({ cursor: "abc123" });
      const url = fetchMock.mock.calls[0]![0] as string;
      expect(url).toContain("cursor=abc123");
    });

    it("passes limit and offset when cursor is absent", async () => {
      fetchMock.mockResolvedValue(okResponse({ items: [] }));
      await sift.records({ limit: 10, offset: 5 });
      const url = fetchMock.mock.calls[0]![0] as string;
      expect(url).toContain("limit=10");
      expect(url).toContain("offset=5");
    });
  });

  // ── find ────────────────────────────────────────────────────────────────────

  describe("find", () => {
    it("returns records and next_cursor", async () => {
      fetchMock.mockResolvedValue(okResponse({
        items: [{ id: "r1" }],
        next_cursor: "next-page-token",
      }));

      const page = await sift.find({ limit: 1 });

      expect(page.records).toHaveLength(1);
      expect(page.next_cursor).toBe("next-page-token");
    });

    it("serialises filter and sort as JSON query params", async () => {
      fetchMock.mockResolvedValue(okResponse({ items: [], next_cursor: null }));

      await sift.find({
        filter: { total: { $gt: 100 } },
        sort: [["total", -1]],
      });

      const url = fetchMock.mock.calls[0]![0] as string;
      expect(url).toContain("filter=");
      expect(url).toContain("sort=");
    });
  });

  // ── aggregate ───────────────────────────────────────────────────────────────

  describe("aggregate", () => {
    it("POSTs the pipeline and returns results", async () => {
      const pipeline = [{ $group: { _id: "$currency", total: { $sum: "$amount" } } }];
      fetchMock.mockResolvedValue(okResponse({ results: [{ _id: "EUR", total: 500 }] }));

      const results = await sift.aggregate(pipeline);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/sifts/sift-1/aggregate"),
        expect.objectContaining({ method: "POST" }),
      );
      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.pipeline).toEqual(pipeline);
      expect(results).toHaveLength(1);
    });
  });

  // ── recordsCount ────────────────────────────────────────────────────────────

  describe("recordsCount", () => {
    it("returns the count", async () => {
      fetchMock.mockResolvedValue(okResponse({ count: 42 }));
      const count = await sift.recordsCount();
      expect(count).toBe(42);
    });

    it("passes filter as a query param", async () => {
      fetchMock.mockResolvedValue(okResponse({ count: 3 }));
      await sift.recordsCount({ status: "overdue" });
      const url = fetchMock.mock.calls[0]![0] as string;
      expect(url).toContain("filter=");
    });
  });

  // ── recordsByIds ─────────────────────────────────────────────────────────────

  describe("recordsByIds", () => {
    it("POSTs ids and returns items", async () => {
      const items = [{ id: "r1" }, { id: "r2" }];
      fetchMock.mockResolvedValue(okResponse({ items }));

      const result = await sift.recordsByIds(["r1", "r2"]);

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.ids).toEqual(["r1", "r2"]);
      expect(result).toHaveLength(2);
    });
  });

  // ── extract ─────────────────────────────────────────────────────────────────

  describe("extract", () => {
    it("POSTs document_id and returns task status", async () => {
      fetchMock.mockResolvedValue(okResponse({ task_id: "task-1", status: "queued" }));

      const result = await sift.extract("doc-1");

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.document_id).toBe("doc-1");
      expect(result.task_id).toBe("task-1");
      expect(result.status).toBe("queued");
    });
  });

  // ── extractionStatus ────────────────────────────────────────────────────────

  describe("extractionStatus", () => {
    it("returns the status string", async () => {
      fetchMock.mockResolvedValue(okResponse({ status: "completed" }));

      const status = await sift.extractionStatus("doc-1");

      const url = fetchMock.mock.calls[0]![0] as string;
      expect(url).toContain("document_id=doc-1");
      expect(status).toBe("completed");
    });
  });

  // ── query ───────────────────────────────────────────────────────────────────

  describe("query", () => {
    it("POSTs natural language and returns pipeline + results", async () => {
      fetchMock.mockResolvedValue(okResponse({
        pipeline: [{ $sort: { total: -1 } }],
        results: [{ id: "r1" }],
      }));

      const result = await sift.query("top 5 by total");

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.query).toBe("top 5 by total");
      expect(body.execute).toBe(true);
      expect(result.results).toHaveLength(1);
    });

    it("can request pipeline-only (execute=false)", async () => {
      fetchMock.mockResolvedValue(okResponse({ pipeline: [], results: null }));

      await sift.query("count by currency", false);

      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.execute).toBe(false);
    });
  });

  // ── schema ──────────────────────────────────────────────────────────────────

  describe("schema", () => {
    it("GETs /api/sifts/:id/schema", async () => {
      const schema = { schema_text: "...", schema_fields: [], schema_version: 2 };
      fetchMock.mockResolvedValue(okResponse(schema));

      const result = await sift.schema();

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/sifts/sift-1/schema"),
        expect.any(Object),
      );
      expect(result.schema_version).toBe(2);
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe("update", () => {
    it("PATCHes and returns updated handle", async () => {
      fetchMock.mockResolvedValue(okResponse({ id: "sift-1", name: "Renamed", status: "active" }));

      const updated = await sift.update({ name: "Renamed" });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/sifts/sift-1"),
        expect.objectContaining({ method: "PATCH" }),
      );
      expect(updated.name).toBe("Renamed");
      expect(updated).toBe(sift); // same instance
    });
  });

  // ── delete ──────────────────────────────────────────────────────────────────

  describe("delete", () => {
    it("sends DELETE to /api/sifts/:id", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204, json: async () => ({}), text: async () => "" } as Response);

      await sift.delete();

      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/api/sifts/sift-1`,
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  // ── exportCsv ───────────────────────────────────────────────────────────────

  describe("exportCsv", () => {
    it("returns CSV text from /api/sifts/:id/records/csv", async () => {
      const csv = "invoice_number,total\nINV-001,100\n";
      fetchMock.mockResolvedValue({
        ok: true, status: 200,
        json: async () => ({}),
        text: async () => csv,
      } as Response);

      const result = await sift.exportCsv();

      expect(result).toBe(csv);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/records/csv"),
        expect.any(Object),
      );
    });
  });

  // ── error handling ───────────────────────────────────────────────────────────

  describe("error handling", () => {
    it("throws SifterError with status and detail on 404", async () => {
      fetchMock.mockResolvedValue(errResponse(404, "Sift not found"));

      await expect(sift.records()).rejects.toMatchObject({
        name: "SifterError",
        status: 404,
        message: "Sift not found",
      });
    });

    it("throws SifterError on 500 with body", async () => {
      fetchMock.mockResolvedValue(errResponse(500, "Internal server error"));

      await expect(sift.aggregate([])).rejects.toMatchObject({
        name: "SifterError",
        status: 500,
      });
    });
  });
});
