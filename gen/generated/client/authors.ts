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

  private async okOrThrow(res: Response, action: string) {
    if (!res.ok) {
      let detail = "";
      try { detail = await res.text(); } catch {}
      throw new Error(`${action} authors failed: ${res.status} ${detail}`);
    }
  }

  async create(data: InsertAuthors): Promise<SelectAuthors> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/authors`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(data),
    });
    await this.okOrThrow(res, "create");
    return (await res.json()) as SelectAuthors;
  }

  async getByPk(pk: string): Promise<SelectAuthors | null> {
    const path = pk;
    const res = await this.fetchFn(`${this.baseUrl}/v1/authors/${path}`, {
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    await this.okOrThrow(res, "get");
    return (await res.json()) as SelectAuthors;
  }

  async list(params?: { include?: AuthorsIncludeSpec; limit?: number; offset?: number }): Promise<SelectAuthors[]> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/authors/list`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(params ?? {}),
    });
    await this.okOrThrow(res, "list");
    return (await res.json()) as SelectAuthors[];
  }

  async update(pk: string, patch: UpdateAuthors): Promise<SelectAuthors | null> {
    const path = pk;
    const res = await this.fetchFn(`${this.baseUrl}/v1/authors/${path}`, {
      method: "PATCH",
      headers: await this.headers(true),
      body: JSON.stringify(patch),
    });
    if (res.status === 404) return null;
    await this.okOrThrow(res, "update");
    return (await res.json()) as SelectAuthors;
  }

  async delete(pk: string): Promise<SelectAuthors | null> {
    const path = pk;
    const res = await this.fetchFn(`${this.baseUrl}/v1/authors/${path}`, {
      method: "DELETE",
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    await this.okOrThrow(res, "delete");
    return (await res.json()) as SelectAuthors;
  }
}
