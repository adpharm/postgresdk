# Drizzle SDK Generator - Complete Implementation Guide

## Project Overview

A code generator that creates a type-safe SDK from Drizzle ORM schemas. It generates both server-side routes and a client-side SDK with full TypeScript support for includes/relations, without using AST parsing.

**Key Features:**

- Postgres-only support
- No AST parsing - uses runtime imports
- Generates Zod validation for all writes
- Type-safe `include` specifications
- Separate server routes and client SDK
- Handles composite primary keys
- Optional soft delete support

## Architecture

### Input Files Required

1. `schema.ts` - Drizzle pgTable definitions
2. `relations.ts` - Drizzle relations definitions
3. `drizzle-sdk.config.ts` - Generator configuration

### Generated Output Structure

```
# Server (internal API routes)
src/generated/server/
├── routes/
│   ├── contacts.ts          # CRUD operations for contacts table
│   ├── contactInteractions.ts
│   └── tags.ts
├── zod/
│   ├── contacts.ts          # Zod schemas for validation
│   ├── contactInteractions.ts
│   └── tags.ts
├── include-spec.ts          # TypeScript types for include options
└── include-builder.ts       # Runtime builder for Drizzle 'with' clause

# Client (npm package)
packages/sdk/src/
├── include-spec.ts          # Same types as server
├── contacts.ts              # Client class for contacts
├── contactInteractions.ts
├── tags.ts
└── index.ts                 # Main SDK class
```

## Core Concepts

### 1. Relation Graph

The generator builds an in-memory graph of all table relationships by importing and analyzing the relations file:

```typescript
type RelationGraph = Map<
  string,
  {
    table: string;
    relations: Map<
      string,
      {
        key: string;
        kind: "one" | "many";
        target: string;
        through?: string; // for many-to-many junction tables
      }
    >;
  }
>;
```

### 2. Include Specifications

Instead of passing raw Drizzle `with` objects over the network, we use typed "include specifications":

```typescript
// Example generated type
type ContactsIncludeSpec = {
  interactions?:
    | boolean
    | {
        include?: ContactInteractionsIncludeSpec;
        limit?: number;
        offset?: number;
        orderBy?: { field: keyof ContactInteraction; direction: "asc" | "desc" };
      };
  tags?: boolean | TagsIncludeSpec;
  createdByUser?: boolean | UserIncludeSpec;
};
```

### 3. Include Builder

The server converts include specs to Drizzle `with` objects at runtime:

```typescript
// Server-side only
function buildWithForContacts(spec: ContactsIncludeSpec, depth = 0, maxDepth = 3): DrizzleWithClause;
```

## Implementation Steps

### Step 1: Project Setup

```bash
mkdir drizzle-sdk-generator
cd drizzle-sdk-generator
bun init -y

# Dependencies
bun add drizzle-orm drizzle-zod zod
bun add -D @types/node typescript tsx

# Project structure
mkdir -p src/{cli,generator,utils}
```

### Step 2: Configuration Schema

```typescript
// src/config.ts
import { z } from "zod";

export const ConfigSchema = z.object({
  schemas: z.array(z.string()).min(1).max(2), // [schema.ts, relations.ts?]
  outServer: z.string(),
  outClient: z.string(),
  primaryKeys: z.record(z.union([z.string(), z.array(z.string())])).optional(),
  softDeleteColumn: z.string().nullable().default(null),
  includeDepthLimit: z.number().default(3),
});

export type Config = z.infer<typeof ConfigSchema>;

export async function loadConfig(path: string): Promise<Config> {
  const configModule = await import(path);
  return ConfigSchema.parse(configModule.default);
}
```

### Step 3: Relation Graph Builder

```typescript
// src/generator/graph-builder.ts
export async function buildRelationGraph(schemaPath: string, relationsPath?: string): Promise<RelationGraph> {
  // 1. Import schema file
  const schemaModule = await import(schemaPath);

  // 2. Extract all pgTable exports
  const tables = new Map<string, any>();
  for (const [key, value] of Object.entries(schemaModule)) {
    if (value?._?.name) {
      // pgTable has this structure
      tables.set(key, value);
    }
  }

  // 3. Import relations if provided
  if (!relationsPath) return new Map();

  const relationsModule = await import(relationsPath);
  const graph = new Map();

  // 4. Parse each relation definition
  for (const [tableName, relationDef] of Object.entries(relationsModule)) {
    if (!tableName.endsWith("Relations")) continue;

    const baseTableName = tableName.replace("Relations", "");
    const relations = new Map();

    // Parse the relations function result
    // This will contain calls to one() and many()
    // Extract field names, target tables, and relationship types

    graph.set(baseTableName, { table: baseTableName, relations });
  }

  return graph;
}
```

