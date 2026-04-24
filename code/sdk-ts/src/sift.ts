import { assertOk } from "./errors.js";
import type {
  Citation,
  FilterDict,
  SchemaResponse,
  SiftPage,
  SiftRecord,
  SortSpec,
} from "./types.js";

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

export class SiftHandle {
  readonly id: string;
  private _data: Record<string, unknown>;
  private readonly _apiUrl: string;
  readonly _headers: Record<string, string>;
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
  get status(): string { return String(this._data["status"] ?? ""); }
  get defaultFolderId(): string | null {
    const v = this._data["default_folder_id"];
    return v == null ? null : String(v);
  }

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
        formData.append("files", source, filename ?? source.name);
      } else {
        if (!filename) throw new Error("filename is required when uploading bytes");
        formData.append("files", new Blob([source]), filename);
      }
      formData.append("on_conflict", onConflict);
      const res = await this._fetch(
        `${this._apiUrl}/api/sifts/${this.id}/upload`,
        { method: "POST", headers: headersWithoutCt, body: formData },
      );
      await assertOk(res);
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

    const formData = new FormData();
    for (const fp of filePaths) {
      const data = await readFile(fp);
      formData.append("files", new Blob([data]), basename(fp));
    }
    formData.append("on_conflict", onConflict);
    const res = await this._fetch(
      `${this._apiUrl}/api/sifts/${this.id}/upload`,
      { method: "POST", headers: headersWithoutCt, body: formData },
    );
    await assertOk(res);
    return this;
  }

  async wait(options?: { pollInterval?: number; timeout?: number }): Promise<this> {
    const pollMs = (options?.pollInterval ?? 2) * 1000;
    const timeoutMs = (options?.timeout ?? 300) * 1000;
    const start = Date.now();
    const seenDone = new Set<string>();

    while (true) {
      const res = await this._fetch(`${this._apiUrl}/api/sifts/${this.id}`, {
        headers: this._headers,
      });
      await assertOk(res);
      this._data = await res.json() as Record<string, unknown>;
      const status = String(this._data["status"] ?? "");

      if (this._callbacks.length > 0) {
        await this._fireDocumentCallbacks(seenDone);
      }

      if (status !== "indexing") {
        if (status === "active") this._fireEvent("sift.completed", this.id);
        else if (status === "error") this._fireEvent("sift.error", this.id, this._data["error"]);
        return this;
      }

      if (Date.now() - start > timeoutMs) throw new Error(`Sift did not complete within ${timeoutMs / 1000}s`);
      await new Promise(r => setTimeout(r, pollMs));
    }
  }

  private async _fireDocumentCallbacks(seenDone: Set<string>): Promise<void> {
    try {
      const res = await this._fetch(`${this._apiUrl}/api/sifts/${this.id}/records`, {
        headers: this._headers,
      });
      if (!res.ok) return;
      const data = await res.json() as { items?: Array<Record<string, unknown>> };
      const records: Array<Record<string, unknown>> = data.items ?? (data as unknown as Array<Record<string, unknown>>);
      for (const record of records) {
        const docId = String(record["document_id"] ?? record["id"] ?? "");
        if (docId && !seenDone.has(docId)) {
          seenDone.add(docId);
          this._fireEvent("sift.document.processed", docId, record);
        }
      }
    } catch { /* ignore */ }
  }

  async *iterRecords<T = SiftRecord>(): AsyncGenerator<T> {
    let cursor: string | null = null;
    let offset = 0;
    while (true) {
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("cursor", cursor);
      else params.set("offset", String(offset));
      const res = await this._fetch(`${this._apiUrl}/api/sifts/${this.id}/records?${params}`, {
        headers: this._headers,
      });
      await assertOk(res);
      const data = await res.json() as { items: T[]; total?: number; next_cursor?: string | null };
      const items = data.items ?? [];
      yield* items;
      cursor = data.next_cursor ?? null;
      if (cursor) continue;
      offset += items.length;
      if (!items.length || offset >= (data.total ?? 0)) break;
    }
  }

  async records<T = SiftRecord>(options?: { limit?: number; offset?: number; cursor?: string }): Promise<T[]> {
    const params = new URLSearchParams();
    if (options?.cursor) params.set("cursor", options.cursor);
    else if (options?.offset != null) params.set("offset", String(options.offset));
    if (options?.limit != null) params.set("limit", String(options.limit));

    const res = await this._fetch(
      `${this._apiUrl}/api/sifts/${this.id}/records?${params}`,
      { headers: this._headers },
    );
    await assertOk(res);
    const data = await res.json() as { items: T[] };
    return data.items;
  }

  async find<T = SiftRecord>(options?: {
    filter?: FilterDict;
    sort?: SortSpec;
    limit?: number;
    cursor?: string;
    project?: Record<string, unknown>;
  }): Promise<SiftPage<T>> {
    const params = new URLSearchParams();
    if (options?.filter) params.set("filter", JSON.stringify(options.filter));
    if (options?.sort) params.set("sort", JSON.stringify(options.sort));
    if (options?.cursor) params.set("cursor", options.cursor);
    if (options?.limit != null) params.set("limit", String(options.limit));
    if (options?.project) params.set("project", JSON.stringify(options.project));

    const res = await this._fetch(
      `${this._apiUrl}/api/sifts/${this.id}/records?${params}`,
      { headers: this._headers },
    );
    await assertOk(res);
    const data = await res.json() as { items: T[]; next_cursor: string | null };
    return { records: data.items, next_cursor: data.next_cursor };
  }

  async aggregate(pipeline: object[]): Promise<unknown[]> {
    const res = await this._fetch(
      `${this._apiUrl}/api/sifts/${this.id}/aggregate`,
      {
        method: "POST",
        headers: { ...this._headers, "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline }),
      },
    );
    await assertOk(res);
    const data = await res.json() as { results: unknown[] };
    return data.results;
  }

  async recordsCount(filter?: FilterDict): Promise<number> {
    const params = new URLSearchParams();
    if (filter) params.set("filter", JSON.stringify(filter));
    const res = await this._fetch(
      `${this._apiUrl}/api/sifts/${this.id}/records/count?${params}`,
      { headers: this._headers },
    );
    await assertOk(res);
    const data = await res.json() as { count: number };
    return data.count;
  }

  async recordsByIds(ids: string[]): Promise<SiftRecord[]> {
    const res = await this._fetch(
      `${this._apiUrl}/api/sifts/${this.id}/records/batch`,
      {
        method: "POST",
        headers: { ...this._headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      },
    );
    await assertOk(res);
    const data = await res.json() as { items: SiftRecord[] };
    return data.items;
  }

  async extract(documentId: string): Promise<{ task_id: string; status: string }> {
    const res = await this._fetch(
      `${this._apiUrl}/api/sifts/${this.id}/extract`,
      {
        method: "POST",
        headers: { ...this._headers, "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: documentId }),
      },
    );
    await assertOk(res);
    return res.json();
  }

  async extractionStatus(documentId: string): Promise<string> {
    const params = new URLSearchParams({ document_id: documentId });
    const res = await this._fetch(
      `${this._apiUrl}/api/sifts/${this.id}/extraction-status?${params}`,
      { headers: this._headers },
    );
    await assertOk(res);
    const data = await res.json() as { status: string };
    return data.status;
  }

  async chat(message: string): Promise<string> {
    const res = await this._fetch(
      `${this._apiUrl}/api/sifts/${this.id}/chat`,
      {
        method: "POST",
        headers: { ...this._headers, "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      },
    );
    await assertOk(res);
    const data = await res.json() as { message?: string; response?: string };
    return data.message ?? data.response ?? "";
  }

  async query(naturalLanguage: string, execute = true): Promise<{ pipeline: unknown[]; results: unknown[] | null }> {
    const res = await this._fetch(
      `${this._apiUrl}/api/sifts/${this.id}/query`,
      {
        method: "POST",
        headers: { ...this._headers, "Content-Type": "application/json" },
        body: JSON.stringify({ query: naturalLanguage, execute }),
      },
    );
    await assertOk(res);
    return res.json();
  }

  async schema(): Promise<SchemaResponse> {
    const res = await this._fetch(
      `${this._apiUrl}/api/sifts/${this.id}/schema`,
      { headers: this._headers },
    );
    await assertOk(res);
    return res.json();
  }

  async update(fields: { name?: string; instructions?: string }): Promise<SiftHandle> {
    const res = await this._fetch(
      `${this._apiUrl}/api/sifts/${this.id}`,
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
      `${this._apiUrl}/api/sifts/${this.id}`,
      { method: "DELETE", headers: this._headers },
    );
    await assertOk(res);
  }

  async exportCsv(outputPath?: string): Promise<string> {
    const res = await this._fetch(
      `${this._apiUrl}/api/sifts/${this.id}/records/csv`,
      { headers: this._headers },
    );
    await assertOk(res);
    const csv = await res.text();
    if (outputPath) {
      const { writeFile } = await import("fs/promises");
      await writeFile(outputPath, csv, "utf-8");
    }
    return csv;
  }

  record(recordId: string): RecordHandle {
    return new RecordHandle(recordId, this.id, this._apiUrl, this._headers, this._fetch);
  }
}

export class RecordHandle {
  constructor(
    private readonly _recordId: string,
    private readonly _siftId: string,
    private readonly _apiUrl: string,
    private readonly _headers: Record<string, string>,
    private readonly _fetch: typeof fetch,
  ) {}

  async citations(): Promise<Record<string, Citation>> {
    const res = await this._fetch(
      `${this._apiUrl}/api/sifts/${this._siftId}/records/${this._recordId}/citations`,
      { headers: this._headers },
    );
    await assertOk(res);
    return res.json();
  }
}
