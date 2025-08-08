import type { Table } from "./introspect";
import { pascal } from "./utils";

export function emitClient(table: Table) {
  const Type = pascal(table.name);

  // Normalize PKs
  const pkCols: string[] = Array.isArray((table as any).pk)
    ? (table as any).pk
    : (table as any).pk
    ? [(table as any).pk]
    : [];
  const safePk = pkCols.length ? pkCols : ["id"];
  const hasCompositePk = safePk.length > 1;

  const pkType = hasCompositePk ? `{ ${safePk.map((c) => `${c}: string`).join("; ")} }` : `string`;

  const pkPathExpr = hasCompositePk ? safePk.map((c) => `pk.${c}`).join(` + "/" + `) : `pk`;

  return `/* Generated. Do not edit. */
import type { ${Type}IncludeSpec } from "./include-spec";
import type { Insert${Type}, Update${Type}, Select${Type} } from "./types/${table.name}";

type HeaderMap = Record<string, string>;
type AuthHeadersProvider = () => Promise<HeaderMap> | HeaderMap;

type AuthConfig =
  | AuthHeadersProvider
  | {
      apiKey?: string;
      /** defaults to "x-api-key" */
      apiKeyHeader?: string;
      /** static token or async provider returning a token */
      jwt?: string | (() => Promise<string>);
      /** extra headers, static or async */
      headers?: AuthHeadersProvider;
    };

export class ${Type}Client {
  constructor(
    private baseUrl: string,
    private fetchFn: typeof fetch = fetch,
    private auth?: AuthConfig
  ) {}

  private async authHeaders(): Promise<HeaderMap> {
    if (!this.auth) return {};
    if (typeof this.auth === "function") {
      const h = await this.auth();
      return h ?? {};
    }
    const out: HeaderMap = {};

    if (this.auth.apiKey) {
      const header = this.auth.apiKeyHeader ?? "x-api-key";
      out[header] = this.auth.apiKey;
    }

    if (this.auth.jwt) {
      const token = typeof this.auth.jwt === "function" ? await this.auth.jwt() : this.auth.jwt;
      if (token) out["authorization"] = \`Bearer \${token}\`;
    }

    if (this.auth.headers) {
      const extra = typeof this.auth.headers === "function" ? await this.auth.headers() : this.auth.headers;
      Object.assign(out, extra ?? {});
    }

    return out;
  }

  private async headers(json = false) {
    const extra = await this.authHeaders();
    return json ? { "Content-Type": "application/json", ...extra } : extra;
  }

  private async okOrThrow(res: Response, action: string) {
    if (!res.ok) {
      let detail = "";
      try { detail = await res.text(); } catch {}
      throw new Error(\`\${action} ${table.name} failed: \${res.status} \${detail}\`);
    }
  }

  async create(data: Insert${Type}): Promise<Select${Type}> {
    const res = await this.fetchFn(\`\${this.baseUrl}/v1/${table.name}\`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(data),
    });
    await this.okOrThrow(res, "create");
    return (await res.json()) as Select${Type};
  }

  async getByPk(pk: ${pkType}): Promise<Select${Type} | null> {
    const path = ${pkPathExpr};
    const res = await this.fetchFn(\`\${this.baseUrl}/v1/${table.name}/\${path}\`, {
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    await this.okOrThrow(res, "get");
    return (await res.json()) as Select${Type};
  }

  async list(params?: { include?: ${Type}IncludeSpec; limit?: number; offset?: number }): Promise<Select${Type}[]> {
    const res = await this.fetchFn(\`\${this.baseUrl}/v1/${table.name}/list\`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(params ?? {}),
    });
    await this.okOrThrow(res, "list");
    return (await res.json()) as Select${Type}[];
  }

  async update(pk: ${pkType}, patch: Update${Type}): Promise<Select${Type} | null> {
    const path = ${pkPathExpr};
    const res = await this.fetchFn(\`\${this.baseUrl}/v1/${table.name}/\${path}\`, {
      method: "PATCH",
      headers: await this.headers(true),
      body: JSON.stringify(patch),
    });
    if (res.status === 404) return null;
    await this.okOrThrow(res, "update");
    return (await res.json()) as Select${Type};
  }

  async delete(pk: ${pkType}): Promise<Select${Type} | null> {
    const path = ${pkPathExpr};
    const res = await this.fetchFn(\`\${this.baseUrl}/v1/${table.name}/\${path}\`, {
      method: "DELETE",
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    await this.okOrThrow(res, "delete");
    return (await res.json()) as Select${Type};
  }
}
`;
}

export function emitClientIndex(tables: Table[]) {
  let out = `/* Generated. Do not edit. */\n`;
  for (const t of tables) {
    out += `import { ${pascal(t.name)}Client } from "./${t.name}";\n`;
  }
  out += `\nexport type SDKAuthHeadersProvider = () => Promise<Record<string,string>> | Record<string,string>;\n`;
  out += `export type SDKAuth =\n`;
  out += `  | SDKAuthHeadersProvider\n`;
  out += `  | {\n`;
  out += `      apiKey?: string;\n`;
  out += `      /** defaults to "x-api-key" */\n`;
  out += `      apiKeyHeader?: string;\n`;
  out += `      jwt?: string | (() => Promise<string>);\n`;
  out += `      headers?: SDKAuthHeadersProvider;\n`;
  out += `    };\n\n`;

  out += `export class SDK {\n`;
  for (const t of tables) {
    out += `  public ${t.name}: ${pascal(t.name)}Client;\n`;
  }
  out += `\n  constructor(cfg: { baseUrl: string; fetch?: typeof fetch; auth?: SDKAuth }) {\n`;
  out += `    const f = cfg.fetch ?? fetch;\n`;
  for (const t of tables) {
    out += `    this.${t.name} = new ${pascal(t.name)}Client(cfg.baseUrl, f, cfg.auth);\n`;
  }
  out += `  }\n`;
  out += `}\n`;
  for (const t of tables) out += `export { ${pascal(t.name)}Client } from "./${t.name}";\n`;
  out += `export * from "./include-spec";\n`;
  return out;
}
