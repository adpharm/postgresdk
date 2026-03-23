import type { Table, Model } from "./introspect";
import type { Graph } from "./rel-classify";
import { pascal, isVectorType, isJsonbType } from "./utils";
import { generateIncludeMethods } from "./emit-include-methods";

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
    softDeleteColumn?: string | null;
    exposeHardDelete?: boolean;
    useJsExtensions?: boolean;
    includeMethodsDepth?: number;
    skipJunctionTables?: boolean;
    maxLimit: number;
  },
  model?: Model
) {
  const Type = pascal(table.name);
  const ext = opts.useJsExtensions ? ".js" : "";
  const trigramParamType = `{ field: string; query: string; metric?: "similarity" | "wordSimilarity" | "strictWordSimilarity"; threshold?: number } | { fields: string[]; strategy?: "greatest" | "concat"; query: string; metric?: "similarity" | "wordSimilarity" | "strictWordSimilarity"; threshold?: number } | { fields: Array<{ field: string; weight: number }>; query: string; metric?: "similarity" | "wordSimilarity" | "strictWordSimilarity"; threshold?: number }`;

  // Check if table has any vector columns
  const hasVectorColumns = table.columns.some(c => isVectorType(c.pgType));

  // Check if table has any JSONB columns
  const hasJsonbColumns = table.columns.some(c => isJsonbType(c.pgType));

  // Determine soft/hard delete configuration
  const hasSoftDelete = !!opts.softDeleteColumn;
  const exposeHard = !hasSoftDelete || (opts.exposeHardDelete ?? true);

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

  // Build imports for types needed by include methods.
  // importedTypes: all relation targets → Select* type imports
  // usedIncludeSpecTypes: only nested-pattern targets → *IncludeSpec imports (others are unused)
  const importedTypes = new Set<string>();
  const usedIncludeSpecTypes = new Set<string>([table.name]);
  importedTypes.add(table.name);

  for (const method of includeMethods) {
    for (const target of method.targets) {
      importedTypes.add(target);
    }
    const pattern = analyzeIncludeSpec(method.includeSpec);
    if (pattern.type === 'nested' && method.targets[0]) {
      usedIncludeSpecTypes.add(method.targets[0]);
    }
  }

  // Generate type imports - base types for this table
  const typeImports = `import type { Insert${Type}, Update${Type}, Select${Type} } from "./types/${table.name}${ext}";`;
  const includeSpecImport = `import type { ${Array.from(usedIncludeSpecTypes).map(t => `${pascal(t)}IncludeSpec`).join(', ')} } from "./include-spec${ext}";`;

  // Import WithIncludes type for automatic type inference
  const includeResolverImport = `import type { ${Type}WithIncludes } from "./include-resolver${ext}";`;

  // If we have includes from other tables, we need those types too
  const otherTableImports: string[] = [];
  for (const target of Array.from(importedTypes)) {
    if (target !== table.name) {
      otherTableImports.push(`import type { Select${pascal(target)} } from "./types/${target}${ext}";`);
    }
  }

  // Collect unique named type aliases (list* and getByPk* share the same typeName)
  const seenTypeNames = new Set<string>();
  let typeAliasesCode = "";
  for (const method of includeMethods) {
    if (!seenTypeNames.has(method.typeName)) {
      seenTypeNames.add(method.typeName);
      typeAliasesCode += `export type ${method.typeName} = ${method.baseType};\n`;
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
    select?: string[];
    exclude?: string[];
    limit?: number;
    offset?: number;
    where?: Where<Select${Type}>;
    orderBy?: string | string[];
    order?: "asc" | "desc" | ("asc" | "desc")[];
    distinctOn?: string | string[];
    ${paramName}?: {
      select?: string[];
      exclude?: string[];
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
      select?: string[];
      exclude?: string[];
      orderBy?: string | string[];
      order?: "asc" | "desc";
      limit?: number;
      offset?: number;
    }`;
      }).join(';\n    ');

      paramsType = `{
    select?: string[];
    exclude?: string[];
    limit?: number;
    offset?: number;
    where?: Where<Select${Type}>;
    orderBy?: string | string[];
    order?: "asc" | "desc" | ("asc" | "desc")[];
    distinctOn?: string | string[];
    ${includeParams};
  }`;
    } else if (pattern.type === 'nested' && pattern.nestedKey) {
      const paramName = toIncludeParamName(pattern.nestedKey);
      includeParamNames.push(paramName);
      // Get the target table for the nested relation (e.g., "captures" -> "Captures")
      const targetTable = method.targets[0];
      const targetType = targetTable ? pascal(targetTable) : Type;
      paramsType = `{
    select?: string[];
    exclude?: string[];
    limit?: number;
    offset?: number;
    where?: Where<Select${Type}>;
    orderBy?: string | string[];
    order?: "asc" | "desc" | ("asc" | "desc")[];
    distinctOn?: string | string[];
    ${paramName}?: {
      select?: string[];
      exclude?: string[];
      orderBy?: string | string[];
      order?: "asc" | "desc";
      limit?: number;
      offset?: number;
      include?: ${targetType}IncludeSpec;
    };
  }`;
    }

    if (isGetByPk) {
      // For getByPk with includes
      const pkWhere = hasCompositePk
        ? `{ ${safePk.map(col => `${col}: pk.${col}`).join(", ")} }`
        : `{ ${safePk[0] || 'id'}: pk }`;

      const baseReturnType = method.typeName;

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
          const nestedValue = pattern.nestedValue!;
          const requiredIncludes = Object.entries(nestedValue).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ');
          transformCode = `
    const { ${destructure} } = params ?? {};
    const includeSpec = { ${key}: ${paramName}
      ? { ...${paramName}, include: { ${requiredIncludes}, ...${paramName}.include } }
      : ${JSON.stringify(nestedValue)} };`;
        }
      } else {
        transformCode = `
    const includeSpec = ${JSON.stringify(method.includeSpec)};`;
      }

      includeMethodsCode += `
  /**
   * Get a ${table.name} record by primary key with included related ${relationshipDesc}
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @param params - Optional include options (including select/exclude for base and nested tables)
   * @returns The record with nested ${method.path.join(' and ')} if found, null otherwise
   */
  async ${method.name}(pk: ${pkType}, params?: ${paramsType}): Promise<${method.typeName} | null> {${transformCode}
    const results = await this.post<PaginatedResponse<${baseReturnType}>>(\`\${this.resource}/list\`, {
      where: ${pkWhere},
      select: params?.select,
      exclude: params?.exclude,
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
          const nestedValue = pattern.nestedValue!;
          const requiredIncludes = Object.entries(nestedValue).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ');
          transformCode = `
    const { ${destructure}, ...baseParams } = params ?? {};
    const includeSpec = { ${key}: ${paramName}
      ? { ...${paramName}, include: { ${requiredIncludes}, ...${paramName}.include } }
      : ${JSON.stringify(nestedValue)} };
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
  async ${method.name}(params?: ${paramsType}): Promise<PaginatedResponse<${method.typeName}>> {${transformCode}
  }
`;
    }
  }

  // Build delete methods based on soft/hard delete config.
  // G/RBase/RPart vary only by whether the table has JSONB columns (TJsonb generic support).
  const buildDeleteMethod = (methodName: string, setHardTrue: boolean): string => {
    const actionName = methodName === 'softDelete' ? 'Soft-delete' : 'Hard-delete (permanently remove)';
    const hardLine = setHardTrue ? "\n    queryParams.set('hard', 'true');" : '';
    const pksLabel = hasCompositePk ? 's' : '';
    const G     = hasJsonbColumns ? `<TJsonb extends Partial<Select${Type}> = {}>` : '';
    const RBase = hasJsonbColumns ? `Select${Type}<TJsonb>` : `Select${Type}`;
    const RPart = hasJsonbColumns ? `Partial<Select${Type}<TJsonb>>` : `Partial<Select${Type}>`;
    return (
      `  /**\n` +
      `   * ${actionName} a ${table.name} record by primary key with field selection\n` +
      `   * @param pk - The primary key value${pksLabel}\n` +
      `   * @param options - Select specific fields to return\n` +
      `   * @returns The deleted record with only selected fields if found, null otherwise\n` +
      `   */\n` +
      `  async ${methodName}${G}(pk: ${pkType}, options: { select: string[] }): Promise<${RPart} | null>;\n` +
      `  /**\n` +
      `   * ${actionName} a ${table.name} record by primary key with field exclusion\n` +
      `   * @param pk - The primary key value${pksLabel}\n` +
      `   * @param options - Exclude specific fields from return\n` +
      `   * @returns The deleted record without excluded fields if found, null otherwise\n` +
      `   */\n` +
      `  async ${methodName}${G}(pk: ${pkType}, options: { exclude: string[] }): Promise<${RPart} | null>;\n` +
      `  /**\n` +
      `   * ${actionName} a ${table.name} record by primary key\n` +
      `   * @param pk - The primary key value${pksLabel}\n` +
      `   * @returns The deleted record with all fields if found, null otherwise\n` +
      `   */\n` +
      `  async ${methodName}${G}(pk: ${pkType}, options?: Omit<{ select?: string[]; exclude?: string[] }, 'select' | 'exclude'>): Promise<${RBase} | null>;\n` +
      `  async ${methodName}${G}(\n` +
      `    pk: ${pkType},\n` +
      `    options?: { select?: string[]; exclude?: string[] }\n` +
      `  ): Promise<${RBase} | ${RPart} | null> {\n` +
      `    const path = ${pkPathExpr};\n` +
      `    const queryParams = new URLSearchParams();${hardLine}\n` +
      `    if (options?.select) queryParams.set('select', options.select.join(','));\n` +
      `    if (options?.exclude) queryParams.set('exclude', options.exclude.join(','));\n` +
      `    const query = queryParams.toString();\n` +
      "    const url = query ? `${this.resource}/${path}?${query}` : `${this.resource}/${path}`;\n" +
      `    return this.del<${RBase} | null>(url);\n` +
      `  }`
    );
  };

  const deleteMethodParts: string[] = [];
  if (hasSoftDelete) deleteMethodParts.push(buildDeleteMethod('softDelete', false));
  if (exposeHard) deleteMethodParts.push(buildDeleteMethod('hardDelete', hasSoftDelete));
  const deleteMethodsCode = deleteMethodParts.join('\n\n');

  // Transaction delete descriptors — same conditional logic as the HTTP delete methods above
  const txDeleteParts: string[] = [];
  if (hasSoftDelete) txDeleteParts.push(
    `  /** Build a lazy soft-DELETE descriptor for use with sdk.$transaction([...]) */\n` +
    `  $softDelete(pk: ${pkType}): TxOp<Select${Type} | null> {\n` +
    `    return { _table: "${table.name}", _op: "softDelete", _pk: ${hasCompositePk ? 'pk as Record<string, unknown>' : 'pk'} };\n` +
    `  }`
  );
  if (exposeHard) txDeleteParts.push(
    `  /** Build a lazy hard-DELETE descriptor for use with sdk.$transaction([...]) */\n` +
    `  $hardDelete(pk: ${pkType}): TxOp<Select${Type} | null> {\n` +
    `    return { _table: "${table.name}", _op: "hardDelete", _pk: ${hasCompositePk ? 'pk as Record<string, unknown>' : 'pk'} };\n` +
    `  }`
  );
  const txDeleteMethodsCode = txDeleteParts.join('\n\n');

  return `/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 *
 * This file was automatically generated by PostgreSDK.
 * Any manual changes will be overwritten on the next generation.
 *
 * To make changes, modify your schema or configuration and regenerate.
 */
import { BaseClient } from "./base-client${ext}";
import type { TxOp } from "./base-client${ext}";
import type { Where } from "./where-types${ext}";
import type { PaginatedResponse } from "./types/shared${ext}";
${typeImports}
${includeSpecImport}
${includeResolverImport}
${otherTableImports.join("\n")}

${typeAliasesCode}
/**
 * Client for ${table.name} table operations
 */
export class ${Type}Client extends BaseClient {
  private readonly resource = "/v1/${table.name}";

${hasJsonbColumns ? `  /**
   * Create a new ${table.name} record with field selection
   * @param data - The data to insert
   * @param options - Select specific fields to return
   * @returns The created record with only selected fields
   */
  async create<TJsonb extends Partial<Select${Type}> = {}>(data: NoInfer<Insert${Type}<TJsonb>>, options: { select: string[] }): Promise<Partial<Select${Type}<TJsonb>>>;
  /**
   * Create a new ${table.name} record with field exclusion
   * @param data - The data to insert
   * @param options - Exclude specific fields from return
   * @returns The created record without excluded fields
   */
  async create<TJsonb extends Partial<Select${Type}> = {}>(data: NoInfer<Insert${Type}<TJsonb>>, options: { exclude: string[] }): Promise<Partial<Select${Type}<TJsonb>>>;
  /**
   * Create a new ${table.name} record
   * @param data - The data to insert
   * @returns The created record with all fields
   * @example
   * // With JSONB type override:
   * type Metadata = { tags: string[]; prefs: { theme: 'light' | 'dark' } };
   * const user = await client.create<{ metadata: Metadata }>({ name: 'Alice', metadata: { tags: [], prefs: { theme: 'light' } } });
   */
  async create<TJsonb extends Partial<Select${Type}> = {}>(data: NoInfer<Insert${Type}<TJsonb>>, options?: Omit<{ select?: string[]; exclude?: string[] }, 'select' | 'exclude'>): Promise<Select${Type}<TJsonb>>;
  async create<TJsonb extends Partial<Select${Type}> = {}>(
    data: NoInfer<Insert${Type}<TJsonb>>,
    options?: { select?: string[]; exclude?: string[] }
  ): Promise<Select${Type}<TJsonb> | Partial<Select${Type}<TJsonb>>> {
    const queryParams = new URLSearchParams();
    if (options?.select) queryParams.set('select', options.select.join(','));
    if (options?.exclude) queryParams.set('exclude', options.exclude.join(','));
    const query = queryParams.toString();
    const url = query ? \`\${this.resource}?\${query}\` : this.resource;
    return this.post<Select${Type}<TJsonb>>(url, data);
  }` : `  /**
   * Create a new ${table.name} record with field selection
   * @param data - The data to insert
   * @param options - Select specific fields to return
   * @returns The created record with only selected fields
   */
  async create(data: Insert${Type}, options: { select: string[] }): Promise<Partial<Select${Type}>>;
  /**
   * Create a new ${table.name} record with field exclusion
   * @param data - The data to insert
   * @param options - Exclude specific fields from return
   * @returns The created record without excluded fields
   */
  async create(data: Insert${Type}, options: { exclude: string[] }): Promise<Partial<Select${Type}>>;
  /**
   * Create a new ${table.name} record
   * @param data - The data to insert
   * @returns The created record with all fields
   */
  async create(data: Insert${Type}, options?: Omit<{ select?: string[]; exclude?: string[] }, 'select' | 'exclude'>): Promise<Select${Type}>;
  async create(
    data: Insert${Type},
    options?: { select?: string[]; exclude?: string[] }
  ): Promise<Select${Type} | Partial<Select${Type}>> {
    const queryParams = new URLSearchParams();
    if (options?.select) queryParams.set('select', options.select.join(','));
    if (options?.exclude) queryParams.set('exclude', options.exclude.join(','));
    const query = queryParams.toString();
    const url = query ? \`\${this.resource}?\${query}\` : this.resource;
    return this.post<Select${Type}>(url, data);
  }`}

${hasJsonbColumns ? `  /**
   * Upsert a ${table.name} record with field selection
   */
  async upsert<TJsonb extends Partial<Select${Type}> = {}>(
    args: { where: Update${Type}<TJsonb>; create: NoInfer<Insert${Type}<TJsonb>>; update: NoInfer<Update${Type}<TJsonb>> },
    options: { select: string[] }
  ): Promise<Partial<Select${Type}<TJsonb>>>;
  /**
   * Upsert a ${table.name} record with field exclusion
   */
  async upsert<TJsonb extends Partial<Select${Type}> = {}>(
    args: { where: Update${Type}<TJsonb>; create: NoInfer<Insert${Type}<TJsonb>>; update: NoInfer<Update${Type}<TJsonb>> },
    options: { exclude: string[] }
  ): Promise<Partial<Select${Type}<TJsonb>>>;
  /**
   * Upsert a ${table.name} record — insert if no conflict on 'where' columns, update otherwise.
   * @param args.where - Conflict target column(s) (must be a unique constraint)
   * @param args.create - Full insert data used when no conflict occurs
   * @param args.update - Partial data applied when a conflict occurs
   * @returns The resulting record
   */
  async upsert<TJsonb extends Partial<Select${Type}> = {}>(
    args: { where: Update${Type}<TJsonb>; create: NoInfer<Insert${Type}<TJsonb>>; update: NoInfer<Update${Type}<TJsonb>> },
    options?: Omit<{ select?: string[]; exclude?: string[] }, 'select' | 'exclude'>
  ): Promise<Select${Type}<TJsonb>>;
  async upsert<TJsonb extends Partial<Select${Type}> = {}>(
    args: { where: Update${Type}<TJsonb>; create: NoInfer<Insert${Type}<TJsonb>>; update: NoInfer<Update${Type}<TJsonb>> },
    options?: { select?: string[]; exclude?: string[] }
  ): Promise<Select${Type}<TJsonb> | Partial<Select${Type}<TJsonb>>> {
    const queryParams = new URLSearchParams();
    if (options?.select) queryParams.set('select', options.select.join(','));
    if (options?.exclude) queryParams.set('exclude', options.exclude.join(','));
    const query = queryParams.toString();
    const url = query ? \`\${this.resource}/upsert?\${query}\` : \`\${this.resource}/upsert\`;
    return this.post<Select${Type}<TJsonb>>(url, args);
  }` : `  /**
   * Upsert a ${table.name} record with field selection
   */
  async upsert(
    args: { where: Update${Type}; create: Insert${Type}; update: Update${Type} },
    options: { select: string[] }
  ): Promise<Partial<Select${Type}>>;
  /**
   * Upsert a ${table.name} record with field exclusion
   */
  async upsert(
    args: { where: Update${Type}; create: Insert${Type}; update: Update${Type} },
    options: { exclude: string[] }
  ): Promise<Partial<Select${Type}>>;
  /**
   * Upsert a ${table.name} record — insert if no conflict on 'where' columns, update otherwise.
   * @param args.where - Conflict target column(s) (must be a unique constraint)
   * @param args.create - Full insert data used when no conflict occurs
   * @param args.update - Partial data applied when a conflict occurs
   * @returns The resulting record
   */
  async upsert(
    args: { where: Update${Type}; create: Insert${Type}; update: Update${Type} },
    options?: Omit<{ select?: string[]; exclude?: string[] }, 'select' | 'exclude'>
  ): Promise<Select${Type}>;
  async upsert(
    args: { where: Update${Type}; create: Insert${Type}; update: Update${Type} },
    options?: { select?: string[]; exclude?: string[] }
  ): Promise<Select${Type} | Partial<Select${Type}>> {
    const queryParams = new URLSearchParams();
    if (options?.select) queryParams.set('select', options.select.join(','));
    if (options?.exclude) queryParams.set('exclude', options.exclude.join(','));
    const query = queryParams.toString();
    const url = query ? \`\${this.resource}/upsert?\${query}\` : \`\${this.resource}/upsert\`;
    return this.post<Select${Type}>(url, args);
  }`}

${hasJsonbColumns ? `  /**
   * Get a ${table.name} record by primary key with field selection
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @param options - Select specific fields to return
   * @returns The record with only selected fields if found, null otherwise
   */
  async getByPk<TJsonb extends Partial<Select${Type}> = {}>(pk: ${pkType}, options: { select: string[]; includeSoftDeleted?: boolean }): Promise<Partial<Select${Type}<TJsonb>> | null>;
  /**
   * Get a ${table.name} record by primary key with field exclusion
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @param options - Exclude specific fields from return
   * @returns The record without excluded fields if found, null otherwise
   */
  async getByPk<TJsonb extends Partial<Select${Type}> = {}>(pk: ${pkType}, options: { exclude: string[]; includeSoftDeleted?: boolean }): Promise<Partial<Select${Type}<TJsonb>> | null>;
  /**
   * Get a ${table.name} record by primary key
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @returns The record with all fields if found, null otherwise
   * @example
   * // With JSONB type override:
   * const user = await client.getByPk<{ metadata: Metadata }>('user-id');
   */
  async getByPk<TJsonb extends Partial<Select${Type}> = {}>(pk: ${pkType}, options?: { includeSoftDeleted?: boolean }): Promise<Select${Type}<TJsonb> | null>;
  async getByPk<TJsonb extends Partial<Select${Type}> = {}>(
    pk: ${pkType},
    options?: { select?: string[]; exclude?: string[]; includeSoftDeleted?: boolean }
  ): Promise<Select${Type}<TJsonb> | Partial<Select${Type}<TJsonb>> | null> {
    const path = ${pkPathExpr};
    const queryParams = new URLSearchParams();
    if (options?.select) queryParams.set('select', options.select.join(','));
    if (options?.exclude) queryParams.set('exclude', options.exclude.join(','));
    if (options?.includeSoftDeleted) queryParams.set('includeSoftDeleted', 'true');
    const query = queryParams.toString();
    const url = query ? \`\${this.resource}/\${path}?\${query}\` : \`\${this.resource}/\${path}\`;
    return this.get<Select${Type}<TJsonb> | null>(url);
  }` : `  /**
   * Get a ${table.name} record by primary key with field selection
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @param options - Select specific fields to return
   * @returns The record with only selected fields if found, null otherwise
   */
  async getByPk(pk: ${pkType}, options: { select: string[]; includeSoftDeleted?: boolean }): Promise<Partial<Select${Type}> | null>;
  /**
   * Get a ${table.name} record by primary key with field exclusion
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @param options - Exclude specific fields from return
   * @returns The record without excluded fields if found, null otherwise
   */
  async getByPk(pk: ${pkType}, options: { exclude: string[]; includeSoftDeleted?: boolean }): Promise<Partial<Select${Type}> | null>;
  /**
   * Get a ${table.name} record by primary key
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @returns The record with all fields if found, null otherwise
   */
  async getByPk(pk: ${pkType}, options?: { includeSoftDeleted?: boolean }): Promise<Select${Type} | null>;
  async getByPk(
    pk: ${pkType},
    options?: { select?: string[]; exclude?: string[]; includeSoftDeleted?: boolean }
  ): Promise<Select${Type} | Partial<Select${Type}> | null> {
    const path = ${pkPathExpr};
    const queryParams = new URLSearchParams();
    if (options?.select) queryParams.set('select', options.select.join(','));
    if (options?.exclude) queryParams.set('exclude', options.exclude.join(','));
    if (options?.includeSoftDeleted) queryParams.set('includeSoftDeleted', 'true');
    const query = queryParams.toString();
    const url = query ? \`\${this.resource}/\${path}?\${query}\` : \`\${this.resource}/\${path}\`;
    return this.get<Select${Type} | null>(url);
  }`}

${hasJsonbColumns ? `  /**
   * List ${table.name} records with field selection
   * @param params - Query parameters with select
   * @returns Paginated results with only selected fields
   */
  async list<TJsonb extends Partial<Select${Type}> = {}>(params: {
    select: string[];
    include?: ${Type}IncludeSpec;
    limit?: number;
    offset?: number;
    where?: Where<Select${Type}<TJsonb>>;${hasVectorColumns ? `
    vector?: {
      field: string;
      query: number[];
      metric?: "cosine" | "l2" | "inner";
      maxDistance?: number;
    };` : ""}
    trigram?: ${trigramParamType};
    orderBy?: string | string[];
    order?: "asc" | "desc" | ("asc" | "desc")[];
    distinctOn?: string | string[];
    includeSoftDeleted?: boolean;
  }): Promise<PaginatedResponse<Partial<Select${Type}<TJsonb>> & { _similarity?: number }${hasVectorColumns ? ' & { _distance?: number }' : ''}>>;
  /**
   * List ${table.name} records with field exclusion
   * @param params - Query parameters with exclude
   * @returns Paginated results without excluded fields
   */
  async list<TJsonb extends Partial<Select${Type}> = {}>(params: {
    exclude: string[];
    include?: ${Type}IncludeSpec;
    limit?: number;
    offset?: number;
    where?: Where<Select${Type}<TJsonb>>;${hasVectorColumns ? `
    vector?: {
      field: string;
      query: number[];
      metric?: "cosine" | "l2" | "inner";
      maxDistance?: number;
    };` : ""}
    trigram?: ${trigramParamType};
    orderBy?: string | string[];
    order?: "asc" | "desc" | ("asc" | "desc")[];
    distinctOn?: string | string[];
    includeSoftDeleted?: boolean;
  }): Promise<PaginatedResponse<Partial<Select${Type}<TJsonb>> & { _similarity?: number }${hasVectorColumns ? ' & { _distance?: number }' : ''}>>;
  /**
   * List ${table.name} records with pagination and filtering
   * @param params - Query parameters
   * @param params.where - Filter conditions using operators like $eq, $gt, $in, $like, etc.
   * @param params.orderBy - Column(s) to sort by
   * @param params.order - Sort direction(s): "asc" or "desc"
   * @param params.limit - Maximum number of records to return${opts.maxLimit > 0 ? ` (max: ${opts.maxLimit})` : ""}. Omit to return all matching records.
   * @param params.offset - Number of records to skip for pagination
   * @param params.include - Related records to include (return type automatically infers included relations)
   * @returns Paginated results with all fields (and included relations if specified)
   * @example
   * // With JSONB type override:
   * const users = await client.list<{ metadata: Metadata }>({ where: { status: 'active' } });
   * // With automatic include inference:
   * const users = await client.list({ include: { posts: true } });
   * // users[0].posts is automatically typed
   */
  async list<TJsonb extends Partial<Select${Type}> = {}, TInclude extends ${Type}IncludeSpec = {}>(params?: {
    include?: TInclude;
    limit?: number;
    offset?: number;
    where?: Where<Select${Type}<TJsonb>>;${hasVectorColumns ? `
    vector?: {
      field: string;
      query: number[];
      metric?: "cosine" | "l2" | "inner";
      maxDistance?: number;
    };` : ""}
    trigram?: ${trigramParamType};
    orderBy?: string | string[];
    order?: "asc" | "desc" | ("asc" | "desc")[];
    distinctOn?: string | string[];
    includeSoftDeleted?: boolean;
  }): Promise<PaginatedResponse<${Type}WithIncludes<TInclude> & { _similarity?: number }${hasVectorColumns ? ' & { _distance?: number }' : ''}>>;
  async list<TJsonb extends Partial<Select${Type}> = {}>(params?: {
    include?: ${Type}IncludeSpec;
    select?: string[];
    exclude?: string[];
    limit?: number;
    offset?: number;
    where?: Where<Select${Type}<TJsonb>>;${hasVectorColumns ? `
    vector?: {
      field: string;
      query: number[];
      metric?: "cosine" | "l2" | "inner";
      maxDistance?: number;
    };` : ""}
    trigram?: ${trigramParamType};
    orderBy?: string | string[];
    order?: "asc" | "desc" | ("asc" | "desc")[];
    distinctOn?: string | string[];
    includeSoftDeleted?: boolean;
  }): Promise<PaginatedResponse<Select${Type}<TJsonb> | Partial<Select${Type}<TJsonb>>>> {
    return this.post<PaginatedResponse<Select${Type}<TJsonb> & { _similarity?: number }${hasVectorColumns ? ' & { _distance?: number }' : ''}>>(\`\${this.resource}/list\`, params ?? {});
  }` : `  /**
   * List ${table.name} records with field selection
   * @param params - Query parameters with select
   * @returns Paginated results with only selected fields
   */
  async list(params: {
    select: string[];
    include?: ${Type}IncludeSpec;
    limit?: number;
    offset?: number;
    where?: Where<Select${Type}>;${hasVectorColumns ? `
    vector?: {
      field: string;
      query: number[];
      metric?: "cosine" | "l2" | "inner";
      maxDistance?: number;
    };` : ""}
    trigram?: ${trigramParamType};
    orderBy?: string | string[];
    order?: "asc" | "desc" | ("asc" | "desc")[];
    distinctOn?: string | string[];
    includeSoftDeleted?: boolean;
  }): Promise<PaginatedResponse<Partial<Select${Type}> & { _similarity?: number }${hasVectorColumns ? ' & { _distance?: number }' : ''}>>;
  /**
   * List ${table.name} records with field exclusion
   * @param params - Query parameters with exclude
   * @returns Paginated results without excluded fields
   */
  async list(params: {
    exclude: string[];
    include?: ${Type}IncludeSpec;
    limit?: number;
    offset?: number;
    where?: Where<Select${Type}>;${hasVectorColumns ? `
    vector?: {
      field: string;
      query: number[];
      metric?: "cosine" | "l2" | "inner";
      maxDistance?: number;
    };` : ""}
    trigram?: ${trigramParamType};
    orderBy?: string | string[];
    order?: "asc" | "desc" | ("asc" | "desc")[];
    distinctOn?: string | string[];
    includeSoftDeleted?: boolean;
  }): Promise<PaginatedResponse<Partial<Select${Type}> & { _similarity?: number }${hasVectorColumns ? ' & { _distance?: number }' : ''}>>;
  /**
   * List ${table.name} records with pagination and filtering
   * @param params - Query parameters
   * @param params.where - Filter conditions using operators like $eq, $gt, $in, $like, etc.
   * @param params.orderBy - Column(s) to sort by
   * @param params.order - Sort direction(s): "asc" or "desc"
   * @param params.limit - Maximum number of records to return${opts.maxLimit > 0 ? ` (max: ${opts.maxLimit})` : ""}. Omit to return all matching records.
   * @param params.offset - Number of records to skip for pagination
   * @param params.include - Related records to include (return type automatically infers included relations)
   * @returns Paginated results with all fields (and included relations if specified)
   */
  async list<TInclude extends ${Type}IncludeSpec = {}>(params?: {
    include?: TInclude;
    limit?: number;
    offset?: number;
    where?: Where<Select${Type}>;${hasVectorColumns ? `
    vector?: {
      field: string;
      query: number[];
      metric?: "cosine" | "l2" | "inner";
      maxDistance?: number;
    };` : ""}
    trigram?: ${trigramParamType};
    orderBy?: string | string[];
    order?: "asc" | "desc" | ("asc" | "desc")[];
    distinctOn?: string | string[];
    includeSoftDeleted?: boolean;
  }): Promise<PaginatedResponse<${Type}WithIncludes<TInclude> & { _similarity?: number }${hasVectorColumns ? ' & { _distance?: number }' : ''}>>;
  async list(params?: {
    include?: ${Type}IncludeSpec;
    select?: string[];
    exclude?: string[];
    limit?: number;
    offset?: number;
    where?: Where<Select${Type}>;${hasVectorColumns ? `
    vector?: {
      field: string;
      query: number[];
      metric?: "cosine" | "l2" | "inner";
      maxDistance?: number;
    };` : ""}
    trigram?: ${trigramParamType};
    orderBy?: string | string[];
    order?: "asc" | "desc" | ("asc" | "desc")[];
    distinctOn?: string | string[];
    includeSoftDeleted?: boolean;
  }): Promise<PaginatedResponse<Select${Type} | Partial<Select${Type}>>> {
    return this.post<PaginatedResponse<Select${Type} & { _similarity?: number }${hasVectorColumns ? ' & { _distance?: number }' : ''}>>(\`\${this.resource}/list\`, params ?? {});
  }`}

${hasJsonbColumns ? `  /**
   * Update a ${table.name} record by primary key with field selection
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @param patch - Partial data to update
   * @param options - Select specific fields to return
   * @returns The updated record with only selected fields if found, null otherwise
   */
  async update<TJsonb extends Partial<Select${Type}> = {}>(pk: ${pkType}, patch: NoInfer<Update${Type}<TJsonb>>, options: { select: string[] }): Promise<Partial<Select${Type}<TJsonb>> | null>;
  /**
   * Update a ${table.name} record by primary key with field exclusion
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @param patch - Partial data to update
   * @param options - Exclude specific fields from return
   * @returns The updated record without excluded fields if found, null otherwise
   */
  async update<TJsonb extends Partial<Select${Type}> = {}>(pk: ${pkType}, patch: NoInfer<Update${Type}<TJsonb>>, options: { exclude: string[] }): Promise<Partial<Select${Type}<TJsonb>> | null>;
  /**
   * Update a ${table.name} record by primary key
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @param patch - Partial data to update
   * @returns The updated record with all fields if found, null otherwise
   * @example
   * // With JSONB type override:
   * const user = await client.update<{ metadata: Metadata }>('user-id', { metadata: { tags: ['new'] } });
   */
  async update<TJsonb extends Partial<Select${Type}> = {}>(pk: ${pkType}, patch: NoInfer<Update${Type}<TJsonb>>, options?: Omit<{ select?: string[]; exclude?: string[] }, 'select' | 'exclude'>): Promise<Select${Type}<TJsonb> | null>;
  async update<TJsonb extends Partial<Select${Type}> = {}>(
    pk: ${pkType},
    patch: NoInfer<Update${Type}<TJsonb>>,
    options?: { select?: string[]; exclude?: string[] }
  ): Promise<Select${Type}<TJsonb> | Partial<Select${Type}<TJsonb>> | null> {
    const path = ${pkPathExpr};
    const queryParams = new URLSearchParams();
    if (options?.select) queryParams.set('select', options.select.join(','));
    if (options?.exclude) queryParams.set('exclude', options.exclude.join(','));
    const query = queryParams.toString();
    const url = query ? \`\${this.resource}/\${path}?\${query}\` : \`\${this.resource}/\${path}\`;
    return this.patch<Select${Type}<TJsonb> | null>(url, patch);
  }` : `  /**
   * Update a ${table.name} record by primary key with field selection
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @param patch - Partial data to update
   * @param options - Select specific fields to return
   * @returns The updated record with only selected fields if found, null otherwise
   */
  async update(pk: ${pkType}, patch: Update${Type}, options: { select: string[] }): Promise<Partial<Select${Type}> | null>;
  /**
   * Update a ${table.name} record by primary key with field exclusion
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @param patch - Partial data to update
   * @param options - Exclude specific fields from return
   * @returns The updated record without excluded fields if found, null otherwise
   */
  async update(pk: ${pkType}, patch: Update${Type}, options: { exclude: string[] }): Promise<Partial<Select${Type}> | null>;
  /**
   * Update a ${table.name} record by primary key
   * @param pk - The primary key value${hasCompositePk ? 's' : ''}
   * @param patch - Partial data to update
   * @returns The updated record with all fields if found, null otherwise
   */
  async update(pk: ${pkType}, patch: Update${Type}, options?: Omit<{ select?: string[]; exclude?: string[] }, 'select' | 'exclude'>): Promise<Select${Type} | null>;
  async update(
    pk: ${pkType},
    patch: Update${Type},
    options?: { select?: string[]; exclude?: string[] }
  ): Promise<Select${Type} | Partial<Select${Type}> | null> {
    const path = ${pkPathExpr};
    const queryParams = new URLSearchParams();
    if (options?.select) queryParams.set('select', options.select.join(','));
    if (options?.exclude) queryParams.set('exclude', options.exclude.join(','));
    const query = queryParams.toString();
    const url = query ? \`\${this.resource}/\${path}?\${query}\` : \`\${this.resource}/\${path}\`;
    return this.patch<Select${Type} | null>(url, patch);
  }`}

${deleteMethodsCode}

  /** Build a lazy CREATE descriptor for use with sdk.$transaction([...]) */
  $create(data: Insert${Type}): TxOp<Select${Type}> {
    return { _table: "${table.name}", _op: "create", _data: data as Record<string, unknown> };
  }

  /** Build a lazy UPDATE descriptor for use with sdk.$transaction([...]) */
  $update(pk: ${pkType}, data: Update${Type}): TxOp<Select${Type} | null> {
    return { _table: "${table.name}", _op: "update", _pk: ${hasCompositePk ? 'pk as Record<string, unknown>' : 'pk'}, _data: data as Record<string, unknown> };
  }

${txDeleteMethodsCode}

  /** Build a lazy UPSERT descriptor for use with sdk.$transaction([...]) */
  $upsert(args: { where: Update${Type}; create: Insert${Type}; update: Update${Type} }): TxOp<Select${Type}> {
    return { _table: "${table.name}", _op: "upsert", _data: args as Record<string, unknown> };
  }
${includeMethodsCode}}
`;
}

export function emitClientIndex(
  tables: Table[],
  useJsExtensions?: boolean,
  graph?: Graph,
  includeOpts?: { maxDepth: number; skipJunctionTables: boolean }
) {
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
  
  // Import BaseClient (for SDK to extend) + auth/TxOp types
  out += `import { BaseClient } from "./base-client${ext}";\n`;
  out += `import type { AuthConfig, TxOp } from "./base-client${ext}";\n`;
  
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
  out += `export class SDK extends BaseClient {\n`;
  for (const t of tables) {
    out += `  public ${t.name}: ${pascal(t.name)}Client;\n`;
  }
  out += `\n  constructor(cfg: { baseUrl: string; fetch?: typeof fetch; auth?: AuthConfig }) {\n`;
  out += `    const f = cfg.fetch ?? fetch;\n`;
  out += `    super(cfg.baseUrl, f, cfg.auth);\n`;
  for (const t of tables) {
    out += `    this.${t.name} = new ${pascal(t.name)}Client(cfg.baseUrl, f, cfg.auth);\n`;
  }
  out += `  }\n`;
  out += `\n`;
  out += `  /**\n`;
  out += `   * Execute multiple operations atomically in one PostgreSQL transaction.\n`;
  out += `   * All ops are validated before BEGIN is issued — fail-fast on bad input.\n`;
  out += `   *\n`;
  out += `   * @example\n`;
  out += `   * const [order, user] = await sdk.$transaction([\n`;
  out += `   *   sdk.orders.$create({ user_id: 1, total: 99 }),\n`;
  out += `   *   sdk.users.$update('1', { last_order_at: new Date().toISOString() }),\n`;
  out += `   * ]);\n`;
  out += `   */\n`;
  out += `  async $transaction<const T extends readonly TxOp<unknown>[]>(\n`;
  out += `    ops: [...T]\n`;
  out += `  ): Promise<{ [K in keyof T]: T[K] extends TxOp<infer R> ? R : never }> {\n`;
  out += `    const payload = ops.map(op => ({\n`;
  out += `      op: op._op,\n`;
  out += `      table: op._table,\n`;
  out += `      ...(op._data !== undefined ? { data: op._data } : {}),\n`;
  out += `      ...(op._pk !== undefined ? { pk: op._pk } : {}),\n`;
  out += `    }));\n`;
  out += `\n`;
  out += `    const res = await this.fetchFn(\`\${this.baseUrl}/v1/transaction\`, {\n`;
  out += `      method: "POST",\n`;
  out += `      headers: await this.headers(true),\n`;
  out += `      body: JSON.stringify({ ops: payload }),\n`;
  out += `    });\n`;
  out += `\n`;
  out += `    if (!res.ok) {\n`;
  out += `      let errBody: Record<string, unknown> = {};\n`;
  out += `      try { errBody = await res.json() as Record<string, unknown>; } catch {}\n`;
  out += `      const err = Object.assign(\n`;
  out += `        new Error((errBody.error as string | undefined) ?? \`$transaction failed: \${res.status}\`),\n`;
  out += `        { failedAt: errBody.failedAt as number | undefined, issues: errBody.issues }\n`;
  out += `      );\n`;
  out += `      throw err;\n`;
  out += `    }\n`;
  out += `\n`;
  out += `    const json = await res.json() as { results: unknown[] };\n`;
  out += `    return json.results as unknown as { [K in keyof T]: T[K] extends TxOp<infer R> ? R : never };\n`;
  out += `  }\n`;
  out += `}\n\n`;
  
  // Export base client + TxOp for extension/advanced usage
  out += `export { BaseClient } from "./base-client${ext}";\n`;
  out += `export type { TxOp } from "./base-client${ext}";\n`;

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

  // Export named include result types (e.g. SelectBooksWithAuthor)
  if (graph && includeOpts) {
    const opts = { maxDepth: includeOpts.maxDepth, skipJunctionTables: includeOpts.skipJunctionTables };
    for (const t of tables) {
      const methods = generateIncludeMethods(t, graph, opts, tables);
      const seenTypeNames = new Set<string>();
      const typeNames: string[] = [];
      for (const method of methods) {
        if (!seenTypeNames.has(method.typeName)) {
          seenTypeNames.add(method.typeName);
          typeNames.push(method.typeName);
        }
      }
      if (typeNames.length > 0) {
        out += `export type { ${typeNames.join(", ")} } from "./${t.name}${ext}";\n`;
      }
    }
  }

  return out;
}