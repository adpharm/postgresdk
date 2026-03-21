import type { Column, Table, Model } from "./introspect";
import type { Config, AuthConfig } from "./types";
import { getAuthStrategy } from "./types";
import type { Graph } from "./rel-classify";
import { pascal } from "./utils";
import { generateIncludeMethods } from "./emit-include-methods";

export interface UnifiedContract {
  version: string;
  description: string;
  sdk: {
    initialization: SDKInitExample[];
    authentication: SDKAuthExample[];
  };
  resources: ResourceWithSDK[];
  relationships: RelationshipContract[];
}

export interface SDKInitExample {
  description: string;
  code: string;
}

export interface SDKAuthExample {
  strategy: string;
  description: string;
  code: string;
}

export interface ResourceWithSDK {
  name: string;
  tableName: string;
  description: string;
  sdk: {
    client: string;
    methods: SDKMethod[];
  };
  api: {
    endpoints: EndpointContract[];
  };
  fields: FieldContract[];
}

export interface SDKMethod {
  name: string;
  signature: string;
  description: string;
  example?: string;
  correspondsTo?: string; // API endpoint
}

export interface EndpointContract {
  method: string;
  path: string;
  description: string;
  requestBody?: string;
  responseBody?: string;
  queryParameters?: Record<string, string>;
}

export interface FieldContract {
  name: string;
  type: string;
  tsType: string; // TypeScript type
  required: boolean;
  description: string;
  foreignKey?: {
    table: string;
    field: string;
  };
}

export interface RelationshipContract {
  from: string;
  to: string;
  type: "one-to-many" | "many-to-one" | "many-to-many";
  description: string;
}

/**
 * Generate a unified contract showing both API and SDK usage
 */
export function generateUnifiedContract(model: Model, config: Config & { auth?: AuthConfig }, graph?: Graph): UnifiedContract {
  const resources: ResourceWithSDK[] = [];
  const relationships: RelationshipContract[] = [];
  
  // Process each table
  const tables = Object.values(model.tables);
  if (process.env.SDK_DEBUG) {
    console.log(`[SDK Contract] Processing ${tables.length} tables`);
  }
  for (const table of tables) {
    resources.push(generateResourceWithSDK(table, model, graph, config));
    
    // Extract relationships
    for (const fk of table.fks) {
      relationships.push({
        from: table.name,
        to: fk.toTable,
        type: "many-to-one",
        description: `Each ${table.name} belongs to one ${fk.toTable}`
      });
    }
  }
  
  // Build the complete contract
  const contract: UnifiedContract = {
    version: "2.0.0",
    description: "Unified API and SDK contract - your one-stop reference for all operations",
    sdk: {
      initialization: generateSDKInitExamples(),
      authentication: generateSDKAuthExamples(config.auth)
    },
    resources,
    relationships
  };

  return contract;
}

function generateSDKInitExamples(): SDKInitExample[] {
  return [
    {
      description: "Basic initialization",
      code: `import { SDK } from './client';

const sdk = new SDK({
  baseUrl: 'http://localhost:3000'
});`
    },
    {
      description: "With authentication",
      code: `import { SDK } from './client';

const sdk = new SDK({
  baseUrl: 'https://api.example.com',
  auth: {
    apiKey: process.env.API_KEY
  }
});`
    },
    {
      description: "With custom fetch (for Node.js < 18)",
      code: `import { SDK } from './client';
import fetch from 'node-fetch';

const sdk = new SDK({
  baseUrl: 'https://api.example.com',
  fetch: fetch as any
});`
    }
  ];
}

