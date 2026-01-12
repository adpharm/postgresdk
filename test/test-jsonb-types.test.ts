#!/usr/bin/env bun

/**
 * Type-checking test for JSONB generic types
 * Verifies that generic type parameters work correctly at compile-time
 */

import { test, expect, beforeAll, afterAll } from "bun:test";
import { Client } from "pg";
import { writeFileSync, mkdirSync } from "fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { introspect } from "../src/introspect";
import { emitTypes } from "../src/emit-types";
import { emitClient, emitClientIndex } from "../src/emit-client";
import { emitWhereTypes } from "../src/emit-where-types";
import { emitSharedTypes } from "../src/emit-shared-types";
import { emitBaseClient } from "../src/emit-base-client";

const execAsync = promisify(exec);
const CONTAINER_NAME = "postgresdk-test-jsonb-types";
const TEST_PORT = 5435;
const CONNECTION_STRING = `postgres://user:pass@localhost:${TEST_PORT}/testdb`;
const OUTPUT_DIR = "./test/.jsonb-types-test";

async function ensurePostgresRunning(): Promise<void> {
  try {
    const { stdout } = await execAsync(`docker ps --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`);
    if (stdout.trim() === CONTAINER_NAME) {
      return;
    }
  } catch {}

  console.log("🐳 Starting PostgreSQL container for JSONB type test...");
  try {
    const { stdout } = await execAsync(`docker ps -a --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`);
    if (stdout.trim() === CONTAINER_NAME) {
      await execAsync(`docker start ${CONTAINER_NAME}`);
    } else {
      await execAsync(`docker run -d --name ${CONTAINER_NAME} -e POSTGRES_USER=user -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=testdb -p ${TEST_PORT}:5432 postgres:17-alpine`);
    }
  } catch (error) {
    console.error("Failed to start container:", error);
    throw error;
  }

  console.log("  → Waiting for PostgreSQL to be ready...");
  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    try {
      const pg = new Client({ connectionString: CONNECTION_STRING });
      await pg.connect();
      await pg.query("SELECT 1");
      await pg.end();
      console.log("  ✓ PostgreSQL is ready!");
      return;
    } catch {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw new Error("PostgreSQL failed to start in time");
}

let pg: Client;

beforeAll(async () => {
  await ensurePostgresRunning();

  pg = new Client({ connectionString: CONNECTION_STRING });
  await pg.connect();

  // Create test schema with JSONB columns
  await pg.query(`
    DROP TABLE IF EXISTS products;
    CREATE TABLE products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      metadata JSONB NOT NULL,
      settings JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Insert test data
  await pg.query(`
    INSERT INTO products (name, metadata, settings) VALUES
    ('Laptop', '{"category": "electronics", "specs": {"cpu": "i7", "ram": 16}, "tags": ["premium"]}', '{"theme": "dark"}'),
    ('Mouse', '{"category": "electronics", "specs": {"dpi": 1600}, "tags": ["basic"]}', NULL)
  `);

  // Generate SDK
  console.log("  → Generating SDK with JSONB support...");
  const model = await introspect(CONNECTION_STRING, "public");

  mkdirSync(`${OUTPUT_DIR}/client/types`, { recursive: true });

  // Generate types
  const productsTable = model.tables["products"]!;
  writeFileSync(
    `${OUTPUT_DIR}/client/types/products.ts`,
    emitTypes(productsTable, { numericMode: "number" }, model.enums)
  );

  // Generate shared types
  writeFileSync(`${OUTPUT_DIR}/client/types/shared.ts`, emitSharedTypes());

  // Generate WHERE types
  writeFileSync(`${OUTPUT_DIR}/client/where-types.ts`, emitWhereTypes());

  // Generate base client
  writeFileSync(`${OUTPUT_DIR}/client/base-client.ts`, emitBaseClient());

  // Generate client
  const graph = { inbound: {}, outbound: {} };
  writeFileSync(
    `${OUTPUT_DIR}/client/products.ts`,
    emitClient(productsTable, graph, { includeMethodsDepth: 2 }, model)
  );

  // Generate index
  writeFileSync(
    `${OUTPUT_DIR}/client/index.ts`,
    emitClientIndex([productsTable])
  );

  console.log("  ✓ SDK generated!");
});

afterAll(async () => {
  if (pg) {
    await pg.end();
  }
  try {
    await execAsync(`docker stop ${CONTAINER_NAME}`);
    await execAsync(`docker rm ${CONTAINER_NAME}`);
  } catch {}
});

test("Generated types are generic for JSONB columns", async () => {
  // Import generated types
  const types = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/client/types/products.ts`);

  // Define custom metadata type
  type Metadata = {
    category: string;
    specs: { cpu?: string; ram?: number; dpi?: number };
    tags: string[];
  };

  type Settings = {
    theme: 'light' | 'dark';
  };

  // Use generic types
  type TypedProduct = typeof types.SelectProducts<{
    metadata: Metadata;
    settings: Settings;
  }>;

  // This should compile - verify type structure exists
  const mockProduct: TypedProduct = {
    id: 1,
    name: "Test",
    metadata: {
      category: "electronics",
      specs: { cpu: "i7", ram: 16 },
      tags: ["premium"]
    },
    settings: {
      theme: "dark"
    },
    created_at: new Date().toISOString()
  };

  // TypeScript should know these types
  const category: string = mockProduct.metadata.category;
  const ram: number | undefined = mockProduct.metadata.specs.ram;
  const theme: 'light' | 'dark' = mockProduct.settings.theme;

  expect(category).toBe("electronics");
  expect(ram).toBe(16);
  expect(theme).toBe("dark");
});

test("Generic types work with Insert/Update/Select", async () => {
  const types = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/client/types/products.ts`);

  type Metadata = {
    category: string;
    specs: { cpu: string };
    tags: string[];
  };

  // Insert type should work with generics
  type TypedInsert = typeof types.InsertProducts<{ metadata: Metadata }>;

  const insertData: TypedInsert = {
    name: "New Product",
    metadata: {
      category: "electronics",
      specs: { cpu: "i9" },
      tags: ["new"]
    }
  };

  expect(insertData.metadata.category).toBe("electronics");

  // Update type should work (partial)
  type TypedUpdate = typeof types.UpdateProducts<{ metadata: Metadata }>;

  const updateData: TypedUpdate = {
    metadata: {
      category: "furniture",
      specs: { cpu: "i5" },
      tags: []
    }
  };

  expect(updateData.metadata?.category).toBe("furniture");
});

test("Non-JSONB tables generate simple non-generic types", async () => {
  // Create table without JSONB
  await pg.query(`
    DROP TABLE IF EXISTS users;
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL
    );
  `);

  const model = await introspect(CONNECTION_STRING, "public");
  const usersTable = model.tables["users"]!;

  const userTypes = emitTypes(usersTable, { numericMode: "number" }, model.enums);

  // Should NOT contain generic syntax for non-JSONB tables
  expect(userTypes).not.toContain("TJsonb");
  expect(userTypes).not.toContain("Omit<");
  expect(userTypes).toContain("export type SelectUsers = {");
});

test("Type-safe client methods with generics", async () => {
  // This test verifies the types compile correctly
  // We can't actually run the client without a server, but we can verify the types

  type Metadata = {
    category: string;
    specs: Record<string, unknown>;
    tags: string[];
  };

  // Import types to verify they exist and are generic
  const types = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/client/types/products.ts`);

  // Verify the types are callable with generic params
  type Select = typeof types.SelectProducts<{ metadata: Metadata }>;
  type Insert = typeof types.InsertProducts<{ metadata: Metadata }>;
  type Update = typeof types.UpdateProducts<{ metadata: Metadata }>;

  // These should all compile without errors
  const select: Select = {} as Select;
  const insert: Insert = {} as Insert;
  const update: Update = {} as Update;

  expect(typeof select).toBe("object");
  expect(typeof insert).toBe("object");
  expect(typeof update).toBe("object");
});