### Step 4: Include Spec Generator

```typescript
// src/generator/include-spec.ts
export function generateIncludeSpecs(graph: RelationGraph): string {
  const lines: string[] = [];

  // Import base types
  lines.push(`// Generated include specifications`);
  lines.push(`// Do not edit manually\n`);

  // Generate type for each table
  for (const [tableName, tableInfo] of graph) {
    lines.push(`export type ${capitalize(tableName)}IncludeSpec = {`);

    for (const [relationName, relation] of tableInfo.relations) {
      if (relation.kind === "many") {
        // Many relations get pagination options
        lines.push(`  ${relationName}?: boolean | {`);
        lines.push(`    include?: ${capitalize(relation.target)}IncludeSpec;`);
        lines.push(`    limit?: number;`);
        lines.push(`    offset?: number;`);
        lines.push(`    orderBy?: { field: string; direction: 'asc' | 'desc' };`);
        lines.push(`  };`);
      } else {
        // One relations are simpler
        lines.push(`  ${relationName}?: boolean | ${capitalize(relation.target)}IncludeSpec;`);
      }
    }

    lines.push(`};\n`);
  }

  return lines.join("\n");
}
```

### Step 5: Include Builder Generator

```typescript
// src/generator/include-builder.ts
export function generateIncludeBuilder(graph: RelationGraph, maxDepth: number): string {
  const lines: string[] = [];

  // Generate the relation graph as inlined JSON
  lines.push(`// Generated include builder`);
  lines.push(`// Do not edit manually\n`);

  lines.push(
    `const RELATION_GRAPH = ${JSON.stringify(
      Object.fromEntries(
        Array.from(graph.entries()).map(([table, info]) => [table, Object.fromEntries(info.relations)])
      ),
      null,
      2
    )} as const;\n`
  );

  // Generate builder function for each table
  for (const [tableName, tableInfo] of graph) {
    lines.push(`export function buildWithFor${capitalize(tableName)}(`);
    lines.push(`  spec: ${capitalize(tableName)}IncludeSpec | undefined,`);
    lines.push(`  depth = 0,`);
    lines.push(`  maxDepth = ${maxDepth}`);
    lines.push(`): any {`);
    lines.push(`  if (!spec || depth >= maxDepth) return undefined;\n`);
    lines.push(`  const result: any = {};\n`);

    lines.push(`  for (const [key, value] of Object.entries(spec)) {`);
    lines.push(`    const relation = RELATION_GRAPH.${tableName}?.[key];`);
    lines.push(`    if (!relation) continue;\n`);

    lines.push(`    if (value === true) {`);
    lines.push(`      result[key] = true;`);
    lines.push(`    } else if (typeof value === 'object' && value !== null) {`);
    lines.push(`      const nested: any = {};`);
    lines.push(`      if ('include' in value && value.include) {`);
    lines.push(`        nested.with = buildWithFor${capitalize(tableName)}(value.include, depth + 1, maxDepth);`);
    lines.push(`      }`);
    lines.push(`      if ('limit' in value) nested.limit = value.limit;`);
    lines.push(`      if ('offset' in value) nested.offset = value.offset;`);
    lines.push(`      // TODO: Handle orderBy conversion`);
    lines.push(`      result[key] = Object.keys(nested).length > 0 ? nested : true;`);
    lines.push(`    }`);
    lines.push(`  }\n`);

    lines.push(`  return Object.keys(result).length > 0 ? result : undefined;`);
    lines.push(`}\n`);
  }

  return lines.join("\n");
}
```

### Step 6: Server Route Generator

```typescript
// src/generator/routes.ts
export function generateRoutes(tableName: string, tableInfo: any, config: Config): string {
  const lines: string[] = [];
  const capName = capitalize(tableName);
  const primaryKey = config.primaryKeys?.[tableName] || "id";
  const isCompositePK = Array.isArray(primaryKey);

  // Imports
  lines.push(`import { db } from '@/db';`);
  lines.push(`import { ${tableName} } from '@/db/schema';`);
  lines.push(`import { eq, and, isNull } from 'drizzle-orm';`);
  lines.push(`import { Insert${capName}Schema, Update${capName}Schema } from '../zod/${tableName}';`);
  lines.push(`import { buildWithFor${capName} } from '../include-builder';`);
  lines.push(`import type { ${capName}IncludeSpec } from '../include-spec';\n`);

  // CREATE
  lines.push(`export async function create${capName}(body: unknown) {`);
  lines.push(`  const parsed = Insert${capName}Schema.parse(body);`);
  lines.push(`  const [result] = await db.insert(${tableName}).values(parsed).returning();`);
  lines.push(`  return result;`);
  lines.push(`}\n`);

  // GET BY PK
  if (isCompositePK) {
    const pkParams = primaryKey.map((k) => `${k}: string`).join(", ");
    lines.push(`export async function get${capName}ByPk(${pkParams}, include?: ${capName}IncludeSpec) {`);
    lines.push(`  const withClause = include ? buildWithFor${capName}(include) : undefined;`);
    lines.push(`  return await db.query.${tableName}.findFirst({`);
    lines.push(`    where: and(${primaryKey.map((k) => `eq(${tableName}.${k}, ${k})`).join(", ")}),`);
    lines.push(`    with: withClause`);
    lines.push(`  });`);
  } else {
    lines.push(`export async function get${capName}ByPk(${primaryKey}: string, include?: ${capName}IncludeSpec) {`);
    lines.push(`  const withClause = include ? buildWithFor${capName}(include) : undefined;`);
    lines.push(`  return await db.query.${tableName}.findFirst({`);
    lines.push(`    where: eq(${tableName}.${primaryKey}, ${primaryKey}),`);
    lines.push(`    with: withClause`);
    lines.push(`  });`);
  }
  lines.push(`}\n`);

  // LIST
  lines.push(`export async function list${capName}s(options: {`);
  lines.push(`  include?: ${capName}IncludeSpec;`);
  lines.push(`  limit?: number;`);
  lines.push(`  offset?: number;`);
  lines.push(`  orderBy?: { field: string; direction: 'asc' | 'desc' };`);
  lines.push(`} = {}) {`);
  lines.push(`  const withClause = options.include ? buildWithFor${capName}(options.include) : undefined;`);

  if (config.softDeleteColumn) {
    lines.push(`  const whereClause = isNull(${tableName}.${config.softDeleteColumn});`);
  }

  lines.push(`  return await db.query.${tableName}.findMany({`);
  if (config.softDeleteColumn) {
    lines.push(`    where: whereClause,`);
  }
  lines.push(`    with: withClause,`);
  lines.push(`    limit: options.limit,`);
  lines.push(`    offset: options.offset,`);
  lines.push(`    // TODO: Handle orderBy`);
  lines.push(`  });`);
  lines.push(`}\n`);

  // UPDATE
  if (isCompositePK) {
    const pkParams = primaryKey.map((k) => `${k}: string`).join(", ");
    lines.push(`export async function update${capName}(${pkParams}, body: unknown) {`);
    lines.push(`  const parsed = Update${capName}Schema.parse(body);`);
    lines.push(`  const [result] = await db.update(${tableName})`);
    lines.push(`    .set(parsed)`);
    lines.push(`    .where(and(${primaryKey.map((k) => `eq(${tableName}.${k}, ${k})`).join(", ")}))`);
    lines.push(`    .returning();`);
  } else {
    lines.push(`export async function update${capName}(${primaryKey}: string, body: unknown) {`);
    lines.push(`  const parsed = Update${capName}Schema.parse(body);`);
    lines.push(`  const [result] = await db.update(${tableName})`);
    lines.push(`    .set(parsed)`);
    lines.push(`    .where(eq(${tableName}.${primaryKey}, ${primaryKey}))`);
    lines.push(`    .returning();`);
  }
  lines.push(`  return result;`);
  lines.push(`}\n`);

  // DELETE
  if (isCompositePK) {
    const pkParams = primaryKey.map((k) => `${k}: string`).join(", ");
    lines.push(`export async function delete${capName}(${pkParams}) {`);

    if (config.softDeleteColumn) {
      lines.push(`  const [result] = await db.update(${tableName})`);
      lines.push(`    .set({ ${config.softDeleteColumn}: new Date() })`);
      lines.push(`    .where(and(${primaryKey.map((k) => `eq(${tableName}.${k}, ${k})`).join(", ")}))`);
    } else {
      lines.push(`  const [result] = await db.delete(${tableName})`);
      lines.push(`    .where(and(${primaryKey.map((k) => `eq(${tableName}.${k}, ${k})`).join(", ")}))`);
    }
  } else {
    lines.push(`export async function delete${capName}(${primaryKey}: string) {`);

    if (config.softDeleteColumn) {
      lines.push(`  const [result] = await db.update(${tableName})`);
      lines.push(`    .set({ ${config.softDeleteColumn}: new Date() })`);
      lines.push(`    .where(eq(${tableName}.${primaryKey}, ${primaryKey}))`);
    } else {
      lines.push(`  const [result] = await db.delete(${tableName})`);
      lines.push(`    .where(eq(${tableName}.${primaryKey}, ${primaryKey}))`);
    }
  }
  lines.push(`    .returning();`);
  lines.push(`  return result;`);
  lines.push(`}`);

  return lines.join("\n");
}
```

### Step 7: Zod Schema Generator

```typescript
// src/generator/zod.ts
export function generateZodSchema(tableName: string): string {
  const capName = capitalize(tableName);

  return `import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { ${tableName} } from '@/db/schema';

export const Insert${capName}Schema = createInsertSchema(${tableName});
export const Update${capName}Schema = Insert${capName}Schema.partial();
export const Select${capName}Schema = createSelectSchema(${tableName});

export type Insert${capName} = z.infer<typeof Insert${capName}Schema>;
export type Update${capName} = z.infer<typeof Update${capName}Schema>;
export type Select${capName} = z.infer<typeof Select${capName}Schema>;
`;
}
```

### Step 8: Client SDK Generator

```typescript
// src/generator/client.ts
export function generateClientClass(tableName: string, config: Config): string {
  const lines: string[] = [];
  const capName = capitalize(tableName);
  const primaryKey = config.primaryKeys?.[tableName] || "id";
  const isCompositePK = Array.isArray(primaryKey);

  // Imports
  lines.push(`import type { ${capName}IncludeSpec } from './include-spec';`);
  lines.push(`// Import types from your schema or generate them\n`);

  // Class definition
  lines.push(`export class ${capName}Client {`);
  lines.push(`  constructor(`);
  lines.push(`    private baseUrl: string,`);
  lines.push(`    private fetchFn: typeof fetch,`);
  lines.push(`    private authHook?: () => Promise<Headers>`);
  lines.push(`  ) {}\n`);

  // CREATE method
  lines.push(`  async create(data: any): Promise<any> {`);
  lines.push(`    const headers = await this.authHook?.() || {};`);
  lines.push(`    const res = await this.fetchFn(\`\${this.baseUrl}/${tableName}\`, {`);
  lines.push(`      method: 'POST',`);
  lines.push(`      headers: { 'Content-Type': 'application/json', ...headers },`);
  lines.push(`      body: JSON.stringify(data)`);
  lines.push(`    });`);
  lines.push(`    if (!res.ok) throw new Error(\`Failed to create: \${res.statusText}\`);`);
  lines.push(`    return res.json();`);
  lines.push(`  }\n`);

  // GET BY PK method
  if (isCompositePK) {
    const pkType = `{ ${primaryKey.map((k) => `${k}: string`).join("; ")} }`;
    lines.push(`  async getByPk(pk: ${pkType}, include?: ${capName}IncludeSpec): Promise<any> {`);
    lines.push(`    const pkPath = ${primaryKey.map((k) => `pk.${k}`).join(' + "/" + ')};`);
    lines.push(`    const params = include ? \`?include=\${encodeURIComponent(JSON.stringify(include))}\` : '';`);
    lines.push(`    const headers = await this.authHook?.() || {};`);
    lines.push(
      `    const res = await this.fetchFn(\`\${this.baseUrl}/${tableName}/\${pkPath}\${params}\`, { headers });`
    );
  } else {
    lines.push(`  async getByPk(${primaryKey}: string, include?: ${capName}IncludeSpec): Promise<any> {`);
    lines.push(`    const params = include ? \`?include=\${encodeURIComponent(JSON.stringify(include))}\` : '';`);
    lines.push(`    const headers = await this.authHook?.() || {};`);
    lines.push(
      `    const res = await this.fetchFn(\`\${this.baseUrl}/${tableName}/\${${primaryKey}}\${params}\`, { headers });`
    );
  }
  lines.push(`    if (res.status === 404) return null;`);
  lines.push(`    if (!res.ok) throw new Error(\`Failed to get: \${res.statusText}\`);`);
  lines.push(`    return res.json();`);
  lines.push(`  }\n`);

  // LIST method
  lines.push(`  async list(options?: {`);
  lines.push(`    include?: ${capName}IncludeSpec;`);
  lines.push(`    limit?: number;`);
  lines.push(`    offset?: number;`);
  lines.push(`    orderBy?: { field: string; direction: 'asc' | 'desc' };`);
  lines.push(`  }): Promise<any[]> {`);
  lines.push(`    const params = new URLSearchParams();`);
  lines.push(`    if (options?.include) params.set('include', JSON.stringify(options.include));`);
  lines.push(`    if (options?.limit) params.set('limit', options.limit.toString());`);
  lines.push(`    if (options?.offset) params.set('offset', options.offset.toString());`);
  lines.push(`    if (options?.orderBy) params.set('orderBy', JSON.stringify(options.orderBy));`);
  lines.push(`    `);
  lines.push(`    const headers = await this.authHook?.() || {};`);
  lines.push(`    const res = await this.fetchFn(\`\${this.baseUrl}/${tableName}?\${params}\`, { headers });`);
  lines.push(`    if (!res.ok) throw new Error(\`Failed to list: \${res.statusText}\`);`);
  lines.push(`    return res.json();`);
  lines.push(`  }\n`);

  // UPDATE method
  if (isCompositePK) {
    const pkType = `{ ${primaryKey.map((k) => `${k}: string`).join("; ")} }`;
    lines.push(`  async update(pk: ${pkType}, data: any): Promise<any> {`);
    lines.push(`    const pkPath = ${primaryKey.map((k) => `pk.${k}`).join(' + "/" + ')};`);
    lines.push(`    const headers = await this.authHook?.() || {};`);
    lines.push(`    const res = await this.fetchFn(\`\${this.baseUrl}/${tableName}/\${pkPath}\`, {`);
  } else {
    lines.push(`  async update(${primaryKey}: string, data: any): Promise<any> {`);
    lines.push(`    const headers = await this.authHook?.() || {};`);
    lines.push(`    const res = await this.fetchFn(\`\${this.baseUrl}/${tableName}/\${${primaryKey}}\`, {`);
  }
  lines.push(`      method: 'PATCH',`);
  lines.push(`      headers: { 'Content-Type': 'application/json', ...headers },`);
  lines.push(`      body: JSON.stringify(data)`);
  lines.push(`    });`);
  lines.push(`    if (res.status === 404) return null;`);
  lines.push(`    if (!res.ok) throw new Error(\`Failed to update: \${res.statusText}\`);`);
  lines.push(`    return res.json();`);
  lines.push(`  }\n`);

  // DELETE method
  if (isCompositePK) {
    const pkType = `{ ${primaryKey.map((k) => `${k}: string`).join("; ")} }`;
    lines.push(`  async delete(pk: ${pkType}): Promise<any> {`);
    lines.push(`    const pkPath = ${primaryKey.map((k) => `pk.${k}`).join(' + "/" + ')};`);
    lines.push(`    const headers = await this.authHook?.() || {};`);
    lines.push(`    const res = await this.fetchFn(\`\${this.baseUrl}/${tableName}/\${pkPath}\`, {`);
  } else {
    lines.push(`  async delete(${primaryKey}: string): Promise<any> {`);
    lines.push(`    const headers = await this.authHook?.() || {};`);
    lines.push(`    const res = await this.fetchFn(\`\${this.baseUrl}/${tableName}/\${${primaryKey}}\`, {`);
  }
  lines.push(`      method: 'DELETE',`);
  lines.push(`      headers`);
  lines.push(`    });`);
  lines.push(`    if (res.status === 404) return null;`);
  lines.push(`    if (!res.ok) throw new Error(\`Failed to delete: \${res.statusText}\`);`);
  lines.push(`    return res.json();`);
  lines.push(`  }`);

  lines.push(`}`);

  return lines.join("\n");
}