function generateSDKAuthExamples(auth?: AuthConfig): SDKAuthExample[] {
  const examples: SDKAuthExample[] = [];
  const strategy = getAuthStrategy(auth);

  if (strategy === 'none') {
    examples.push({
      strategy: "none",
      description: "No authentication required",
      code: `const sdk = new SDK({
  baseUrl: 'http://localhost:3000'
});`
    });
  }

  if (strategy === 'api-key') {
    examples.push({
      strategy: "apiKey",
      description: "API Key authentication",
      code: `const sdk = new SDK({
  baseUrl: 'https://api.example.com',
  auth: {
    apiKey: 'your-api-key',
    apiKeyHeader: 'x-api-key' // optional, defaults to 'x-api-key'
  }
});`
    });
  }

  if (strategy === 'jwt-hs256') {
    examples.push({
      strategy: "jwt",
      description: "JWT Bearer token authentication",
      code: `const sdk = new SDK({
  baseUrl: 'https://api.example.com',
  auth: {
    jwt: 'your-jwt-token' // or async: () => getToken()
  }
});`
    });
    
    examples.push({
      strategy: "jwt-async",
      description: "JWT with async token provider",
      code: `const sdk = new SDK({
  baseUrl: 'https://api.example.com',
  auth: {
    jwt: async () => {
      const token = await refreshToken();
      return token;
    }
  }
});`
    });
  }
  
  examples.push({
    strategy: "custom",
    description: "Custom headers provider",
    code: `const sdk = new SDK({
  baseUrl: 'https://api.example.com',
  auth: async () => ({
    'Authorization': 'Bearer ' + await getToken(),
    'X-Request-ID': generateRequestId()
  })
});`
  });
  
  return examples;
}

function generateResourceWithSDK(table: Table, model: Model, graph?: Graph, config?: Config & { auth?: AuthConfig }): ResourceWithSDK {
  const Type = pascal(table.name);
  const tableName = table.name;
  const basePath = `/v1/${tableName}`;
  const hasSinglePK = table.pk.length === 1;
  const pkField = hasSinglePK ? table.pk[0] : 'id';
  const enums = model.enums || {};

  // Resolve effective soft delete column for this table (mirrors route emitter logic)
  const overrides = config?.delete?.softDeleteColumnOverrides;
  const resolvedSoftDeleteCol = overrides && tableName in overrides
    ? (overrides[tableName] ?? null)
    : (config?.delete?.softDeleteColumn ?? null);
  // Only emit soft delete docs if the column actually exists on this table
  const softDeleteCol = resolvedSoftDeleteCol && table.columns.some(c => c.name === resolvedSoftDeleteCol)
    ? resolvedSoftDeleteCol
    : null;
  const exposeHardDelete = config?.delete?.exposeHardDelete ?? true;

  const sdkMethods: SDKMethod[] = [];
  const endpoints: EndpointContract[] = [];
  
  // LIST method
  sdkMethods.push({
    name: "list",
    signature: `list(params?: ListParams): Promise<PaginatedResponse<${Type}>>`,
    description: `List ${tableName} with filtering, sorting, and pagination. Returns paginated results with metadata.`,
    example: `const result = await sdk.${tableName}.list({
  where: { ${table.columns[0]?.name || 'id'}: { $ilike: '%value%' } },
  orderBy: '${table.columns[0]?.name || 'created_at'}',
  order: 'desc',
  limit: 20,
  offset: 0${softDeleteCol ? `,\n  includeSoftDeleted: false` : ""}
}); // result.data, result.total, result.hasMore`,
    correspondsTo: `GET ${basePath}`
  });

  endpoints.push({
    method: "GET",
    path: basePath,
    description: `List all ${tableName} records with pagination metadata`,
    queryParameters: generateQueryParams(table, enums),
    responseBody: `PaginatedResponse<${Type}>`
  });
  
  // GET BY PK method (only if single PK)
  if (hasSinglePK) {
    sdkMethods.push({
      name: "getByPk",
      signature: `getByPk(${pkField}: string): Promise<${Type} | null>`,
      description: `Get a single ${tableName} by primary key`,
      example: `const item = await sdk.${tableName}.getByPk('id');${softDeleteCol ? `\nconst withDeleted = await sdk.${tableName}.getByPk('id', { includeSoftDeleted: true });` : ""} // null if not found`,
      correspondsTo: `GET ${basePath}/:${pkField}`
    });
    
    endpoints.push({
      method: "GET",
      path: `${basePath}/:${pkField}`,
      description: `Get ${tableName} by ID`,
      responseBody: `${Type}`
    });
  }
  
  // CREATE method
  sdkMethods.push({
    name: "create",
    signature: `create(data: Insert${Type}): Promise<${Type}>`,
    description: `Create a new ${tableName}`,
    example: `const created = await sdk.${tableName}.create({
  ${generateExampleFields(table, 'create')}
});`,
    correspondsTo: `POST ${basePath}`
  });
  
  endpoints.push({
    method: "POST",
    path: basePath,
    description: `Create new ${tableName}`,
    requestBody: `Insert${Type}`,
    responseBody: `${Type}`
  });
  
  // UPDATE method (only if single PK)
  if (hasSinglePK) {
    sdkMethods.push({
      name: "update",
      signature: `update(${pkField}: string, data: Update${Type}): Promise<${Type}>`,
      description: `Update an existing ${tableName}`,
      example: `const updated = await sdk.${tableName}.update('id', {
  ${generateExampleFields(table, 'update')}
});`,
      correspondsTo: `PATCH ${basePath}/:${pkField}`
    });
    
    endpoints.push({
      method: "PATCH",
      path: `${basePath}/:${pkField}`,
      description: `Update ${tableName}`,
      requestBody: `Update${Type}`,
      responseBody: `${Type}`
    });
  }
  
  // DELETE method(s)
  if (hasSinglePK) {
    if (softDeleteCol) {
      sdkMethods.push({
        name: "softDelete",
        signature: `softDelete(${pkField}: string): Promise<${Type}>`,
        description: `Soft-delete a ${tableName} (sets ${softDeleteCol})`,
        example: `const deleted = await sdk.${tableName}.softDelete('id');`,
        correspondsTo: `DELETE ${basePath}/:${pkField}`
      });
    }
    if (!softDeleteCol || exposeHardDelete) {
      sdkMethods.push({
        name: "hardDelete",
        signature: `hardDelete(${pkField}: string): Promise<${Type}>`,
        description: `Permanently delete a ${tableName}`,
        example: `const deleted = await sdk.${tableName}.hardDelete('id');`,
        correspondsTo: softDeleteCol
          ? `DELETE ${basePath}/:${pkField}?hard=true`
          : `DELETE ${basePath}/:${pkField}`
      });
    }

    endpoints.push({
      method: "DELETE",
      path: `${basePath}/:${pkField}`,
      description: softDeleteCol
        ? `Delete ${tableName} (soft-delete by default${exposeHardDelete ? '; add ?hard=true for permanent deletion' : ''})`
        : `Delete ${tableName}`,
      responseBody: `${Type}`
    });
  }
  
  // Add include methods if we have the graph
  if (graph && config) {
    const allTables = Object.values(model.tables);
    const includeMethods = generateIncludeMethods(table, graph, {
      maxDepth: config.includeMethodsDepth ?? 2,
      skipJunctionTables: config.skipJunctionTables ?? true
    }, allTables);
    
    for (const method of includeMethods) {
      const isGetByPk = method.name.startsWith("getByPk");
      sdkMethods.push({
        name: method.name,
        signature: `${method.name}(${isGetByPk ? `${pkField}: string` : 'params?: ListParams'}): ${method.returnType}`,
        description: `Get ${tableName} with included ${method.path.join(', ')} data`,
        correspondsTo: `POST ${basePath}/list`
      });
    }
  }
  
  // Process fields
  const fields = table.columns.map(col => generateFieldContract(col, table, enums));

  return {
    name: Type,
    tableName: tableName,
    description: `Resource for ${tableName} operations`,
    sdk: {
      client: `sdk.${tableName}`,
      methods: sdkMethods
    },
    api: {
      endpoints
    },
    fields
  };
}

