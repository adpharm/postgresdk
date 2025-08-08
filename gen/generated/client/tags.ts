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

  private async okOrThrow(res: Response, action: string) {
    if (!res.ok) {
      let detail = "";
      try { detail = await res.text(); } catch {}
      throw new Error(`${action} tags failed: ${res.status} ${detail}`);
    }
  }

  async create(data: InsertTags): Promise<SelectTags> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/tags`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(data),
    });
    await this.okOrThrow(res, "create");
    return (await res.json()) as SelectTags;
  }

  async getByPk(pk: string): Promise<SelectTags | null> {
    const path = pk;
    const res = await this.fetchFn(`${this.baseUrl}/v1/tags/${path}`, {
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    await this.okOrThrow(res, "get");
    return (await res.json()) as SelectTags;
  }

  async list(params?: { include?: TagsIncludeSpec; limit?: number; offset?: number }): Promise<SelectTags[]> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/tags/list`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(params ?? {}),
    });
    await this.okOrThrow(res, "list");
    return (await res.json()) as SelectTags[];
  }

  async update(pk: string, patch: UpdateTags): Promise<SelectTags | null> {
    const path = pk;
    const res = await this.fetchFn(`${this.baseUrl}/v1/tags/${path}`, {
      method: "PATCH",
      headers: await this.headers(true),
      body: JSON.stringify(patch),
    });
    if (res.status === 404) return null;
    await this.okOrThrow(res, "update");
    return (await res.json()) as SelectTags;
  }

  async delete(pk: string): Promise<SelectTags | null> {
    const path = pk;
    const res = await this.fetchFn(`${this.baseUrl}/v1/tags/${path}`, {
      method: "DELETE",
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    await this.okOrThrow(res, "delete");
    return (await res.json()) as SelectTags;
  }
}