export function generateSDKIndex(tables: string[]): string {
  const lines: string[] = [];

  // Imports
  for (const table of tables) {
    lines.push(`import { ${capitalize(table)}Client } from './${table}';`);
  }
  lines.push(`\nexport * from './include-spec';\n`);

  // SDK class
  lines.push(`export class SDK {`);
  for (const table of tables) {
    lines.push(`  public ${table}: ${capitalize(table)}Client;`);
  }
  lines.push(`\n  constructor(config: {`);
  lines.push(`    baseUrl: string;`);
  lines.push(`    fetch?: typeof fetch;`);
  lines.push(`    auth?: () => Promise<Headers>;`);
  lines.push(`  }) {`);
  lines.push(`    const fetchFn = config.fetch || globalThis.fetch;\n`);

  for (const table of tables) {
    lines.push(`    this.${table} = new ${capitalize(table)}Client(config.baseUrl, fetchFn, config.auth);`);
  }

  lines.push(`  }`);
  lines.push(`}`);

  return lines.join("\n");
}
```

### Step 9: Main Generator

```typescript
// src/generator/index.ts
import { loadConfig } from "../config";
import { buildRelationGraph } from "./graph-builder";
import { generateIncludeSpecs } from "./include-spec";
import { generateIncludeBuilder } from "./include-builder";
import { generateRoutes } from "./routes";
import { generateZodSchema } from "./zod";
import { generateClientClass, generateSDKIndex } from "./client";
import { writeFiles } from "../utils/file-writer";