function generateFieldContract(column: Column, table: Table, enums: Record<string, string[]>): FieldContract {
  const field: FieldContract = {
    name: column.name,
    type: postgresTypeToJsonType(column.pgType, enums),
    tsType: postgresTypeToTsType(column, enums),
    required: !column.nullable && !column.hasDefault,
    description: generateFieldDescription(column, table)
  };
  
  // Check if this is a foreign key
  const fk = table.fks.find(fk => 
    fk.from.length === 1 && fk.from[0] === column.name
  );
  
  if (fk) {
    field.foreignKey = {
      table: fk.toTable,
      field: fk.to[0] || "id"
    };
  }
  
  return field;
}

/** Shared base category for a postgres type, used by both TS and JSON type mappers. */
type PgBaseCategory = 'number' | 'boolean' | 'string' | 'string[]' | 'number[]' | 'date' | 'json' | 'uuid';

function pgTypeCategory(t: string): PgBaseCategory {
  switch (t) {
    case 'int': case 'int2': case 'int4': case 'int8':
    case 'integer': case 'smallint': case 'bigint':
    case 'decimal': case 'numeric':
    case 'real': case 'float4': case 'float8': case 'double precision': case 'float':
      return 'number';
    case 'boolean': case 'bool':
      return 'boolean';
    case 'date': case 'timestamp': case 'timestamptz':
      return 'date';
    case 'json': case 'jsonb':
      return 'json';
    case 'uuid':
      return 'uuid';
    case 'text[]': case 'varchar[]': case '_text': case '_varchar':
      return 'string[]';
    case 'int[]': case 'integer[]': case '_int': case '_int2': case '_int4': case '_int8': case '_integer':
      return 'number[]';
    case 'vector':
      return 'number[]';
    default:
      return 'string';
  }
}

