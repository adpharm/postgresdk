/* Generated. Do not edit. */
import type { BookTagsIncludeSpec } from "./include-spec";
import type { InsertBookTags, UpdateBookTags, SelectBookTags } from "./types/book_tags";

export class BookTagsClient {
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
      throw new Error(`${action} book_tags failed: ${res.status} ${detail}`);
    }
  }

  async create(data: InsertBookTags): Promise<SelectBookTags> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/book_tags`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(data),
    });
    await this.okOrThrow(res, "create");
    return (await res.json()) as SelectBookTags;
  }

  async getByPk(pk: { book_id: string; tag_id: string }): Promise<SelectBookTags | null> {
    const path = pk.book_id + "/" + pk.tag_id;
    const res = await this.fetchFn(`${this.baseUrl}/v1/book_tags/${path}`, {
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    await this.okOrThrow(res, "get");
    return (await res.json()) as SelectBookTags;
  }

  async list(params?: { include?: BookTagsIncludeSpec; limit?: number; offset?: number }): Promise<SelectBookTags[]> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/book_tags/list`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(params ?? {}),
    });
    await this.okOrThrow(res, "list");
    return (await res.json()) as SelectBookTags[];
  }

  async update(pk: { book_id: string; tag_id: string }, patch: UpdateBookTags): Promise<SelectBookTags | null> {
    const path = pk.book_id + "/" + pk.tag_id;
    const res = await this.fetchFn(`${this.baseUrl}/v1/book_tags/${path}`, {
      method: "PATCH",
      headers: await this.headers(true),
      body: JSON.stringify(patch),
    });
    if (res.status === 404) return null;
    await this.okOrThrow(res, "update");
    return (await res.json()) as SelectBookTags;
  }

  async delete(pk: { book_id: string; tag_id: string }): Promise<SelectBookTags | null> {
    const path = pk.book_id + "/" + pk.tag_id;
    const res = await this.fetchFn(`${this.baseUrl}/v1/book_tags/${path}`, {
      method: "DELETE",
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    await this.okOrThrow(res, "delete");
    return (await res.json()) as SelectBookTags;
  }
}
