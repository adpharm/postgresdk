import type { Table, Model } from "./introspect";
import type { Graph } from "./rel-classify";
import { pascal } from "./utils";
import { generateIncludeMethods } from "./emit-include-methods";

export function emitClient(
  table: Table, 
  graph: Graph,
  opts: { 
    useJsExtensions?: boolean;
    includeMethodsDepth?: number;
    skipJunctionTables?: boolean;
  },
  model?: Model
) {
  const Type = pascal(table.name);
  const ext = opts.useJsExtensions ? ".js" : "";

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

  // Generate include methods
  const allTables = model ? Object.values(model.tables) : undefined;
  const includeMethods = generateIncludeMethods(table, graph, {
    maxDepth: opts.includeMethodsDepth ?? 2,
    skipJunctionTables: opts.skipJunctionTables ?? true
  }, allTables);

  // Build import for types needed by include methods
  const importedTypes = new Set<string>();
  importedTypes.add(table.name); // Always need base type
  
  for (const method of includeMethods) {
    for (const target of method.targets) {
      importedTypes.add(target);
    }
  }

  // Generate type imports - base types for this table
  const typeImports = `import type { Insert${Type}, Update${Type}, Select${Type} } from "./types/${table.name}${ext}";`;
  
  // If we have includes from other tables, we need those types too
  const otherTableImports: string[] = [];
  for (const target of Array.from(importedTypes)) {
    if (target !== table.name) {
      otherTableImports.push(`import type { Select${pascal(target)} } from "./types/${target}${ext}";`);
    }
  }

  // Generate include method implementations
  let includeMethodsCode = "";
  for (const method of includeMethods) {
    const isGetByPk = method.name.startsWith("getByPk");
    const baseParams = isGetByPk ? "" : `params?: Omit<{ limit?: number; offset?: number; where?: any; orderBy?: string; order?: "asc" | "desc"; }, "include">`;
    
    if (isGetByPk) {
      // For getByPk with includes, we use the list endpoint with a where clause
      const pkWhere = hasCompositePk 
        ? `{ ${safePk.map(col => `${col}: pk.${col}`).join(", ")} }`
        : `{ ${safePk[0] || 'id'}: pk }`;
      
      // Extract the base return type (without the "| null" part)
      const baseReturnType = method.returnType.replace(" | null", "");
      
      includeMethodsCode += `
  async ${method.name}(pk: ${pkType}): Promise<${method.returnType}> {
    const results = await this.post<${baseReturnType}[]>(\`\${this.resource}/list\`, { 
      where: ${pkWhere},
      include: ${JSON.stringify(method.includeSpec)},
      limit: 1 
    });
    return (results[0] as ${baseReturnType}) ?? null;
  }
`;
    } else {
      includeMethodsCode += `
  async ${method.name}(${baseParams}): Promise<${method.returnType}> {
    return this.post<${method.returnType}>(\`\${this.resource}/list\`, { ...params, include: ${JSON.stringify(method.includeSpec)} });
  }
`;
    }
  }

  return `/* Generated. Do not edit. */
import { BaseClient } from "./base-client${ext}";
${typeImports}
${otherTableImports.join("\n")}

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
${includeMethodsCode}}
`;
}

export function emitClientIndex(tables: Table[], useJsExtensions?: boolean) {
  const ext = useJsExtensions ? ".js" : "";
  let out = `/* Generated. Do not edit. */\n`;
  
  // Import BaseClient and its types
  out += `import { BaseClient, type AuthConfig } from "./base-client${ext}";\n`;
  
  // Import all table clients
  for (const t of tables) {
    out += `import { ${pascal(t.name)}Client } from "./${t.name}${ext}";\n`;
  }
  
  // Export auth types
  out += `\nexport type { AuthConfig, HeaderMap, AuthHeadersProvider } from "./base-client${ext}";\n\n`;

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
  
  // Export base client for extension
  out += `export { BaseClient } from "./base-client${ext}";\n`;
  
  // Include specs removed - using explicit methods instead
  
  // Export Zod schemas
  out += `\n// Zod schemas for form validation\n`;
  for (const t of tables) {
    out += `export { Insert${pascal(t.name)}Schema, Update${pascal(t.name)}Schema } from "./zod/${t.name}${ext}";\n`;
  }

  // Export parameter schemas
  out += `\n// Zod schemas for query parameters\n`;
  out += `export { PaginationParamsSchema } from "./params/shared${ext}";\n`;
  for (const t of tables) {
    const Type = pascal(t.name);
    out += `export { ${Type}PkSchema, ${Type}ListParamsSchema, ${Type}OrderParamsSchema } from "./params/${t.name}${ext}";\n`;
  }
  
  return out;
}