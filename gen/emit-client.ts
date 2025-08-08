import type { Table } from "./introspect";
import { pascal } from "./utils";

export function emitClient(table: Table) {
  const Type = pascal(table.name);
  const pkCols = table.pk;
  const hasCompositePk = pkCols.length > 1;

  const pkType = hasCompositePk ? `{ ${pkCols.map((c) => `${c}: string`).join("; ")} }` : `string`;

  const pkPathExpr = hasCompositePk ? pkCols.map((c) => `pk.${c}`).join(` + "/" + `) : `pk`;

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

  async create(data: Insert${Type}): Promise<Select${Type}> {
    const res = await this.fetchFn(\`\${this.baseUrl}/v1/${table.name}\`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(\`create ${table.name} failed: \${res.status}\`);
    return (await res.json()) as Select${Type};
  }

  async getByPk(pk: ${pkType}): Promise<Select${Type} | null> {
    const path = ${pkPathExpr};
    const res = await this.fetchFn(\`\${this.baseUrl}/v1/${table.name}/\${path}\`, {
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(\`get ${table.name} failed: \${res.status}\`);
    return (await res.json()) as Select${Type};
  }

  async list(params?: { include?: ${Type}IncludeSpec; limit?: number; offset?: number }): Promise<Select${Type}[]> {
    const res = await this.fetchFn(\`\${this.baseUrl}/v1/${table.name}/list\`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(params ?? {}),
    });
    if (!res.ok) throw new Error(\`list ${table.name} failed: \${res.status}\`);
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
    if (!res.ok) throw new Error(\`update ${table.name} failed: \${res.status}\`);
    return (await res.json()) as Select${Type};
  }

  async delete(pk: ${pkType}): Promise<Select${Type} | null> {
    const path = ${pkPathExpr};
    const res = await this.fetchFn(\`\${this.baseUrl}/v1/${table.name}/\${path}\`, {
      method: "DELETE",
      headers: await this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(\`delete ${table.name} failed: \${res.status}\`);
    return (await res.json()) as Select${Type};
  }
}
`;
}

export function emitClientIndex(tables: Table[]) {
  let out = `/* Generated. Do not edit. */\n`;
  // We must IMPORT to reference the classes, re-export later if you want
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
  // optional: re-exports
  for (const t of tables) out += `export { ${pascal(t.name)}Client } from "./${t.name}";\n`;
  out += `export * from "./include-spec";\n`;
  return out;
}
