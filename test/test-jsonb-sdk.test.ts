#!/usr/bin/env bun

/**
 * Integration test for JSONB support in generated SDK
 * Tests that JSONB operators work correctly through the full stack:
 * - Type generation
 * - SDK client generation
 * - WHERE clause building
 * - SQL execution
 */

import { test, expect, beforeAll, afterAll } from "bun:test";
import { Client } from "pg";
import { writeFileSync, mkdirSync } from "fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { introspect } from "../src/introspect";
import { emitTypes } from "../src/emit-types";
import { emitZod } from "../src/emit-zod";
import { emitCoreOperations } from "../src/emit-core-operations";
import { emitWhereTypes } from "../src/emit-where-types";
import { emitSharedTypes } from "../src/emit-shared-types";

const execAsync = promisify(exec);
const CONTAINER_NAME = "postgresdk-test-jsonb-sdk";
const TEST_PORT = 5434;
const CONNECTION_STRING = `postgres://user:pass@localhost:${TEST_PORT}/testdb`;
const OUTPUT_DIR = "./test/.jsonb-sdk-test";

async function ensurePostgresRunning(): Promise<void> {
  try {
    const { stdout } = await execAsync(`docker ps --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`);
    if (stdout.trim() === CONTAINER_NAME) {
      return;
    }
  } catch {}

  console.log("🐳 Starting PostgreSQL container for JSONB SDK integration test...");
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
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Insert test data
  await pg.query(`
    INSERT INTO products (name, metadata) VALUES
    ('Laptop', '{"category": "electronics", "specs": {"cpu": "i7", "ram": 16}, "tags": ["premium", "sale"], "stock": 50}'),
    ('Mouse', '{"category": "electronics", "specs": {"dpi": 1600}, "tags": ["basic"], "stock": 200}'),
    ('Desk', '{"category": "furniture", "specs": {"material": "wood"}, "tags": ["premium"], "stock": 10}'),
    ('Chair', '{"category": "furniture", "specs": {"material": "leather", "adjustable": true}, "tags": ["premium", "ergonomic"], "stock": 25}'),
    ('Keyboard', '{"category": "electronics", "tags": ["sale"], "stock": 100}')
  `);

  // Generate SDK
  console.log("  → Generating SDK with JSONB support...");
  const model = await introspect(CONNECTION_STRING, "public");

  mkdirSync(`${OUTPUT_DIR}/server`, { recursive: true });
  mkdirSync(`${OUTPUT_DIR}/client/types`, { recursive: true });

  // Generate necessary files
  const productsTable = model.tables["products"]!;

  // Types
  writeFileSync(
    `${OUTPUT_DIR}/client/types/products.ts`,
    emitTypes(productsTable, { numericMode: "number" }, model.enums)
  );

  // WHERE types
  writeFileSync(`${OUTPUT_DIR}/client/where-types.ts`, emitWhereTypes());

  // Shared types
  writeFileSync(`${OUTPUT_DIR}/client/types/shared.ts`, emitSharedTypes());

  // Core operations
  writeFileSync(`${OUTPUT_DIR}/server/core-operations.ts`, emitCoreOperations());

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

test("SDK integration - $jsonbContains operator", async () => {
  // Import generated core operations
  const { listRecords } = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/server/core-operations.ts`);

  const result = await listRecords(
    { pg, table: "products", pkColumns: ["id"], includeMethodsDepth: 2 },
    {
      where: {
        metadata: { $jsonbContains: { tags: ["premium"] } }
      }
    }
  );

  expect(result.status).toBe(200);
  expect(result.data?.length).toBe(3); // Laptop, Desk, Chair
  expect(result.data?.map((p: any) => p.name).sort()).toEqual(["Chair", "Desk", "Laptop"]);
});

test("SDK integration - $jsonbHasKey operator", async () => {
  const { listRecords } = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/server/core-operations.ts`);

  const result = await listRecords(
    { pg, table: "products", pkColumns: ["id"], includeMethodsDepth: 2 },
    {
      where: {
        metadata: { $jsonbHasKey: "specs" }
      }
    }
  );

  expect(result.status).toBe(200);
  expect(result.data?.length).toBe(4); // All except Keyboard (no specs)
});

test("SDK integration - $jsonbPath with equality", async () => {
  const { listRecords } = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/server/core-operations.ts`);

  const result = await listRecords(
    { pg, table: "products", pkColumns: ["id"], includeMethodsDepth: 2 },
    {
      where: {
        metadata: {
          $jsonbPath: {
            path: ["category"],
            operator: "$eq",
            value: "electronics"
          }
        }
      }
    }
  );

  expect(result.status).toBe(200);
  expect(result.data?.length).toBe(3); // Laptop, Mouse, Keyboard
  expect(result.data?.map((p: any) => p.name).sort()).toEqual(["Keyboard", "Laptop", "Mouse"]);
});

test("SDK integration - $jsonbPath with numeric comparison", async () => {
  const { listRecords } = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/server/core-operations.ts`);

  const result = await listRecords(
    { pg, table: "products", pkColumns: ["id"], includeMethodsDepth: 2 },
    {
      where: {
        metadata: {
          $jsonbPath: {
            path: ["stock"],
            operator: "$gte",
            value: 50
          }
        }
      }
    }
  );

  expect(result.status).toBe(200);
  expect(result.data?.length).toBe(3); // Laptop (50), Mouse (200), Keyboard (100)
  expect(result.data?.map((p: any) => p.name).sort()).toEqual(["Keyboard", "Laptop", "Mouse"]);
});

