import { assertOk } from "./errors.js";
import { FolderHandle } from "./folder.js";
import { SiftHandle } from "./sift.js";
import type { FolderData, PageInfo, SiftData, SifterOptions } from "./types.js";

export class SifterClient {
  private readonly _apiUrl: string;
  private readonly _headers: Record<string, string>;
  private readonly _fetch: typeof globalThis.fetch;

  constructor(options: SifterOptions = {}) {
    this._apiUrl = (options.apiUrl ?? "http://localhost:8000").replace(/\/$/, "");
    const apiKey = options.apiKey ?? (typeof globalThis !== "undefined" && "process" in globalThis
      ? (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env["SIFTER_API_KEY"]
      : undefined) ?? "";
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

  // ---- Folder CRUD ----

  async createFolder(name: string, description = ""): Promise<FolderHandle> {
    const res = await this._fetch(`${this._apiUrl}/api/folders`, {
      method: "POST",
      headers: { ...this._headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    await assertOk(res);
    return this._folderHandle(await res.json());
  }

  async getFolder(folderId: string): Promise<FolderHandle> {
    const res = await this._fetch(`${this._apiUrl}/api/folders/${folderId}`, {
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

  // ---- Document helpers ----

  async documentPageCount(documentId: string): Promise<number> {
    const res = await this._fetch(`${this._apiUrl}/api/documents/${documentId}/pages`, {
      headers: this._headers,
    });
    await assertOk(res);
    const data = await res.json() as { total: number };
    return data.total;
  }

  async documentPageImage(documentId: string, page = 1, dpi = 150): Promise<ArrayBuffer> {
    const params = new URLSearchParams({ dpi: String(dpi) });
    const res = await this._fetch(
      `${this._apiUrl}/api/documents/${documentId}/pages/${page}/image?${params}`,
      { headers: this._headers },
    );
    await assertOk(res);
    return res.arrayBuffer();
  }

  async documentPages(documentId: string): Promise<PageInfo[]> {
    const res = await this._fetch(`${this._apiUrl}/api/documents/${documentId}/pages`, {
      headers: this._headers,
    });
    await assertOk(res);
    const data = await res.json() as { items: PageInfo[] };
    return data.items;
  }
}
