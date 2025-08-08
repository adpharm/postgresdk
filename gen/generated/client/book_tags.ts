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

  async create(data: InsertBookTags): Promise<SelectBookTags> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/book_tags`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`create book_tags failed: ${res.status}`);
    return res.json();
  }

  async getByPk(pk: { book_id: string; tag_id: string }): Promise<SelectBookTags | null> {
    const path = pk.book_id + "/" + pk.tag_id;
    const res = await this.fetchFn(`${this.baseUrl}/v1/book_tags/${path}`, {
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`get book_tags failed: ${res.status}`);
    return res.json();
  }

  async list(params?: { include?: BookTagsIncludeSpec; limit?: number; offset?: number }): Promise<SelectBookTags[]> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/book_tags/list`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(params ?? {}),
    });
    if (!res.ok) throw new Error(`list book_tags failed: ${res.status}`);
    return res.json();
  }

  async update(pk: { book_id: string; tag_id: string }, patch: UpdateBookTags): Promise<SelectBookTags | null> {
    const path = pk.book_id + "/" + pk.tag_id;
    const res = await this.fetchFn(`${this.baseUrl}/v1/book_tags/${path}`, {
      method: "PATCH",
      headers: await this.headers(true),
      body: JSON.stringify(patch),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`update book_tags failed: ${res.status}`);
    return res.json();
  }

  async delete(pk: { book_id: string; tag_id: string }): Promise<SelectBookTags | null> {
    const path = pk.book_id + "/" + pk.tag_id;
    const res = await this.fetchFn(`${this.baseUrl}/v1/book_tags/${path}`, {
      method: "DELETE",
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`delete book_tags failed: ${res.status}`);
    return res.json();
  }
}
