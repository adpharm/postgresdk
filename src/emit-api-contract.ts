import type { Table, Model, ForeignKey } from "./introspect";
import type { Config, AuthConfig } from "./types";
import { pascal } from "./utils";

export interface ApiContract {
  version: string;
  generatedAt: string;
  description: string;
  authentication?: {
    type: string;
    description: string;
  };
  resources: ResourceContract[];
  relationships: RelationshipContract[];
}

export interface ResourceContract {
  name: string;
  tableName: string;
  description: string;
  endpoints: EndpointContract[];
  fields: FieldContract[];
}

export interface EndpointContract {
  method: string;
  path: string;
  description: string;
  requestBody?: any;
  responseBody?: any;
  queryParameters?: any;
}

export interface FieldContract {
  name: string;
  type: string;
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
 * Generate a comprehensive API contract in JSON format
 */
export function generateApiContract(model: Model, config: Config & { auth?: AuthConfig }): ApiContract {
  const resources: ResourceContract[] = [];
  const relationships: RelationshipContract[] = [];
  
  // Process each table
  for (const table of Object.values(model.tables)) {
    resources.push(generateResourceContract(table, model));
    
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
  const contract: ApiContract = {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    description: "Auto-generated API contract describing all available endpoints, resources, and their relationships",
    resources,
    relationships
  };
  
  // Add authentication info if configured
  if (config.auth?.strategy && config.auth.strategy !== "none") {
    contract.authentication = {
      type: config.auth.strategy,
      description: getAuthDescription(config.auth.strategy)
    };
  }
  
  return contract;
}

function generateResourceContract(table: Table, model: Model): ResourceContract {
  const Type = pascal(table.name);
  const basePath = `/v1/${table.name}`;
  
  const endpoints: EndpointContract[] = [
    {
      method: "GET",
      path: basePath,
      description: `List all ${table.name} records with optional filtering, sorting, and pagination`,
      queryParameters: {
        limit: "number - Maximum number of records to return (default: 50)",
        offset: "number - Number of records to skip for pagination",
        order_by: "string - Field to sort by",
        order_dir: "string - Sort direction (asc or desc)",
        include: "string - Comma-separated list of related resources to include",
        ...generateFilterParams(table)
      },
      responseBody: `Array<${Type}>`
    },
    {
      method: "GET",
      path: `${basePath}/:id`,
      description: `Get a single ${table.name} record by ID`,
      queryParameters: {
        include: "string - Comma-separated list of related resources to include"
      },
      responseBody: `${Type}`
    },
    {
      method: "POST",
      path: basePath,
      description: `Create a new ${table.name} record`,
      requestBody: `Insert${Type}`,
      responseBody: `${Type}`
    },
    {
      method: "PATCH",
      path: `${basePath}/:id`,
      description: `Update an existing ${table.name} record`,
      requestBody: `Update${Type}`,
      responseBody: `${Type}`
    },
    {
      method: "DELETE",
      path: `${basePath}/:id`,
      description: `Delete a ${table.name} record`,
      responseBody: `${Type}`
    }
  ];
  
  const fields = table.columns.map(col => generateFieldContract(col, table));
  
  return {
    name: Type,
    tableName: table.name,
    description: `Resource for managing ${table.name} records`,
    endpoints,
    fields
  };
}

function generateFieldContract(column: any, table: Table): FieldContract {
  const field: FieldContract = {
    name: column.name,
    type: postgresTypeToJsonType(column.pgType),
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

function generateFieldDescription(column: any, table: Table): string {
  const descriptions: string[] = [];
  
  // Basic type info
  descriptions.push(`${postgresTypeToJsonType(column.pgType)} field`);
  
  // Special fields
  if (column.name === 'id') {
    descriptions.push("Unique identifier");
  } else if (column.name === 'created_at') {
    descriptions.push("Timestamp when the record was created");
  } else if (column.name === 'updated_at') {
    descriptions.push("Timestamp when the record was last updated");
  } else if (column.name === 'deleted_at') {
    descriptions.push("Soft delete timestamp");
  } else if (column.name.endsWith('_id')) {
    const relatedTable = column.name.slice(0, -3);
    descriptions.push(`Reference to ${relatedTable}`);
  } else if (column.name.includes('email')) {
    descriptions.push("Email address");
  } else if (column.name.includes('phone')) {
    descriptions.push("Phone number");
  } else if (column.name.includes('name')) {
    descriptions.push("Name field");
  } else if (column.name.includes('description')) {
    descriptions.push("Description text");
  } else if (column.name.includes('status')) {
    descriptions.push("Status indicator");
  } else if (column.name.includes('price') || column.name.includes('amount') || column.name.includes('total')) {
    descriptions.push("Monetary value");
  }
  
  // Add requirement info
  if (!column.nullable && !column.hasDefault) {
    descriptions.push("(required)");
  } else if (column.nullable) {
    descriptions.push("(optional)");
  }
  
  return descriptions.join(" - ");
}

function postgresTypeToJsonType(pgType: string): string {
  switch (pgType) {
    case 'int':
    case 'integer':
    case 'smallint':
    case 'bigint':
    case 'decimal':
    case 'numeric':
    case 'real':
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
      return 'array<string>';
    case 'int[]':
    case 'integer[]':
      return 'array<number>';
    default:
      return 'string';
  }
}

function generateFilterParams(table: Table): Record<string, string> {
  const filters: Record<string, string> = {};
  
  for (const col of table.columns) {
    const type = postgresTypeToJsonType(col.pgType);
    
    // Add basic equality filter
    filters[col.name] = `${type} - Filter by exact ${col.name} value`;
    
    // Add range filters for numeric/date types
    if (type === 'number' || type === 'date/datetime') {
      filters[`${col.name}_gt`] = `${type} - Filter where ${col.name} is greater than`;
      filters[`${col.name}_gte`] = `${type} - Filter where ${col.name} is greater than or equal`;
      filters[`${col.name}_lt`] = `${type} - Filter where ${col.name} is less than`;
      filters[`${col.name}_lte`] = `${type} - Filter where ${col.name} is less than or equal`;
    }
    
    // Add text search for string types
    if (type === 'string') {
      filters[`${col.name}_like`] = `string - Filter where ${col.name} contains text (case-insensitive)`;
    }
  }
  
  return filters;
}

function getAuthDescription(strategy: string): string {
  switch (strategy) {
    case 'jwt':
      return "JWT Bearer token authentication. Include token in Authorization header: 'Bearer <token>'";
    case 'apiKey':
      return "API Key authentication. Include key in the configured header (e.g., 'x-api-key')";
    default:
      return "Custom authentication strategy";
  }
}

/**
 * Generate a human-readable markdown version of the contract
 */
export function generateApiContractMarkdown(contract: ApiContract): string {
  const lines: string[] = [];
  
  lines.push("# API Contract");
  lines.push("");
  lines.push(contract.description);
  lines.push("");
  lines.push(`**Version:** ${contract.version}`);
  lines.push(`**Generated:** ${new Date(contract.generatedAt).toLocaleString()}`);
  lines.push("");
  
  if (contract.authentication) {
    lines.push("## Authentication");
    lines.push("");
    lines.push(`**Type:** ${contract.authentication.type}`);
    lines.push("");
    lines.push(contract.authentication.description);
    lines.push("");
  }
  
  lines.push("## Resources");
  lines.push("");
  
  for (const resource of contract.resources) {
    lines.push(`### ${resource.name}`);
    lines.push("");
    lines.push(resource.description);
    lines.push("");
    lines.push("**Endpoints:**");
    lines.push("");
    
    for (const endpoint of resource.endpoints) {
      lines.push(`- \`${endpoint.method} ${endpoint.path}\` - ${endpoint.description}`);
    }
    lines.push("");
    
    lines.push("**Fields:**");
    lines.push("");
    
    for (const field of resource.fields) {
      const required = field.required ? " *(required)*" : "";
      const fk = field.foreignKey ? ` → ${field.foreignKey.table}` : "";
      lines.push(`- \`${field.name}\` (${field.type})${required}${fk} - ${field.description}`);
    }
    lines.push("");
  }
  
  if (contract.relationships.length > 0) {
    lines.push("## Relationships");
    lines.push("");
    
    for (const rel of contract.relationships) {
      lines.push(`- **${rel.from}** → **${rel.to}** (${rel.type}): ${rel.description}`);
    }
    lines.push("");
  }
  
  return lines.join("\n");
}

/**
 * Emit the API contract as TypeScript code that can be served as an endpoint
 */
export function emitApiContract(model: Model, config: Config & { auth?: AuthConfig }): string {
  const contract = generateApiContract(model, config);
  const contractJson = JSON.stringify(contract, null, 2);
  
  return `/**
 * API Contract
 * 
 * This module exports the API contract that describes all available
 * endpoints, resources, and their relationships.
 */

export const apiContract = ${contractJson};

export const apiContractMarkdown = \`${generateApiContractMarkdown(contract).replace(/`/g, '\\`')}\`;

/**
 * Helper to get the contract in different formats
 */
export function getApiContract(format: 'json' | 'markdown' = 'json') {
  if (format === 'markdown') {
    return apiContractMarkdown;
  }
  return apiContract;
}
`;
}