function postgresTypeToTsType(column: Column, enums: Record<string, string[]>): string {
  const pgType = column.pgType.toLowerCase();

  if (enums[pgType]) {
    const enumType = enums[pgType].map(v => `"${v}"`).join(" | ");
    return column.nullable ? `${enumType} | null` : enumType;
  }

  const enumArrayValues = enums[pgType.slice(1)];
  if (pgType.startsWith("_") && enumArrayValues) {
    const arrayType = `(${enumArrayValues.map(v => `"${v}"`).join(" | ")})[]`;
    return column.nullable ? `${arrayType} | null` : arrayType;
  }

  const cat = pgTypeCategory(pgType);
  // date and uuid both serialize as strings in TS; json/jsonb map to JsonValue
  const baseType = cat === 'date' || cat === 'uuid' ? 'string' : cat === 'json' ? 'JsonValue' : cat;
  return column.nullable ? `${baseType} | null` : baseType;
}

function generateExampleFields(table: Table, operation: 'create' | 'update'): string {
  const fields: string[] = [];
  let count = 0;
  
  for (const col of table.columns) {
    // Skip auto-generated fields
    if (col.hasDefault && ['id', 'created_at', 'updated_at'].includes(col.name)) {
      continue;
    }
    
    // For updates, only show a few fields
    if (operation === 'update' && count >= 2) {
      break;
    }
    
    // Skip nullable fields for brevity in examples
    if (operation === 'create' && col.nullable && count >= 3) {
      continue;
    }
    
    const value = generateExampleValue(col);
    fields.push(`  ${col.name}: ${value}`);
    count++;
  }
  
  return fields.join(',\n');
}

function generateExampleValue(column: Column): string {
  const name = column.name.toLowerCase();
  
  if (name.includes('email')) return `'user@example.com'`;
  if (name.includes('name')) return `'John Doe'`;
  if (name.includes('title')) return `'Example Title'`;
  if (name.includes('description')) return `'Example description'`;
  if (name.includes('phone')) return `'+1234567890'`;
  if (name.includes('url')) return `'https://example.com'`;
  if (name.includes('price') || name.includes('amount')) return `99.99`;
  if (name.includes('quantity') || name.includes('count')) return `10`;
  if (name.includes('status')) return `'active'`;
  if (name.includes('_id')) return `'related-id-123'`;
  
  switch (column.pgType) {
    case 'boolean':
    case 'bool':
      return 'true';
    case 'int':
    case 'integer':
    case 'smallint':
    case 'bigint':
      return '42';
    case 'decimal':
    case 'numeric':
    case 'real':
    case 'double precision':
    case 'float':
      return '123.45';
    case 'date':
      return `'2024-01-01'`;
    case 'timestamp':
    case 'timestamptz':
      return `'2024-01-01T00:00:00Z'`;
    case 'json':
    case 'jsonb':
      return `{ key: 'value' }`;
    case 'uuid':
      return `'123e4567-e89b-12d3-a456-426614174000'`;
    default:
      return `'example value'`;
  }
}

function generateQueryParams(table: Table, enums: Record<string, string[]>): Record<string, string> {
  const params: Record<string, string> = {
    limit: "number - Max records to return (default: 50)",
    offset: "number - Records to skip",
    orderBy: "string | string[] - Field(s) to sort by",
    order: "'asc' | 'desc' | ('asc' | 'desc')[] - Sort direction(s)"
  };

  // Add a few example filters
  let filterCount = 0;
  for (const col of table.columns) {
    if (filterCount >= 3) break; // Limit examples for readability

    const type = postgresTypeToJsonType(col.pgType, enums);
    params[col.name] = `${type} - Filter by ${col.name}`;

    if (type === 'string') {
      params[`${col.name}_like`] = `string - Search in ${col.name}`;
    } else if (type === 'number' || type === 'date/datetime') {
      params[`${col.name}_gt`] = `${type} - Greater than`;
      params[`${col.name}_lt`] = `${type} - Less than`;
    }

    filterCount++;
  }

  params['...'] = "Additional filters for all fields";

  return params;
}

