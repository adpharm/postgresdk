/* Generated. Do not edit. */
import type { BooksIncludeSpec } from "./include-spec";
import type { InsertBooks, UpdateBooks, SelectBooks } from "./types/books";

export class BooksClient {
  constructor(
    private baseUrl: string,
    private fetchFn: typeof fetch = fetch,
    private auth?: () => Promise<Record<string,string>>
  ) {}

  private async headers(json = false) {
    const extra = (await this.auth?.()) ?? {};
    return json ? { "Content-Type": "application/json", ...extra } : extra;
  }

  async create(data: InsertBooks): Promise<SelectBooks> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/books`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`create books failed: ${res.status}`);
    return res.json();
  }

  async getByPk(pk: string): Promise<SelectBooks | null> {
    const path = pk;
    const res = await this.fetchFn(`${this.baseUrl}/v1/books/${path}`, {
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`get books failed: ${res.status}`);
    return res.json();
  }

  async list(params?: { include?: BooksIncludeSpec; limit?: number; offset?: number }): Promise<SelectBooks[]> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/books/list`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(params ?? {}),
    });
    if (!res.ok) throw new Error(`list books failed: ${res.status}`);
    return res.json();
  }

  async update(pk: string, patch: UpdateBooks): Promise<SelectBooks | null> {
    const path = pk;
    const res = await this.fetchFn(`${this.baseUrl}/v1/books/${path}`, {
      method: "PATCH",
      headers: await this.headers(true),
      body: JSON.stringify(patch),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`update books failed: ${res.status}`);
    return res.json();
  }

  async delete(pk: string): Promise<SelectBooks | null> {
    const path = pk;
    const res = await this.fetchFn(`${this.baseUrl}/v1/books/${path}`, {
      method: "DELETE",
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`delete books failed: ${res.status}`);
    return res.json();
  }
}
