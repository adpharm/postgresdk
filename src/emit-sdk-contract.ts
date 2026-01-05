import type { Table, Model } from "./introspect";
import type { Config, AuthConfig } from "./types";
import { getAuthStrategy } from "./types";
import type { Graph } from "./rel-classify";
import { pascal } from "./utils";
import { generateIncludeMethods } from "./emit-include-methods";

export interface UnifiedContract {
  version: string;
  generatedAt: string;
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
  example: string;
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
  const tables = model && model.tables ? Object.values(model.tables) : [];
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
    generatedAt: new Date().toISOString(),
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
  
  const sdkMethods: SDKMethod[] = [];
  const endpoints: EndpointContract[] = [];
  
  // LIST method
  sdkMethods.push({
    name: "list",
    signature: `list(params?: ListParams): Promise<PaginatedResponse<${Type}>>`,
    description: `List ${tableName} with filtering, sorting, and pagination. Returns paginated results with metadata.`,
    example: `// Get all ${tableName}
const result = await sdk.${tableName}.list();
console.log(result.data);        // array of records
console.log(result.total);       // total matching records
console.log(result.hasMore);     // true if more pages available

// With filters and pagination
const filtered = await sdk.${tableName}.list({
  limit: 20,
  offset: 0,
  where: { ${table.columns[0]?.name || 'field'}: { $like: '%search%' } },
  orderBy: '${table.columns[0]?.name || 'created_at'}',
  order: 'desc'
});

// Calculate total pages
const totalPages = Math.ceil(filtered.total / filtered.limit);
const currentPage = Math.floor(filtered.offset / filtered.limit) + 1;`,
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
      example: `// Get by ID
const item = await sdk.${tableName}.getByPk('123e4567-e89b-12d3-a456-426614174000');

// Check if exists
if (item === null) {
  console.log('Not found');
}`,
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
    example: `import type { Insert${Type} } from './client/types/${tableName}';

const newItem: Insert${Type} = {
  ${generateExampleFields(table, 'create')}
};

const created = await sdk.${tableName}.create(newItem);
console.log('Created:', created.${pkField});`,
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
      example: `import type { Update${Type} } from './client/types/${tableName}';

const updates: Update${Type} = {
  ${generateExampleFields(table, 'update')}
};

const updated = await sdk.${tableName}.update('123', updates);`,
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
  
  // DELETE method
  if (hasSinglePK) {
    sdkMethods.push({
      name: "delete",
      signature: `delete(${pkField}: string): Promise<${Type}>`,
      description: `Delete a ${tableName}`,
      example: `const deleted = await sdk.${tableName}.delete('123');
console.log('Deleted:', deleted);`,
      correspondsTo: `DELETE ${basePath}/:${pkField}`
    });
    
    endpoints.push({
      method: "DELETE",
      path: `${basePath}/:${pkField}`,
      description: `Delete ${tableName}`,
      responseBody: `${Type}`
    });
  }
  
  // Add include methods if we have the graph
  if (graph && config) {
    const allTables = model && model.tables ? Object.values(model.tables) : undefined;
    const includeMethods = generateIncludeMethods(table, graph, {
      maxDepth: config.includeMethodsDepth ?? 2,
      skipJunctionTables: config.skipJunctionTables ?? true
    }, allTables);
    
    for (const method of includeMethods) {
      const isGetByPk = method.name.startsWith("getByPk");
      const exampleCall = isGetByPk
        ? `const result = await sdk.${tableName}.${method.name}('123e4567-e89b-12d3-a456-426614174000');`
        : `const result = await sdk.${tableName}.${method.name}();
console.log(result.data);    // array of records with includes
console.log(result.total);   // total count
console.log(result.hasMore); // more pages available

// With filters and pagination
const filtered = await sdk.${tableName}.${method.name}({
  limit: 20,
  offset: 0,
  where: { /* filter conditions */ }
});`;

      sdkMethods.push({
        name: method.name,
        signature: `${method.name}(${isGetByPk ? `${pkField}: string` : 'params?: ListParams'}): ${method.returnType}`,
        description: `Get ${tableName} with included ${method.path.join(', ')} data`,
        example: exampleCall,
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

function generateFieldContract(column: any, table: Table, enums: Record<string, string[]>): FieldContract {
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

function postgresTypeToTsType(column: any, enums: Record<string, string[]>): string {
  const pgType = column.pgType.toLowerCase();

  // Check if this is an enum type
  if (enums[pgType]) {
    const enumType = enums[pgType].map(v => `"${v}"`).join(" | ");
    if (column.nullable) {
      return `${enumType} | null`;
    }
    return enumType;
  }

  // Check if this is an array of enums
  if (pgType.startsWith("_")) {
    const enumName = pgType.slice(1);
    const enumValues = enums[enumName];
    if (enumValues) {
      const enumType = enumValues.map(v => `"${v}"`).join(" | ");
      const arrayType = `(${enumType})[]`;
      if (column.nullable) {
        return `${arrayType} | null`;
      }
      return arrayType;
    }
  }

  const baseType = (() => {
    switch (pgType) {
      case 'int':
      case 'int2':
      case 'int4':
      case 'int8':
      case 'integer':
      case 'smallint':
      case 'bigint':
      case 'decimal':
      case 'numeric':
      case 'real':
      case 'float4':
      case 'float8':
      case 'double precision':
      case 'float':
        return 'number';
      case 'boolean':
      case 'bool':
        return 'boolean';
      case 'date':
      case 'timestamp':
      case 'timestamptz':
        return 'string'; // ISO date string
      case 'json':
      case 'jsonb':
        return 'Record<string, any>';
      case 'uuid':
        return 'string';
      case 'text[]':
      case 'varchar[]':
      case '_text':
      case '_varchar':
        return 'string[]';
      case 'int[]':
      case 'integer[]':
      case '_int':
      case '_int2':
      case '_int4':
      case '_int8':
      case '_integer':
        return 'number[]';
      default:
        return 'string';
    }
  })();

  if (column.nullable) {
    return `${baseType} | null`;
  }
  return baseType;
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

function generateExampleValue(column: any): string {
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

  // Check if this is an enum type
  if (enums[t]) {
    return t; // Return the enum name
  }

  // Check if this is an array of enums
  if (t.startsWith("_") && enums[t.slice(1)]) {
    return `${t.slice(1)}[]`;
  }

  switch (t) {
    case 'int':
    case 'int2':
    case 'int4':
    case 'int8':
    case 'integer':
    case 'smallint':
    case 'bigint':
    case 'decimal':
    case 'numeric':
    case 'real':
    case 'float4':
    case 'float8':
    case 'double precision':
    case 'float':
      return 'number';
    case 'boolean':
    case 'bool':
      return 'boolean';
    case 'date':
    case 'timestamp':
    case 'timestamptz':
      return 'date/datetime';
    case 'json':
    case 'jsonb':
      return 'object';
    case 'uuid':
      return 'uuid';
    case 'text[]':
    case 'varchar[]':
    case '_text':
    case '_varchar':
      return 'string[]';
    case 'int[]':
    case 'integer[]':
    case '_int':
    case '_int2':
    case '_int4':
    case '_int8':
    case '_integer':
      return 'number[]';
    default:
      return 'string';
  }
}

function generateFieldDescription(column: any, table: Table): string {
  const descriptions: string[] = [];
  
  // Special fields
  if (column.name === 'id') {
    descriptions.push("Primary key");
  } else if (column.name === 'created_at') {
    descriptions.push("Creation timestamp");
  } else if (column.name === 'updated_at') {
    descriptions.push("Last update timestamp");
  } else if (column.name === 'deleted_at') {
    descriptions.push("Soft delete timestamp");
  } else if (column.name.endsWith('_id')) {
    const relatedTable = column.name.slice(0, -3);
    descriptions.push(`Foreign key to ${relatedTable}`);
  } else {
    descriptions.push(column.name.replace(/_/g, ' '));
  }
  
  return descriptions.join(", ");
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
  lines.push(`**Generated:** ${new Date(contract.generatedAt).toLocaleString()}`);
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

  // WHERE Clause Filtering
  lines.push("## Filtering with WHERE Clauses");
  lines.push("");
  lines.push("The SDK provides type-safe WHERE clause filtering with support for various operators.");
  lines.push("");
  lines.push("### Basic Filtering");
  lines.push("");
  lines.push("**Direct equality:**");
  lines.push("");
  lines.push("```typescript");
  lines.push("// Find users with specific email");
  lines.push("const users = await sdk.users.list({");
  lines.push("  where: { email: 'user@example.com' }");
  lines.push("});");
  lines.push("");
  lines.push("// Multiple conditions (AND)");
  lines.push("const activeUsers = await sdk.users.list({");
  lines.push("  where: {");
  lines.push("    status: 'active',");
  lines.push("    role: 'admin'");
  lines.push("  }");
  lines.push("});");
  lines.push("```");
  lines.push("");
  lines.push("### Comparison Operators");
  lines.push("");
  lines.push("Use comparison operators for numeric, date, and other comparable fields:");
  lines.push("");
  lines.push("```typescript");
  lines.push("// Greater than / Less than");
  lines.push("const adults = await sdk.users.list({");
  lines.push("  where: { age: { $gt: 18 } }");
  lines.push("});");
  lines.push("");
  lines.push("// Range queries");
  lines.push("const workingAge = await sdk.users.list({");
  lines.push("  where: {");
  lines.push("    age: { $gte: 18, $lte: 65 }");
  lines.push("  }");
  lines.push("});");
  lines.push("");
  lines.push("// Not equal");
  lines.push("const notPending = await sdk.orders.list({");
  lines.push("  where: { status: { $ne: 'pending' } }");
  lines.push("});");
  lines.push("```");
  lines.push("");
  lines.push("### String Operators");
  lines.push("");
  lines.push("Pattern matching for string fields:");
  lines.push("");
  lines.push("```typescript");
  lines.push("// Case-sensitive LIKE");
  lines.push("const johnsmiths = await sdk.users.list({");
  lines.push("  where: { name: { $like: '%Smith%' } }");
  lines.push("});");
  lines.push("");
  lines.push("// Case-insensitive ILIKE");
  lines.push("const gmailUsers = await sdk.users.list({");
  lines.push("  where: { email: { $ilike: '%@gmail.com' } }");
  lines.push("});");
  lines.push("```");
  lines.push("");
  lines.push("### Array Operators");
  lines.push("");
  lines.push("Filter by multiple possible values:");
  lines.push("");
  lines.push("```typescript");
  lines.push("// IN - match any value in array");
  lines.push("const specificUsers = await sdk.users.list({");
  lines.push("  where: {");
  lines.push("    id: { $in: ['id1', 'id2', 'id3'] }");
  lines.push("  }");
  lines.push("});");
  lines.push("");
  lines.push("// NOT IN - exclude values");
  lines.push("const nonSystemUsers = await sdk.users.list({");
  lines.push("  where: {");
  lines.push("    role: { $nin: ['admin', 'system'] }");
  lines.push("  }");
  lines.push("});");
  lines.push("```");
  lines.push("");
  lines.push("### NULL Checks");
  lines.push("");
  lines.push("Check for null or non-null values:");
  lines.push("");
  lines.push("```typescript");
  lines.push("// IS NULL");
  lines.push("const activeRecords = await sdk.records.list({");
  lines.push("  where: { deleted_at: { $is: null } }");
  lines.push("});");
  lines.push("");
  lines.push("// IS NOT NULL");
  lines.push("const deletedRecords = await sdk.records.list({");
  lines.push("  where: { deleted_at: { $isNot: null } }");
  lines.push("});");
  lines.push("```");
  lines.push("");
  lines.push("### Combining Operators");
  lines.push("");
  lines.push("Mix multiple operators for complex queries:");
  lines.push("");
  lines.push("```typescript");
  lines.push("const filteredUsers = await sdk.users.list({");
  lines.push("  where: {");
  lines.push("    age: { $gte: 18, $lt: 65 },");
  lines.push("    email: { $ilike: '%@company.com' },");
  lines.push("    status: { $in: ['active', 'pending'] },");
  lines.push("    deleted_at: { $is: null }");
  lines.push("  },");
  lines.push("  limit: 50,");
  lines.push("  offset: 0");
  lines.push("});");
  lines.push("```");
  lines.push("");
  lines.push("### Available Operators");
  lines.push("");
  lines.push("| Operator | Description | Example | Types |");
  lines.push("|----------|-------------|---------|-------|");
  lines.push("| `$eq` | Equal to | `{ age: { $eq: 25 } }` | All |");
  lines.push("| `$ne` | Not equal to | `{ status: { $ne: 'inactive' } }` | All |");
  lines.push("| `$gt` | Greater than | `{ price: { $gt: 100 } }` | Number, Date |");
  lines.push("| `$gte` | Greater than or equal | `{ age: { $gte: 18 } }` | Number, Date |");
  lines.push("| `$lt` | Less than | `{ quantity: { $lt: 10 } }` | Number, Date |");
  lines.push("| `$lte` | Less than or equal | `{ age: { $lte: 65 } }` | Number, Date |");
  lines.push("| `$in` | In array | `{ id: { $in: ['a', 'b'] } }` | All |");
  lines.push("| `$nin` | Not in array | `{ role: { $nin: ['admin'] } }` | All |");
  lines.push("| `$like` | Pattern match (case-sensitive) | `{ name: { $like: '%John%' } }` | String |");
  lines.push("| `$ilike` | Pattern match (case-insensitive) | `{ email: { $ilike: '%@GMAIL%' } }` | String |");
  lines.push("| `$is` | IS NULL | `{ deleted_at: { $is: null } }` | Nullable fields |");
  lines.push("| `$isNot` | IS NOT NULL | `{ created_by: { $isNot: null } }` | Nullable fields |");
  lines.push("");

  // Logical operators
  lines.push("### Logical Operators");
  lines.push("");
  lines.push("Combine conditions using `$or` and `$and` (supports 2 levels of nesting):");
  lines.push("");
  lines.push("| Operator | Description | Example |");
  lines.push("|----------|-------------|---------|");
  lines.push("| `$or` | Match any condition | `{ $or: [{ status: 'active' }, { role: 'admin' }] }` |");
  lines.push("| `$and` | Match all conditions (explicit) | `{ $and: [{ age: { $gte: 18 } }, { status: 'verified' }] }` |");
  lines.push("");
  lines.push("```typescript");
  lines.push("// OR - match any condition");
  lines.push("const results = await sdk.users.list({");
  lines.push("  where: {");
  lines.push("    $or: [");
  lines.push("      { email: { $ilike: '%@gmail.com' } },");
  lines.push("      { status: 'premium' }");
  lines.push("    ]");
  lines.push("  }");
  lines.push("});");
  lines.push("");
  lines.push("// Mixed AND + OR (implicit AND at root level)");
  lines.push("const complex = await sdk.users.list({");
  lines.push("  where: {");
  lines.push("    status: 'active',  // AND");
  lines.push("    $or: [");
  lines.push("      { age: { $lt: 18 } },");
  lines.push("      { age: { $gt: 65 } }");
  lines.push("    ]");
  lines.push("  }");
  lines.push("});");
  lines.push("");
  lines.push("// Nested (2 levels max)");
  lines.push("const nested = await sdk.users.list({");
  lines.push("  where: {");
  lines.push("    $and: [");
  lines.push("      {");
  lines.push("        $or: [");
  lines.push("          { firstName: { $ilike: '%john%' } },");
  lines.push("          { lastName: { $ilike: '%john%' } }");
  lines.push("        ]");
  lines.push("      },");
  lines.push("      { status: 'active' }");
  lines.push("    ]");
  lines.push("  }");
  lines.push("});");
  lines.push("```");
  lines.push("");
  lines.push("**Note:** The WHERE clause types are fully type-safe. TypeScript will only allow operators that are valid for each field type.");
  lines.push("");

  // Sorting
  lines.push("## Sorting");
  lines.push("");
  lines.push("Sort query results using the `orderBy` and `order` parameters. Supports both single and multi-column sorting.");
  lines.push("");
  lines.push("### Single Column Sorting");
  lines.push("");
  lines.push("```typescript");
  lines.push("// Sort by one column ascending");
  lines.push("const users = await sdk.users.list({");
  lines.push("  orderBy: 'created_at',");
  lines.push("  order: 'asc'");
  lines.push("});");
  lines.push("");
  lines.push("// Sort descending");
  lines.push("const latest = await sdk.users.list({");
  lines.push("  orderBy: 'created_at',");
  lines.push("  order: 'desc'");
  lines.push("});");
  lines.push("");
  lines.push("// Order defaults to 'asc' if not specified");
  lines.push("const sorted = await sdk.users.list({");
  lines.push("  orderBy: 'name'");
  lines.push("});");
  lines.push("```");
  lines.push("");
  lines.push("### Multi-Column Sorting");
  lines.push("");
  lines.push("```typescript");
  lines.push("// Sort by multiple columns (all same direction)");
  lines.push("const users = await sdk.users.list({");
  lines.push("  orderBy: ['status', 'created_at'],");
  lines.push("  order: 'desc'");
  lines.push("});");
  lines.push("");
  lines.push("// Different direction per column");
  lines.push("const sorted = await sdk.users.list({");
  lines.push("  orderBy: ['status', 'created_at'],");
  lines.push("  order: ['asc', 'desc']  // status ASC, created_at DESC");
  lines.push("});");
  lines.push("```");
  lines.push("");
  lines.push("### Combining Sorting with Filters");
  lines.push("");
  lines.push("```typescript");
  lines.push("const results = await sdk.users.list({");
  lines.push("  where: {");
  lines.push("    status: 'active',");
  lines.push("    age: { $gte: 18 }");
  lines.push("  },");
  lines.push("  orderBy: 'created_at',");
  lines.push("  order: 'desc',");
  lines.push("  limit: 50,");
  lines.push("  offset: 0");
  lines.push("});");
  lines.push("```");
  lines.push("");
  lines.push("**Note:** Column names are validated by Zod schemas. Only valid table columns are accepted, preventing SQL injection.");
  lines.push("");

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
      lines.push("```typescript");
      lines.push(method.example);
      lines.push("```");
      lines.push("");
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
  
  // Type imports
  lines.push("## Type Imports");
  lines.push("");
  lines.push("```typescript");
  lines.push("// Import SDK and types");
  lines.push("import { SDK } from './client';");
  lines.push("");
  lines.push("// Import types for a specific table");
  lines.push("import type {");
  lines.push("  SelectTableName,  // Full record type");
  lines.push("  InsertTableName,  // Create payload type");
  lines.push("  UpdateTableName   // Update payload type");
  lines.push("} from './client/types/table_name';");
  lines.push("");
  lines.push("// Import all types");
  lines.push("import type * as Types from './client/types';");
  lines.push("```");
  lines.push("");
  
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