function postgresTypeToJsonType(pgType: string, enums: Record<string, string[]>): string {
  const t = pgType.toLowerCase();
  if (enums[t]) return t;
  if (t.startsWith("_") && enums[t.slice(1)]) return `${t.slice(1)}[]`;

  const cat = pgTypeCategory(t);
  return cat === 'date' ? 'date/datetime' : cat === 'json' ? 'object' : cat;
}

function generateFieldDescription(column: Column, table: Table): string {
  if (column.name === 'id') return "Primary key";
  if (column.name === 'created_at') return "Creation timestamp";
  if (column.name === 'updated_at') return "Last update timestamp";
  if (column.name === 'deleted_at') return "Soft delete timestamp";
  if (column.name.endsWith('_id')) return `Foreign key to ${column.name.slice(0, -3)}`;
  return column.name.replace(/_/g, ' ');
}

/**
 * Generate markdown documentation for the unified contract
 */
export function generateUnifiedContractMarkdown(contract: UnifiedContract): string {
  const lines: string[] = [];
  
  lines.push("# API & SDK Contract");
  lines.push("");
  lines.push(contract.description);
  lines.push("");
  lines.push(`**Version:** ${contract.version}`);
  lines.push("");
  
  // SDK Initialization
  lines.push("## SDK Setup");
  lines.push("");
  lines.push("### Installation");
  lines.push("");
  lines.push("```bash");
  lines.push("# The SDK is generated in the client/ directory");
  lines.push("# Import it directly from your generated code");
  lines.push("```");
  lines.push("");
  
  lines.push("### Initialization");
  lines.push("");
  for (const example of contract.sdk.initialization) {
    lines.push(`**${example.description}:**`);
    lines.push("");
    lines.push("```typescript");
    lines.push(example.code);
    lines.push("```");
    lines.push("");
  }
  
  if (contract.sdk.authentication.length > 0) {
    lines.push("### Authentication");
    lines.push("");
    for (const auth of contract.sdk.authentication) {
      lines.push(`**${auth.description}:**`);
      lines.push("");
      lines.push("```typescript");
      lines.push(auth.code);
      lines.push("```");
      lines.push("");
    }
  }

  lines.push(`## Filtering

Type-safe WHERE clauses. Root-level keys are AND'd; use \`$or\`/\`$and\` for logic (2 levels max).

\`\`\`typescript
await sdk.users.list({
  where: {
    status:     { $in: ['active', 'pending'] },
    age:        { $gte: 18, $lt: 65 },
    email:      { $ilike: '%@company.com' },
    deleted_at: { $is: null },
    meta:       { $jsonbContains: { tag: 'vip' } },
    $or: [{ role: 'admin' }, { role: 'mod' }]
  }
});
\`\`\`

| Operator | SQL | Types |
|----------|-----|-------|
| \`$eq\` \`$ne\` | = ≠ | All |
| \`$gt\` \`$gte\` \`$lt\` \`$lte\` | > ≥ < ≤ | Number, Date |
| \`$in\` \`$nin\` | IN / NOT IN | All |
| \`$like\` \`$ilike\` | LIKE / ILIKE | String |
| \`$is\` \`$isNot\` | IS NULL / IS NOT NULL | Nullable |
| \`$jsonbContains\` \`$jsonbContainedBy\` \`$jsonbHasKey\` \`$jsonbHasAnyKeys\` \`$jsonbHasAllKeys\` \`$jsonbPath\` | JSONB ops | JSONB |
| \`$or\` \`$and\` | OR / AND (2 levels) | — |

## Sorting

\`orderBy\` accepts a column name or array; \`order\` accepts \`'asc'\`/\`'desc'\` or a per-column array.

\`\`\`typescript
await sdk.users.list({ orderBy: ['status', 'created_at'], order: ['asc', 'desc'] });
\`\`\`

## Vector Search

For tables with \`vector\` columns (requires pgvector). Results include a \`_distance\` field.

\`\`\`typescript
const results = await sdk.embeddings.list({
  vector: { field: 'embedding', query: [0.1, 0.2, 0.3, /* ... */], metric: 'cosine', maxDistance: 0.5 },
  where: { status: 'published' },
  limit: 10
}); // results.data[0]._distance
\`\`\`
`);

  // Resources
  lines.push("## Resources");
  lines.push("");
  
  for (const resource of contract.resources) {
    lines.push(`### ${resource.name}`);
    lines.push("");
    lines.push(resource.description);
    lines.push("");
    
    // SDK Methods
    lines.push("#### SDK Methods");
    lines.push("");
    lines.push(`Access via: \`${resource.sdk.client}\``);
    lines.push("");
    
    for (const method of resource.sdk.methods) {
      lines.push(`**${method.name}**`);
      lines.push(`- Signature: \`${method.signature}\``);
      lines.push(`- ${method.description}`);
      if (method.correspondsTo) {
        lines.push(`- API: \`${method.correspondsTo}\``);
      }
      lines.push("");
      if (method.example) {
        lines.push("```typescript");
        lines.push(method.example);
        lines.push("```");
        lines.push("");
      }
    }
    
    // API Endpoints
    lines.push("#### API Endpoints");
    lines.push("");
    for (const endpoint of resource.api.endpoints) {
      lines.push(`- \`${endpoint.method} ${endpoint.path}\``);
      lines.push(`  - ${endpoint.description}`);
      if (endpoint.requestBody) {
        lines.push(`  - Request: \`${endpoint.requestBody}\``);
      }
      if (endpoint.responseBody) {
        lines.push(`  - Response: \`${endpoint.responseBody}\``);
      }
    }
    lines.push("");
    
    // Fields
    lines.push("#### Fields");
    lines.push("");
    lines.push("| Field | Type | TypeScript | Required | Description |");
    lines.push("|-------|------|------------|----------|-------------|");
    
    for (const field of resource.fields) {
      const required = field.required ? "✓" : "";
      const fk = field.foreignKey ? ` → ${field.foreignKey.table}` : "";
      lines.push(`| ${field.name} | ${field.type} | \`${field.tsType}\` | ${required} | ${field.description}${fk} |`);
    }
    lines.push("");
  }
  
  // Relationships
  if (contract.relationships.length > 0) {
    lines.push("## Relationships");
    lines.push("");
    for (const rel of contract.relationships) {
      lines.push(`- **${rel.from}** → **${rel.to}** (${rel.type}): ${rel.description}`);
    }
    lines.push("");
  }
  
  lines.push(`## Type Imports

\`\`\`typescript
import { SDK } from './client';
import type { SelectTableName, InsertTableName, UpdateTableName } from './client/types/table_name';
import type * as Types from './client/types';
\`\`\`
`);
  
  return lines.join("\n");
}

