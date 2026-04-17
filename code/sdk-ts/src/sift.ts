import { assertOk } from "./errors.js";
import type {
  FilterDict,
  SchemaResponse,
  SiftPage,
  SiftRecord,
  SortSpec,
} from "./types.js";

export class SiftHandle {
  readonly id: string;
  private _data: Record<string, unknown>;
  private readonly _apiUrl: string;
  private readonly _headers: Record<string, string>;
  private readonly _fetch: typeof globalThis.fetch;

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

  async exportCsv(): Promise<string> {
    const res = await this._fetch(
      `${this._apiUrl}/api/sifts/${this.id}/records/csv`,
      { headers: this._headers },
    );
    await assertOk(res);
    return res.text();
  }
}
