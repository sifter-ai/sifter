import { assertOk } from "./errors.js";
import { FolderHandle } from "./folder.js";
import { SiftHandle } from "./sift.js";
import type { FolderData, PageInfo, SiftData, SifterOptions } from "./types.js";

export class Sifter {
  private readonly _apiUrl: string;
  private readonly _headers: Record<string, string>;
  private readonly _fetch: typeof globalThis.fetch;

  constructor(options: SifterOptions = {}) {
    const _env = typeof globalThis !== "undefined" && "process" in globalThis
      ? (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
      : {} as Record<string, string | undefined>;
    this._apiUrl = (options.apiUrl ?? _env["SIFTER_API_URL"] ?? "https://sifter.run").replace(/\/$/, "");
    const apiKey = options.apiKey ?? _env["SIFTER_API_KEY"] ?? "";
    this._headers = apiKey ? { "X-API-Key": apiKey } : {};
    this._fetch = options.fetch ?? globalThis.fetch;
  }

  private _siftHandle(data: Record<string, unknown>): SiftHandle {
    return new SiftHandle(data, this._apiUrl, this._headers, this._fetch);
  }

  private _folderHandle(data: Record<string, unknown>): FolderHandle {
    return new FolderHandle(data, this._apiUrl, this._headers, this._fetch);
  }

  // ---- Sift CRUD ----

  async createSift(name: string, instructions: string, description = ""): Promise<SiftHandle> {
    const res = await this._fetch(`${this._apiUrl}/api/sifts`, {
      method: "POST",
      headers: { ...this._headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name, instructions, description }),
    });
    await assertOk(res);
    return this._siftHandle(await res.json());
  }

  async getSift(siftId: string): Promise<SiftHandle> {
    const res = await this._fetch(`${this._apiUrl}/api/sifts/${siftId}`, {
      headers: this._headers,
    });
    await assertOk(res);
    return this._siftHandle(await res.json());
  }

  async listSifts(limit = 50, offset = 0): Promise<SiftData[]> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const res = await this._fetch(`${this._apiUrl}/api/sifts?${params}`, {
      headers: this._headers,
    });
    await assertOk(res);
    const data = await res.json() as { items: SiftData[] };
    return data.items;
  }

  // ---- One-liner ----

  async sift(path: string, instructions: string): Promise<unknown[]> {
    const s = await this.createSift(`sift-temp-${Date.now()}`, instructions);
    try {
      await s.upload(path, { onConflict: "replace" });
      await s.wait();
      return s.records();
    } finally {
      await s.delete().catch(() => { /* ignore */ });
    }
  }

  // ---- Folder CRUD ----

  async createFolder(path: string): Promise<FolderHandle> {
    const params = new URLSearchParams({ path, create: "true" });
    const res = await this._fetch(`${this._apiUrl}/api/folders/by-path?${params}`, {
      headers: this._headers,
    });
    await assertOk(res);
    return this._folderHandle(await res.json());
  }

  async getFolder(path: string): Promise<FolderHandle> {
    const params = new URLSearchParams({ path });
    const res = await this._fetch(`${this._apiUrl}/api/folders/by-path?${params}`, {
      headers: this._headers,
    });
    await assertOk(res);
    return this._folderHandle(await res.json());
  }

  async listFolders(limit = 50, offset = 0): Promise<FolderData[]> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const res = await this._fetch(`${this._apiUrl}/api/folders?${params}`, {
      headers: this._headers,
    });
    await assertOk(res);
    const data = await res.json() as { items: FolderData[] };
    return data.items;
  }

  document(documentId: string): DocumentHandle {
    return new DocumentHandle(documentId, this._apiUrl, this._headers, this._fetch);
  }

  // ---- Webhooks ----

  async registerHook(events: string | string[], url: string, siftId?: string): Promise<{ id: string }> {
    const payload: Record<string, unknown> = {
      events: Array.isArray(events) ? events : [events],
      url,
    };
    if (siftId) payload["sift_id"] = siftId;
    const res = await this._fetch(`${this._apiUrl}/api/webhooks`, {
      method: "POST",
      headers: { ...this._headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await assertOk(res);
    return res.json();
  }

  async listHooks(): Promise<unknown[]> {
    const res = await this._fetch(`${this._apiUrl}/api/webhooks`, {
      headers: this._headers,
    });
    await assertOk(res);
    const data = await res.json() as { items?: unknown[] };
    return data.items ?? (data as unknown as unknown[]);
  }

  async deleteHook(hookId: string): Promise<void> {
    const res = await this._fetch(`${this._apiUrl}/api/webhooks/${hookId}`, {
      method: "DELETE",
      headers: this._headers,
    });
    await assertOk(res);
  }
}

export class DocumentHandle {
  constructor(
    private readonly _documentId: string,
    private readonly _apiUrl: string,
    private readonly _headers: Record<string, string>,
    private readonly _fetch: typeof globalThis.fetch,
  ) {}

  async pageCount(): Promise<number> {
    const res = await this._fetch(
      `${this._apiUrl}/api/documents/${this._documentId}/pages`,
      { headers: this._headers },
    );
    await assertOk(res);
    const data = await res.json() as { total: number };
    return data.total;
  }

  async pageImage(page = 1, dpi = 150): Promise<ArrayBuffer> {
    const params = new URLSearchParams({ dpi: String(dpi) });
    const res = await this._fetch(
      `${this._apiUrl}/api/documents/${this._documentId}/pages/${page}/image?${params}`,
      { headers: this._headers },
    );
    await assertOk(res);
    return res.arrayBuffer();
  }

  async pages(): Promise<import("./types.js").PageInfo[]> {
    const res = await this._fetch(
      `${this._apiUrl}/api/documents/${this._documentId}/pages`,
      { headers: this._headers },
    );
    await assertOk(res);
    const data = await res.json() as { items: import("./types.js").PageInfo[] };
    return data.items;
  }
}
