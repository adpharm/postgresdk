import type { Table, Model } from "./introspect";
import type { Graph } from "./rel-classify";
import { pascal } from "./utils";
import { generateIncludeMethods } from "./emit-include-methods";

/**
 * Check if a PostgreSQL type is a vector type (vector, halfvec, sparsevec, bit)
 */
function isVectorType(pgType: string): boolean {
  const t = pgType.toLowerCase();
  return t === "vector" || t === "halfvec" || t === "sparsevec" || t === "bit";
}

/**
 * Check if a PostgreSQL type is a JSONB/JSON type
 */
function isJsonbType(pgType: string): boolean {
  const t = pgType.toLowerCase();
  return t === "json" || t === "jsonb";
}

/**
 * Convert relation name to include param name
 * "books" → "booksInclude"
 */
function toIncludeParamName(relationKey: string): string {
  return `${relationKey}Include`;
}

/**
 * Analyze includeSpec to determine pattern type
 */
function analyzeIncludeSpec(includeSpec: Record<string, unknown>): {
  type: 'single' | 'parallel' | 'nested';
  keys: string[];
  nestedKey?: string;
  nestedValue?: Record<string, unknown>;
} {
  const keys = Object.keys(includeSpec);

  if (keys.length > 1) {
    return { type: 'parallel', keys };
  }

  const key = keys[0];
  if (!key) {
    return { type: 'single', keys: [] };
  }

  const value = includeSpec[key];

  if (typeof value === 'object' && value !== null) {
    return { type: 'nested', keys: [key], nestedKey: key, nestedValue: value as Record<string, unknown> };
  }

  return { type: 'single', keys: [key] };
}

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

  // Check if table has any vector columns
  const hasVectorColumns = table.columns.some(c => isVectorType(c.pgType));

  // Check if table has any JSONB columns
  const hasJsonbColumns = table.columns.some(c => isJsonbType(c.pgType));

  // Debug: log vector detection
  if (process.env.SDK_DEBUG) {
    const vectorCols = table.columns.filter(c => isVectorType(c.pgType));
    if (vectorCols.length > 0) {
      console.log(`[DEBUG] Table ${table.name}: Found ${vectorCols.length} vector columns:`, vectorCols.map(c => `${c.name} (${c.pgType})`));
    }
  }

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
    const pattern = analyzeIncludeSpec(method.includeSpec);

    // Generate JSDoc description
    const relationshipDesc = method.path.map((p, i) => {
      const isLast = i === method.path.length - 1;
      const relation = method.isMany[i] ? "many" : "one";
      return isLast ? p : `${p} -> `;
    }).join('');

    // Build parameter type based on include pattern
    let paramsType = "";
    const includeParamNames: string[] = [];

    if (pattern.type === 'single') {
      const key = pattern.keys[0];
      if (key) {
        const paramName = toIncludeParamName(key);
        includeParamNames.push(paramName);
        paramsType = `{
    limit?: number;
    offset?: number;
    where?: Where<Select${Type}>;
    orderBy?: string | string[];
    order?: "asc" | "desc" | ("asc" | "desc")[];
    ${paramName}?: {
      orderBy?: string | string[];
      order?: "asc" | "desc";
      limit?: number;
      offset?: number;
    };
  }`;
      }
    } else if (pattern.type === 'parallel') {
      const includeParams = pattern.keys.map(key => {
        const paramName = toIncludeParamName(key);
        includeParamNames.push(paramName);
        return `${paramName}?: {
      orderBy?: string | string[];
      order?: "asc" | "desc";
      limit?: number;
      offset?: number;
    }`;
      }).join(';\n    ');

      paramsType = `{
    limit?: number;
    offset?: number;
    where?: Where<Select${Type}>;
    orderBy?: string | string[];
    order?: "asc" | "desc" | ("asc" | "desc")[];
    ${includeParams};
  }`;
    } else if (pattern.type === 'nested' && pattern.nestedKey) {
      const paramName = toIncludeParamName(pattern.nestedKey);
      includeParamNames.push(paramName);
      paramsType = `{
    limit?: number;
    offset?: number;
    where?: Where<Select${Type}>;
    orderBy?: string | string[];
    order?: "asc" | "desc" | ("asc" | "desc")[];
    ${paramName}?: {
      orderBy?: string | string[];
      order?: "asc" | "desc";
      limit?: number;
      offset?: number;
      include?: any;
    };
  }`;
    }

    if (isGetByPk) {
      // For getByPk with includes
      const pkWhere = hasCompositePk
        ? `{ ${safePk.map(col => `${col}: pk.${col}`).join(", ")} }`
        : `{ ${safePk[0] || 'id'}: pk }`;

      const baseReturnType = method.returnType.replace(" | null", "");

      // Generate param destructuring and include spec transformation
      let transformCode = "";
      if (includeParamNames.length > 0) {
        const destructure = includeParamNames.map(name => name).join(", ");

        if (pattern.type === 'single') {
          const key = pattern.keys[0];
          const paramName = includeParamNames[0];
          transformCode = `
    const { ${destructure} } = params ?? {};
    const includeSpec = ${paramName} ? { ${key}: ${paramName} } : ${JSON.stringify(method.includeSpec)};`;
        } else if (pattern.type === 'parallel') {
          const includeSpecCode = pattern.keys.map((key, idx) => {
            const paramName = includeParamNames[idx];
            return `${key}: ${paramName} ?? true`;
          }).join(', ');
          transformCode = `
    const { ${destructure} } = params ?? {};
    const includeSpec = { ${includeSpecCode} };`;
        } else if (pattern.type === 'nested' && pattern.nestedKey) {
          const key = pattern.nestedKey;
          const paramName = includeParamNames[0];
          transformCode = `
    const { ${destructure} } = params ?? {};
    const includeSpec = ${paramName} ? { ${key}: ${paramName} } : ${JSON.stringify(method.includeSpec)};`;
        }
      } else {
        transformCode = `
    const includeSpec = ${JSON.stringify(method.includeSpec)};`;
      }

      includeMethodsCode += `
  /**
   * Get a ${table.name} record by primary key with included related ${relationshipDesc}
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @param params - Optional include options
   * @returns The record with nested ${method.path.join(' and ')} if found, null otherwise
   */
  async ${method.name}(pk: ${pkType}, params?: ${paramsType}): Promise<${method.returnType}> {${transformCode}
    const results = await this.post<PaginatedResponse<${baseReturnType}>>(\`\${this.resource}/list\`, {
      where: ${pkWhere},
      include: includeSpec,
      limit: 1
    });
    return (results.data[0] as ${baseReturnType}) ?? null;
  }
`;
    } else {
      // For list methods
      let transformCode = "";
      if (includeParamNames.length > 0) {
        const destructure = includeParamNames.map(name => name).join(", ");

        if (pattern.type === 'single') {
          const key = pattern.keys[0];
          const paramName = includeParamNames[0];
          transformCode = `
    const { ${destructure}, ...baseParams } = params ?? {};
    const includeSpec = ${paramName} ? { ${key}: ${paramName} } : ${JSON.stringify(method.includeSpec)};
    return this.post<${method.returnType}>(\`\${this.resource}/list\`, { ...baseParams, include: includeSpec });`;
        } else if (pattern.type === 'parallel') {
          const includeSpecCode = pattern.keys.map((key, idx) => {
            const paramName = includeParamNames[idx];
            return `${key}: ${paramName} ?? true`;
          }).join(', ');
          transformCode = `
    const { ${destructure}, ...baseParams } = params ?? {};
    const includeSpec = { ${includeSpecCode} };
    return this.post<${method.returnType}>(\`\${this.resource}/list\`, { ...baseParams, include: includeSpec });`;
        } else if (pattern.type === 'nested' && pattern.nestedKey) {
          const key = pattern.nestedKey;
          const paramName = includeParamNames[0];
          transformCode = `
    const { ${destructure}, ...baseParams } = params ?? {};
    const includeSpec = ${paramName} ? { ${key}: ${paramName} } : ${JSON.stringify(method.includeSpec)};
    return this.post<${method.returnType}>(\`\${this.resource}/list\`, { ...baseParams, include: includeSpec });`;
        }
      } else {
        transformCode = `
    return this.post<${method.returnType}>(\`\${this.resource}/list\`, { ...params, include: ${JSON.stringify(method.includeSpec)} });`;
      }

      includeMethodsCode += `
  /**
   * List ${table.name} records with included related ${relationshipDesc}
   * @param params - Query parameters (where, orderBy, order, limit, offset) and include options
   * @returns Paginated results with nested ${method.path.join(' and ')} included
   */
  async ${method.name}(params?: ${paramsType}): Promise<${method.returnType}> {${transformCode}
  }
`;
    }
  }

  return `/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 *
 * This file was automatically generated by PostgreSDK.
 * Any manual changes will be overwritten on the next generation.
 *
 * To make changes, modify your schema or configuration and regenerate.
 */
import { BaseClient } from "./base-client${ext}";
import type { Where } from "./where-types${ext}";
import type { PaginatedResponse } from "./types/shared${ext}";
${typeImports}
${otherTableImports.join("\n")}

/**
 * Client for ${table.name} table operations
 */
export class ${Type}Client extends BaseClient {
  private readonly resource = "/v1/${table.name}";

${hasJsonbColumns ? `  /**
   * Create a new ${table.name} record
   * @param data - The data to insert
   * @returns The created record
   * @example
   * // With JSONB type override:
   * type Metadata = { tags: string[]; prefs: { theme: 'light' | 'dark' } };
   * const user = await client.create<{ metadata: Metadata }>({ name: 'Alice', metadata: { tags: [], prefs: { theme: 'light' } } });
   */
  async create<TJsonb extends Partial<Select${Type}> = {}>(
    data: Insert${Type}<TJsonb>
  ): Promise<Select${Type}<TJsonb>> {
    return this.post<Select${Type}<TJsonb>>(this.resource, data);
  }` : `  /**
   * Create a new ${table.name} record
   * @param data - The data to insert
   * @returns The created record
   */
  async create(data: Insert${Type}): Promise<Select${Type}> {
    return this.post<Select${Type}>(this.resource, data);
  }`}

${hasJsonbColumns ? `  /**
   * Get a ${table.name} record by primary key
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @returns The record if found, null otherwise
   * @example
   * // With JSONB type override:
   * const user = await client.getByPk<{ metadata: Metadata }>('user-id');
   */
  async getByPk<TJsonb extends Partial<Select${Type}> = {}>(
    pk: ${pkType}
  ): Promise<Select${Type}<TJsonb> | null> {
    const path = ${pkPathExpr};
    return this.get<Select${Type}<TJsonb> | null>(\`\${this.resource}/\${path}\`);
  }` : `  /**
   * Get a ${table.name} record by primary key
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @returns The record if found, null otherwise
   */
  async getByPk(pk: ${pkType}): Promise<Select${Type} | null> {
    const path = ${pkPathExpr};
    return this.get<Select${Type} | null>(\`\${this.resource}/\${path}\`);
  }`}

${hasJsonbColumns ? `  /**
   * List ${table.name} records with pagination and filtering
   * @param params - Query parameters
   * @param params.where - Filter conditions using operators like $eq, $gt, $in, $like, etc.
   * @param params.orderBy - Column(s) to sort by
   * @param params.order - Sort direction(s): "asc" or "desc"
   * @param params.limit - Maximum number of records to return (default: 50, max: 1000)
   * @param params.offset - Number of records to skip for pagination
   * @param params.include - Related records to include (see listWith* methods for typed includes)
   * @returns Paginated results with data, total count, and hasMore flag
   * @example
   * // With JSONB type override:
   * const users = await client.list<{ metadata: Metadata }>({ where: { status: 'active' } });
   */
  async list<TJsonb extends Partial<Select${Type}> = {}>(params?: {
    include?: any;
    limit?: number;
    offset?: number;
    where?: Where<Select${Type}<TJsonb>>;${hasVectorColumns ? `
    vector?: {
      field: string;
      query: number[];
      metric?: "cosine" | "l2" | "inner";
      maxDistance?: number;
    };` : ""}
    orderBy?: string | string[];
    order?: "asc" | "desc" | ("asc" | "desc")[];
  }): Promise<PaginatedResponse<Select${Type}<TJsonb>${hasVectorColumns ? ' & { _distance?: number }' : ''}>> {
    return this.post<PaginatedResponse<Select${Type}<TJsonb>${hasVectorColumns ? ' & { _distance?: number }' : ''}>>(\`\${this.resource}/list\`, params ?? {});
  }` : `  /**
   * List ${table.name} records with pagination and filtering
   * @param params - Query parameters
   * @param params.where - Filter conditions using operators like $eq, $gt, $in, $like, etc.
   * @param params.orderBy - Column(s) to sort by
   * @param params.order - Sort direction(s): "asc" or "desc"
   * @param params.limit - Maximum number of records to return (default: 50, max: 1000)
   * @param params.offset - Number of records to skip for pagination
   * @param params.include - Related records to include (see listWith* methods for typed includes)
   * @returns Paginated results with data, total count, and hasMore flag
   */
  async list(params?: {
    include?: any;
    limit?: number;
    offset?: number;
    where?: Where<Select${Type}>;${hasVectorColumns ? `
    vector?: {
      field: string;
      query: number[];
      metric?: "cosine" | "l2" | "inner";
      maxDistance?: number;
    };` : ""}
    orderBy?: string | string[];
    order?: "asc" | "desc" | ("asc" | "desc")[];
  }): Promise<PaginatedResponse<Select${Type}${hasVectorColumns ? ' & { _distance?: number }' : ''}>> {
    return this.post<PaginatedResponse<Select${Type}${hasVectorColumns ? ' & { _distance?: number }' : ''}>>(\`\${this.resource}/list\`, params ?? {});
  }`}

${hasJsonbColumns ? `  /**
   * Update a ${table.name} record by primary key
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @param patch - Partial data to update
   * @returns The updated record if found, null otherwise
   * @example
   * // With JSONB type override:
   * const user = await client.update<{ metadata: Metadata }>('user-id', { metadata: { tags: ['new'] } });
   */
  async update<TJsonb extends Partial<Select${Type}> = {}>(
    pk: ${pkType},
    patch: Update${Type}<TJsonb>
  ): Promise<Select${Type}<TJsonb> | null> {
    const path = ${pkPathExpr};
    return this.patch<Select${Type}<TJsonb> | null>(\`\${this.resource}/\${path}\`, patch);
  }` : `  /**
   * Update a ${table.name} record by primary key
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @param patch - Partial data to update
   * @returns The updated record if found, null otherwise
   */
  async update(pk: ${pkType}, patch: Update${Type}): Promise<Select${Type} | null> {
    const path = ${pkPathExpr};
    return this.patch<Select${Type} | null>(\`\${this.resource}/\${path}\`, patch);
  }`}

${hasJsonbColumns ? `  /**
   * Delete a ${table.name} record by primary key
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @returns The deleted record if found, null otherwise
   * @example
   * // With JSONB type override:
   * const user = await client.delete<{ metadata: Metadata }>('user-id');
   */
  async delete<TJsonb extends Partial<Select${Type}> = {}>(
    pk: ${pkType}
  ): Promise<Select${Type}<TJsonb> | null> {
    const path = ${pkPathExpr};
    return this.del<Select${Type}<TJsonb> | null>(\`\${this.resource}/\${path}\`);
  }` : `  /**
   * Delete a ${table.name} record by primary key
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @returns The deleted record if found, null otherwise
   */
  async delete(pk: ${pkType}): Promise<Select${Type} | null> {
    const path = ${pkPathExpr};
    return this.del<Select${Type} | null>(\`\${this.resource}/\${path}\`);
  }`}
${includeMethodsCode}}
`;
}

export function emitClientIndex(tables: Table[], useJsExtensions?: boolean) {
  const ext = useJsExtensions ? ".js" : "";
  let out = `/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 *
 * This file was automatically generated by PostgreSDK.
 * Any manual changes will be overwritten on the next generation.
 *
 * To make changes, modify your schema or configuration and regenerate.
 */
`;
  
  // Import auth types
  out += `import type { AuthConfig } from "./base-client${ext}";\n`;
  
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

  // Export IncludeSpec types for advanced usage
  out += `\n// Include specification types for custom queries\n`;
  out += `export type {\n`;
  for (const t of tables) {
    out += `  ${pascal(t.name)}IncludeSpec,\n`;
  }
  out += `} from "./include-spec${ext}";\n`;

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

  // Export table types (Insert, Update, Select)
  out += `\n// Table types (Select, Insert, Update)\n`;
  for (const t of tables) {
    const Type = pascal(t.name);
    out += `export type { Insert${Type}, Update${Type}, Select${Type} } from "./types/${t.name}${ext}";\n`;
  }

  // Export shared types
  out += `\n// Shared types\n`;
  out += `export type { PaginatedResponse } from "./types/shared${ext}";\n`;

  return out;
}