test("SDK integration - $jsonbPath with nested path", async () => {
  const { listRecords } = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/server/core-operations.ts`);

  const result = await listRecords(
    { pg, table: "products", pkColumns: ["id"], includeMethodsDepth: 2 },
    {
      where: {
        metadata: {
          $jsonbPath: {
            path: ["specs", "material"],
            operator: "$eq",
            value: "wood"
          }
        }
      }
    }
  );

  expect(result.status).toBe(200);
  expect(result.data?.length).toBe(1); // Desk
  expect(result.data?.[0]?.name).toBe("Desk");
});

test("SDK integration - $jsonbHasAllKeys operator", async () => {
  const { listRecords } = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/server/core-operations.ts`);

  const result = await listRecords(
    { pg, table: "products", pkColumns: ["id"], includeMethodsDepth: 2 },
    {
      where: {
        metadata: { $jsonbHasAllKeys: ["category", "specs", "tags"] }
      }
    }
  );

  expect(result.status).toBe(200);
  expect(result.data?.length).toBe(4); // All except Keyboard (no specs key)
});

test("SDK integration - $jsonbHasAnyKeys operator", async () => {
  const { listRecords } = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/server/core-operations.ts`);

  const result = await listRecords(
    { pg, table: "products", pkColumns: ["id"], includeMethodsDepth: 2 },
    {
      where: {
        metadata: { $jsonbHasAnyKeys: ["specs", "nonexistent"] }
      }
    }
  );

  expect(result.status).toBe(200);
  expect(result.data?.length).toBe(4); // All with specs
});

test("SDK integration - Combined JSONB operators with $and", async () => {
  const { listRecords } = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/server/core-operations.ts`);

  const result = await listRecords(
    { pg, table: "products", pkColumns: ["id"], includeMethodsDepth: 2 },
    {
      where: {
        $and: [
          { metadata: { $jsonbContains: { tags: ["premium"] } } },
          { metadata: { $jsonbPath: { path: ["category"], value: "electronics" } } }
        ]
      }
    }
  );

  expect(result.status).toBe(200);
  expect(result.data?.length).toBe(1); // Only Laptop (premium + electronics)
  expect(result.data?.[0]?.name).toBe("Laptop");
});

test("SDK integration - Multiple $jsonbPath conditions with $and", async () => {
  const { listRecords } = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/server/core-operations.ts`);

  const result = await listRecords(
    { pg, table: "products", pkColumns: ["id"], includeMethodsDepth: 2 },
    {
      where: {
        $and: [
          { metadata: { $jsonbPath: { path: ["category"], value: "electronics" } } },
          { metadata: { $jsonbPath: { path: ["stock"], operator: "$gt", value: 100 } } }
        ]
      }
    }
  );

  expect(result.status).toBe(200);
  expect(result.data?.length).toBe(1); // Only Mouse (electronics + stock 200)
  expect(result.data?.[0]?.name).toBe("Mouse");
});

test("SDK integration - $jsonbContainedBy operator", async () => {
  const { listRecords } = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/server/core-operations.ts`);

  const result = await listRecords(
    { pg, table: "products", pkColumns: ["id"], includeMethodsDepth: 2 },
    {
      where: {
        metadata: {
          $jsonbContainedBy: {
            category: "electronics",
            tags: ["basic"],
            specs: { dpi: 1600 },
            stock: 200,
            extra: "field"
          }
        }
      }
    }
  );

  expect(result.status).toBe(200);
  expect(result.data?.length).toBe(1); // Only Mouse (all its fields are in the containedBy object)
  expect(result.data?.[0]?.name).toBe("Mouse");
});

test("SDK integration - Complex nested path with ILIKE", async () => {
  const { listRecords } = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/server/core-operations.ts`);

  const result = await listRecords(
    { pg, table: "products", pkColumns: ["id"], includeMethodsDepth: 2 },
    {
      where: {
        metadata: {
          $jsonbPath: {
            path: ["specs", "material"],
            operator: "$ilike",
            value: "%WOOD%"
          }
        }
      }
    }
  );

  expect(result.status).toBe(200);
  expect(result.data?.length).toBe(1); // Desk
  expect(result.data?.[0]?.name).toBe("Desk");
});
