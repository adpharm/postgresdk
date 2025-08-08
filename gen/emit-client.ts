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

export class ${Type}Client {
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
  out += `\nexport class SDK {\n`;
  for (const t of tables) {
    out += `  public ${t.name}: ${pascal(t.name)}Client;\n`;
  }
  out += `\n  constructor(cfg: { baseUrl: string; fetch?: typeof fetch; auth?: () => Promise<Record<string,string>> }) {\n`;
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
