import { assertOk } from "./errors.js";
import type { FolderData } from "./types.js";
import type { SiftHandle } from "./sift.js";

export class FolderHandle {
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
  get path(): string { return String(this._data["path"] ?? ""); }

  async documents(): Promise<unknown[]> {
    const res = await this._fetch(
      `${this._apiUrl}/api/folders/${this.id}/documents`,
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

  async sifts(): Promise<unknown[]> {
    const res = await this._fetch(
      `${this._apiUrl}/api/folders/${this.id}/extractors`,
      { headers: this._headers },
    );
    await assertOk(res);
    return res.json();
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