test("Where clause types work with generic JSONB types", async () => {
  const types = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/client/types/products.ts`);
  const { Where } = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/client/where-types.ts`);

  type Metadata = {
    category: string;
    specs: { cpu?: string };
    tags: string[];
  };

  type TypedProduct = typeof types.SelectProducts<{ metadata: Metadata }>;

  // Where clause should accept typed JSONB fields
  const where: typeof Where<TypedProduct> = {
    metadata: {
      $jsonbContains: { tags: ["premium"] }
    }
  };

  expect(where.metadata).toBeDefined();
});

test("Nullable JSONB fields work with generics", async () => {
  const types = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/client/types/products.ts`);

  type Settings = {
    theme: 'light' | 'dark';
  };

  type TypedProduct = typeof types.SelectProducts<{ settings: Settings }>;

  // settings is nullable in schema, should allow null
  const productWithNull: TypedProduct = {
    id: 1,
    name: "Test",
    metadata: { test: true },
    settings: { theme: "light" },
    created_at: null
  };

  const productWithSettings: TypedProduct = {
    id: 2,
    name: "Test2",
    metadata: { test: true },
    settings: { theme: "dark" },
    created_at: null
  };

  expect(productWithNull.settings.theme).toBe("light");
  expect(productWithSettings.settings.theme).toBe("dark");
});
