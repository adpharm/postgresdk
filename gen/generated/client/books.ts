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

  private async okOrThrow(res: Response, action: string) {
    if (!res.ok) {
      let detail = "";
      try { detail = await res.text(); } catch {}
      throw new Error(`${action} books failed: ${res.status} ${detail}`);
    }
  }

  async create(data: InsertBooks): Promise<SelectBooks> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/books`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(data),
    });
    await this.okOrThrow(res, "create");
    return (await res.json()) as SelectBooks;
  }

  async getByPk(pk: string): Promise<SelectBooks | null> {
    const path = pk;
    const res = await this.fetchFn(`${this.baseUrl}/v1/books/${path}`, {
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    await this.okOrThrow(res, "get");
    return (await res.json()) as SelectBooks;
  }

  async list(params?: { include?: BooksIncludeSpec; limit?: number; offset?: number }): Promise<SelectBooks[]> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/books/list`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(params ?? {}),
    });
    await this.okOrThrow(res, "list");
    return (await res.json()) as SelectBooks[];
  }

  async update(pk: string, patch: UpdateBooks): Promise<SelectBooks | null> {
    const path = pk;
    const res = await this.fetchFn(`${this.baseUrl}/v1/books/${path}`, {
      method: "PATCH",
      headers: await this.headers(true),
      body: JSON.stringify(patch),
    });
    if (res.status === 404) return null;
    await this.okOrThrow(res, "update");
    return (await res.json()) as SelectBooks;
  }

  async delete(pk: string): Promise<SelectBooks | null> {
    const path = pk;
    const res = await this.fetchFn(`${this.baseUrl}/v1/books/${path}`, {
      method: "DELETE",
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    await this.okOrThrow(res, "delete");
    return (await res.json()) as SelectBooks;
  }
}