export async function generate(configPath: string) {
  // 1. Load configuration
  const config = await loadConfig(configPath);
  console.log("✓ Loaded configuration");

  // 2. Build relation graph
  const graph = await buildRelationGraph(config.schemas[0], config.schemas[1]);
  console.log(`✓ Built relation graph for ${graph.size} tables`);

  // 3. Extract table names
  const tables = Array.from(graph.keys());

  // 4. Generate all files
  const files: Array<{ path: string; content: string }> = [];

  // Include specifications (shared between server and client)
  const includeSpecs = generateIncludeSpecs(graph);
  files.push({
    path: `${config.outServer}/include-spec.ts`,
    content: includeSpecs,
  });
  files.push({
    path: `${config.outClient}/include-spec.ts`,
    content: includeSpecs,
  });

  // Include builder (server only)
  files.push({
    path: `${config.outServer}/include-builder.ts`,
    content: generateIncludeBuilder(graph, config.includeDepthLimit),
  });

  // Per-table files
  for (const table of tables) {
    // Server: Zod schemas
    files.push({
      path: `${config.outServer}/zod/${table}.ts`,
      content: generateZodSchema(table),
    });

    // Server: Routes
    files.push({
      path: `${config.outServer}/routes/${table}.ts`,
      content: generateRoutes(table, graph.get(table), config),
    });

    // Client: Table client
    files.push({
      path: `${config.outClient}/${table}.ts`,
      content: generateClientClass(table, config),
    });
  }

  // Client: Main SDK class
  files.push({
    path: `${config.outClient}/index.ts`,
    content: generateSDKIndex(tables),
  });

  // 5. Write all files
  await writeFiles(files);
  console.log(`✓ Generated ${files.length} files`);

  console.log("\n✅ SDK generation complete!");
  console.log(`   Server files: ${config.outServer}`);
  console.log(`   Client files: ${config.outClient}`);
}
```

### Step 10: CLI Entry Point

```typescript
// src/cli.ts
#!/usr/bin/env node
import { generate } from './generator';
import { resolve } from 'path';

