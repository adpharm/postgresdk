/* Generated. Do not edit. */
import type { AuthorsIncludeSpec } from "./include-spec";
import type { InsertAuthors, UpdateAuthors, SelectAuthors } from "./types/authors";

export class AuthorsClient {
  constructor(
    private baseUrl: string,
    private fetchFn: typeof fetch = fetch,
    private auth?: () => Promise<Record<string,string>>
  ) {}

  private async headers(json = false) {
    const extra = (await this.auth?.()) ?? {};
    return json ? { "Content-Type": "application/json", ...extra } : extra;
  }

  async create(data: InsertAuthors): Promise<SelectAuthors> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/authors`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`create authors failed: ${res.status}`);
    return res.json();
  }

  async getByPk(pk: string): Promise<SelectAuthors | null> {
    const path = pk;
    const res = await this.fetchFn(`${this.baseUrl}/v1/authors/${path}`, {
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`get authors failed: ${res.status}`);
    return res.json();
  }

  async list(params?: { include?: AuthorsIncludeSpec; limit?: number; offset?: number }): Promise<SelectAuthors[]> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/authors/list`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(params ?? {}),
    });
    if (!res.ok) throw new Error(`list authors failed: ${res.status}`);
    return res.json();
  }

  async update(pk: string, patch: UpdateAuthors): Promise<SelectAuthors | null> {
    const path = pk;
    const res = await this.fetchFn(`${this.baseUrl}/v1/authors/${path}`, {
      method: "PATCH",
      headers: await this.headers(true),
      body: JSON.stringify(patch),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`update authors failed: ${res.status}`);
    return res.json();
  }

  async delete(pk: string): Promise<SelectAuthors | null> {
    const path = pk;
    const res = await this.fetchFn(`${this.baseUrl}/v1/authors/${path}`, {
      method: "DELETE",
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`delete authors failed: ${res.status}`);
    return res.json();
  }
}
