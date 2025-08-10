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
import { BaseClient } from "./base-client";
import type { ${Type}IncludeSpec } from "./include-spec";
import type { Insert${Type}, Update${Type}, Select${Type} } from "./types/${table.name}";

/**
 * Client for ${table.name} table operations
 */
export class ${Type}Client extends BaseClient {
  private readonly resource = "/v1/${table.name}";

  async create(data: Insert${Type}): Promise<Select${Type}> {
    return this.post<Select${Type}>(this.resource, data);
  }

  async getByPk(pk: ${pkType}): Promise<Select${Type} | null> {
    const path = ${pkPathExpr};
    return this.get<Select${Type} | null>(\`\${this.resource}/\${path}\`);
  }

  async list(params?: { 
    include?: ${Type}IncludeSpec; 
    limit?: number; 
    offset?: number;
    where?: any;
    orderBy?: string;
    order?: "asc" | "desc";
  }): Promise<Select${Type}[]> {
    return this.post<Select${Type}[]>(\`\${this.resource}/list\`, params ?? {});
  }

  async update(pk: ${pkType}, patch: Update${Type}): Promise<Select${Type} | null> {
    const path = ${pkPathExpr};
    return this.patch<Select${Type} | null>(\`\${this.resource}/\${path}\`, patch);
  }

  async delete(pk: ${pkType}): Promise<Select${Type} | null> {
    const path = ${pkPathExpr};
    return this.del<Select${Type} | null>(\`\${this.resource}/\${path}\`);
  }
}
`;
}

export function emitClientIndex(tables: Table[]) {
  let out = `/* Generated. Do not edit. */\n`;
  
  // Import BaseClient and its types
  out += `import { BaseClient, type AuthConfig } from "./base-client";\n`;
  
  // Import all table clients
  for (const t of tables) {
    out += `import { ${pascal(t.name)}Client } from "./${t.name}";\n`;
  }
  
  // Re-export auth types for backward compatibility
  out += `\n// Re-export auth types for convenience\n`;
  out += `export type { AuthConfig as SDKAuth, AuthConfig, HeaderMap, AuthHeadersProvider } from "./base-client";\n\n`;

  // SDK class
  out += `/**\n`;
  out += ` * Main SDK class that provides access to all table clients\n`;
  out += ` */\n`;
  out += `export class SDK {\n`;
  for (const t of tables) {
    out += `  public ${t.name}: ${pascal(t.name)}Client;\n`;
  }
  out += `\n  constructor(cfg: { baseUrl: string; fetch?: typeof fetch; auth?: AuthConfig }) {\n`;
  out += `    const f = cfg.fetch ?? fetch;\n`;
  for (const t of tables) {
    out += `    this.${t.name} = new ${pascal(t.name)}Client(cfg.baseUrl, f, cfg.auth);\n`;
  }
  out += `  }\n`;
  out += `}\n\n`;
  
  // Export individual clients
  out += `// Export individual table clients\n`;
  for (const t of tables) {
    out += `export { ${pascal(t.name)}Client } from "./${t.name}";\n`;
  }
  
  // Export base client for extension
  out += `\n// Export base client for custom extensions\n`;
  out += `export { BaseClient } from "./base-client";\n`;
  
  // Export include specs
  out += `\n// Export include specifications\n`;
  out += `export * from "./include-spec";\n`;
  
  return out;
}