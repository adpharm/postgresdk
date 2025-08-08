/* Generated. Do not edit. */
import type { TagsIncludeSpec } from "./include-spec";
import type { InsertTags, UpdateTags, SelectTags } from "./types/tags";

export class TagsClient {
  constructor(
    private baseUrl: string,
    private fetchFn: typeof fetch = fetch,
    private auth?: () => Promise<Record<string,string>>
  ) {}

  private async headers(json = false) {
    const extra = (await this.auth?.()) ?? {};
    return json ? { "Content-Type": "application/json", ...extra } : extra;
  }

  async create(data: InsertTags): Promise<SelectTags> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/tags`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`create tags failed: ${res.status}`);
    return res.json();
  }

  async getByPk(pk: string): Promise<SelectTags | null> {
    const path = pk;
    const res = await this.fetchFn(`${this.baseUrl}/v1/tags/${path}`, {
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`get tags failed: ${res.status}`);
    return res.json();
  }

  async list(params?: { include?: TagsIncludeSpec; limit?: number; offset?: number }): Promise<SelectTags[]> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/tags/list`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(params ?? {}),
    });
    if (!res.ok) throw new Error(`list tags failed: ${res.status}`);
    return res.json();
  }

  async update(pk: string, patch: UpdateTags): Promise<SelectTags | null> {
    const path = pk;
    const res = await this.fetchFn(`${this.baseUrl}/v1/tags/${path}`, {
      method: "PATCH",
      headers: await this.headers(true),
      body: JSON.stringify(patch),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`update tags failed: ${res.status}`);
    return res.json();
  }

  async delete(pk: string): Promise<SelectTags | null> {
    const path = pk;
    const res = await this.fetchFn(`${this.baseUrl}/v1/tags/${path}`, {
      method: "DELETE",
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`delete tags failed: ${res.status}`);
    return res.json();
  }
}