async function main() {
  const args = process.argv.slice(2);

  // Default config path
  let configPath = './drizzle-sdk.config.ts';

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' || args[i] === '-c') {
      configPath = args[i + 1];
      i++;
    }
  }

  try {
    const resolvedPath = resolve(process.cwd(), configPath);
    console.log(`🚀 Drizzle SDK Generator`);
    console.log(`   Config: ${resolvedPath}\n`);

    await generate(resolvedPath);
  } catch (error) {
    console.error('❌ Generation failed:', error);
    process.exit(1);
  }
}

main();
```

### Step 11: Utility Functions

```typescript
// src/utils/file-writer.ts
import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";

export async function writeFiles(files: Array<{ path: string; content: string }>) {
  for (const file of files) {
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.content, "utf-8");
  }
}

// src/utils/string-utils.ts
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function camelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}
```

## Package Configuration

### package.json

```json
{
  "name": "drizzle-sdk-generator",
  "version": "0.1.0",
  "description": "Generate type-safe SDKs from Drizzle schemas",
  "bin": {
    "drizzle-sdk": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "prepublishOnly": "bun run build"
  },
  "dependencies": {
    "drizzle-orm": "latest",
    "drizzle-zod": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@types/node": "latest",
    "typescript": "latest",
    "tsx": "latest"
  },
  "files": ["dist", "README.md"],
  "keywords": ["drizzle", "sdk", "generator", "typescript"],
  "license": "MIT"
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## Usage Example

### 1. User's Configuration

```typescript
// drizzle-sdk.config.ts
export default {
  schemas: ["./src/db/schema.ts", "./src/db/relations.ts"],
  outServer: "./src/generated/server",
  outClient: "./packages/sdk/src",
  primaryKeys: {
    contactTags: ["contactId", "tagId"], // Composite primary key
  },
  softDeleteColumn: "deletedAt",
  includeDepthLimit: 3,
};
```

### 2. Run Generator

```bash
npx drizzle-sdk
# or
bunx drizzle-sdk --config ./custom-config.ts
```

### 3. Use Generated Server Routes

```typescript
// In your API route handler
import { listContacts, getContactByPk } from "@/generated/server/routes/contacts";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const includeParam = url.searchParams.get("include");
  const include = includeParam ? JSON.parse(includeParam) : undefined;

  const contacts = await listContacts({
    include,
    limit: 20,
    offset: 0,
  });

  return Response.json(contacts);
}
```

### 4. Use Generated Client SDK

```typescript
import { SDK } from "@your-org/sdk";

const sdk = new SDK({
  baseUrl: "https://api.example.com",
  auth: async () => ({
    Authorization: `Bearer ${await getToken()}`,
  }),
});

// Fetch with includes
const contact = await sdk.contacts.getByPk("uuid", {
  interactions: {
    limit: 5,
    orderBy: { field: "createdAt", direction: "desc" },
  },
  tags: true,
});

// Create new contact
const newContact = await sdk.contacts.create({
  firstName: "John",
  lastName: "Doe",
  email: "john@example.com",
});
```

## Testing Strategy

### Unit Tests

- Test relation graph builder with mock schemas
- Test code generation for each component
- Test include builder logic with various specs

### Integration Tests

- Generate SDK from real schema files
- Verify generated code compiles
- Test runtime behavior against test database

### End-to-End Tests

- Full generation → server setup → client usage flow
- Test all CRUD operations
- Verify include functionality works correctly

## Known Limitations & Future Work

### Current Limitations

1. Postgres-only (no MySQL/SQLite support)
2. Basic where clauses only
3. No aggregate functions
4. Response types for includes are `any` (not fully typed)

### Planned Enhancements

1. Fully typed response shapes with includes
2. Advanced filtering (complex where clauses)
3. Aggregate queries (count, sum, avg)
4. Cursor-based pagination
5. Real-time subscriptions
6. Batch operations

## Troubleshooting

### Common Issues

**Issue**: "Cannot find module" when importing schema
**Solution**: Ensure paths in config are relative to where you run the generator

**Issue**: Generated code has TypeScript errors
**Solution**: Make sure drizzle-orm and drizzle-zod are installed in your project

**Issue**: Relations not being detected
**Solution**: Verify your relations.ts exports follow Drizzle's pattern

## Publishing to NPM

```bash
# Build the package
bun run build

# Test locally
npm link
# In another project: npm link drizzle-sdk-generator

# Publish
npm publish
```

## Support & Contributing

This generator is designed to be minimal and focused. For bugs or feature requests, please open an issue in the repository. Pull requests welcome for bug fixes and enhancements that maintain the simplicity of the design.

## License

MIT
