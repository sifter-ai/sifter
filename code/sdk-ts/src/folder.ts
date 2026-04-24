import { assertOk } from "./errors.js";
import type { FolderData } from "./types.js";
import type { SiftHandle } from "./sift.js";

function matchPattern(pattern: string, event: string): boolean {
  if (pattern === "**" || pattern === "*") return true;
  const pp = pattern.split(".");
  const ep = event.split(".");
  const match = (pp: string[], ep: string[]): boolean => {
    if (!pp.length && !ep.length) return true;
    if (!pp.length) return false;
    if (pp[0] === "**") {
      for (let i = 0; i <= ep.length; i++) {
        if (match(pp.slice(1), ep.slice(i))) return true;
      }
      return false;
    }
    if (!ep.length) return false;
    if (pp[0] === "*" || pp[0] === ep[0]) return match(pp.slice(1), ep.slice(1));
    return false;
  };
  return match(pp, ep);
}

export class FolderHandle {
  readonly id: string;
  private _data: Record<string, unknown>;
  private readonly _apiUrl: string;
  private readonly _headers: Record<string, string>;
  private readonly _fetch: typeof globalThis.fetch;
  private _callbacks: Array<[string, (...args: unknown[]) => void]> = [];

  constructor(
    data: Record<string, unknown>,
    apiUrl: string,
    headers: Record<string, string>,
    fetchFn: typeof globalThis.fetch,
  ) {
    this._data = data;
    this.id = String(data["id"]);
    this._apiUrl = apiUrl;
    this._headers = headers;
    this._fetch = fetchFn;
  }

  get name(): string { return String(this._data["name"] ?? ""); }
  get path(): string { return String(this._data["path"] ?? ""); }

  on(event: string | string[], callback: (...args: unknown[]) => void): this {
    const events = Array.isArray(event) ? event : [event];
    for (const e of events) this._callbacks.push([e, callback]);
    return this;
  }

  private _fireEvent(eventName: string, ...args: unknown[]): void {
    for (const [pattern, cb] of this._callbacks) {
      if (matchPattern(pattern, eventName)) {
        try { cb(...args); } catch { /* ignore */ }
      }
    }
  }

  async upload(
    source: string | Uint8Array<ArrayBuffer> | ArrayBuffer | File,
    options?: { filename?: string; onConflict?: "fail" | "replace" },
  ): Promise<this> {
    const filename = options?.filename;
    const onConflict = options?.onConflict ?? "fail";
    const { "Content-Type": _ct, ...headersWithoutCt } = this._headers;

    if (typeof source !== "string") {
      const formData = new FormData();
      if (typeof File !== "undefined" && source instanceof File) {
        formData.append("file", source, filename ?? source.name);
      } else {
        if (!filename) throw new Error("filename is required when uploading bytes");
        formData.append("file", new Blob([source]), filename);
      }
      formData.append("on_conflict", onConflict);
      const res = await this._fetch(
        `${this._apiUrl}/api/folders/${this.id}/documents`,
        { method: "POST", headers: headersWithoutCt, body: formData },
      );
      await assertOk(res);
      this._fireEvent("folder.document.uploaded", await res.json());
      return this;
    }

    const { stat, readdir, readFile } = await import("fs/promises");
    const { join, basename } = await import("path");
    const info = await stat(source);
    let filePaths: string[];
    if (info.isDirectory()) {
      const entries = await readdir(source);
      const candidates = entries.filter(e => !e.startsWith(".")).map(e => join(source, e));
      const stats = await Promise.all(candidates.map(p => stat(p)));
      filePaths = candidates.filter((_, i) => stats[i]!.isFile());
    } else {
      filePaths = [source];
    }

    for (const fp of filePaths) {
      const formData = new FormData();
      const data = await readFile(fp);
      formData.append("file", new Blob([data]), basename(fp));
      formData.append("on_conflict", onConflict);
      const res = await this._fetch(
        `${this._apiUrl}/api/folders/${this.id}/documents`,
        { method: "POST", headers: headersWithoutCt, body: formData },
      );
      await assertOk(res);
      this._fireEvent("folder.document.uploaded", await res.json());
    }
    return this;
  }

  async documents(limit = 100, offset = 0): Promise<unknown[]> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const res = await this._fetch(
      `${this._apiUrl}/api/folders/${this.id}/documents?${params}`,
      { headers: this._headers },
    );
    await assertOk(res);
    const data = await res.json() as { items?: unknown[] };
    return data.items ?? (data as unknown as unknown[]);
  }

  async addSift(sift: SiftHandle): Promise<FolderHandle> {
    const res = await this._fetch(
      `${this._apiUrl}/api/folders/${this.id}/extractors`,
      {
        method: "POST",
        headers: { ...this._headers, "Content-Type": "application/json" },
        body: JSON.stringify({ sift_id: sift.id }),
      },
    );
    await assertOk(res);
    return this;
  }

  async removeSift(sift: SiftHandle): Promise<FolderHandle> {
    const res = await this._fetch(
      `${this._apiUrl}/api/folders/${this.id}/extractors/${sift.id}`,
      { method: "DELETE", headers: this._headers },
    );
    await assertOk(res);
    return this;
  }

  async sifts(limit = 100, offset = 0): Promise<{ total: number; items: unknown[] }> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const res = await this._fetch(
      `${this._apiUrl}/api/folders/${this.id}/extractors?${params}`,
      { headers: this._headers },
    );
    await assertOk(res);
    const data = await res.json();
    if (Array.isArray(data)) return { total: data.length, items: data };
    return { total: (data as { total?: number }).total ?? 0, items: (data as { items?: unknown[] }).items ?? [] };
  }

  async update(fields: { name?: string; description?: string }): Promise<FolderHandle> {
    const res = await this._fetch(
      `${this._apiUrl}/api/folders/${this.id}`,
      {
        method: "PATCH",
        headers: { ...this._headers, "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      },
    );
    await assertOk(res);
    this._data = await res.json() as Record<string, unknown>;
    return this;
  }

  async delete(): Promise<void> {
    const res = await this._fetch(
      `${this._apiUrl}/api/folders/${this.id}`,
      { method: "DELETE", headers: this._headers },
    );
    await assertOk(res);
  }
}