/**
 * Emit the unified contract as TypeScript code
 */
export function emitUnifiedContract(model: Model, config: Config & { auth?: AuthConfig }, graph?: Graph): string {
  const contract = generateUnifiedContract(model, config, graph);
  const contractJson = JSON.stringify(contract, null, 2);
  
  return `/**
 * Unified API & SDK Contract
 * 
 * This module exports a comprehensive contract that describes both
 * API endpoints and SDK usage for all resources.
 * 
 * Use this as your primary reference for:
 * - SDK initialization and authentication
 * - Available methods and their signatures
 * - API endpoints and parameters
 * - Type definitions and relationships
 */

export const contract = ${contractJson};

export const contractMarkdown = \`${generateUnifiedContractMarkdown(contract).replace(/`/g, '\\`')}\`;

/**
 * Get the contract in different formats
 */
export function getContract(format: 'json' | 'markdown' = 'json') {
  if (format === 'markdown') {
    return contractMarkdown;
  }
  return contract;
}

/**
 * Quick reference for all SDK clients
 */
export const sdkClients = ${JSON.stringify(
  contract.resources.map(r => ({
    name: r.tableName,
    client: r.sdk.client,
    methods: r.sdk.methods.map(m => m.name)
  })),
  null,
  2
)};

/**
 * Type export reference
 */
export const typeImports = \`
// Import the SDK
import { SDK } from './client';

// Import types for a specific resource
${contract.resources.slice(0, 1).map(r => `import type { Select${r.name}, Insert${r.name}, Update${r.name} } from './client/types/${r.tableName}';`).join('\n')}

// Import all types
import type * as Types from './client/types';
\`;
`;
}