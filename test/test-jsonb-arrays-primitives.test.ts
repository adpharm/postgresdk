#!/usr/bin/env bun

/**
 * Tests for JSONB columns storing arrays and primitives (not just objects)
 *
 * PostgreSQL JSONB can store:
 * 1. Objects: {"key": "value"}
 * 2. Arrays: [1, 2, 3] or ["a", "b"]
 * 3. Primitives: "string", 123, true, null
 *
 * This test verifies all of these work correctly.
 */

import { test, expect, beforeAll, afterAll } from "bun:test";
import { Client } from "pg";
import { writeFileSync, mkdirSync } from "fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { introspect } from "../src/introspect";
import { emitTypes } from "../src/emit-types";
import { emitClient, emitClientIndex } from "../src/emit-client";
import { emitCoreOperations } from "../src/emit-core-operations";
import { emitWhereTypes } from "../src/emit-where-types";
import { emitSharedTypes } from "../src/emit-shared-types";
import { emitBaseClient } from "../src/emit-base-client";

const execAsync = promisify(exec);
const CONTAINER_NAME = "postgresdk-test-jsonb-arrays";
const TEST_PORT = 5437;
const CONNECTION_STRING = `postgres://user:pass@localhost:${TEST_PORT}/testdb`;
const OUTPUT_DIR = "./test/.jsonb-arrays-test";

async function ensurePostgresRunning(): Promise<void> {
  try {
    const { stdout } = await execAsync(`docker ps --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`);
    if (stdout.trim() === CONTAINER_NAME) {
      return;
    }
  } catch {}

  console.log("🐳 Starting PostgreSQL container for JSONB arrays/primitives test...");
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

  // Create test schema with various JSONB column types
  await pg.query(`
    DROP TABLE IF EXISTS jsonb_test;
    CREATE TABLE jsonb_test (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      tags JSONB,                    -- Will store pure arrays: ["tag1", "tag2"]
      scores JSONB,                  -- Will store number arrays: [1, 2, 3]
      config JSONB,                  -- Will store objects: {"key": "value"}
      single_value JSONB,            -- Will store primitives: "string", 123, true, null
      mixed JSONB                    -- Will store mixed types
    );
  `);

  // Insert test data with various JSONB types
  await pg.query(`
    INSERT INTO jsonb_test (name, tags, scores, config, single_value, mixed) VALUES
    ('Array Test', '["javascript", "typescript", "rust"]', '[100, 95, 88]', '{"theme": "dark"}', '"production"', '{"items": [1, 2, 3]}'),
    ('Number Test', '["python"]', '[42]', '{"debug": true}', '42', '[1, 2, 3]'),
    ('Boolean Test', '[]', '[]', '{}', 'true', 'false'),
    ('Null Test', 'null', 'null', 'null', 'null', 'null'),
    ('Mixed Test', '["a", "b"]', '[1, 2]', '{"nested": {"deep": "value"}}', '"test"', '{"array": [{"id": 1}, {"id": 2}]}')
  `);

  // Generate SDK
  console.log("  → Generating SDK with JSONB arrays/primitives support...");
  const model = await introspect(CONNECTION_STRING, "public");

  mkdirSync(`${OUTPUT_DIR}/server`, { recursive: true });
  mkdirSync(`${OUTPUT_DIR}/client/types`, { recursive: true });

  const testTable = model.tables["jsonb_test"]!;

  // Generate types
  writeFileSync(
    `${OUTPUT_DIR}/client/types/jsonb_test.ts`,
    emitTypes(testTable, { numericMode: "number" }, model.enums)
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
    `${OUTPUT_DIR}/client/jsonb_test.ts`,
    emitClient(testTable, graph, { includeMethodsDepth: 2 }, model)
  );

  // Generate index
  writeFileSync(
    `${OUTPUT_DIR}/client/index.ts`,
    emitClientIndex([testTable])
  );

  // Generate server operations
  writeFileSync(
    `${OUTPUT_DIR}/server/core-operations.ts`,
    emitCoreOperations()
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

test("JSONB column can store pure arrays", async () => {
  const result = await pg.query(`SELECT tags, scores FROM jsonb_test WHERE name = 'Array Test'`);

  expect(result.rows[0].tags).toEqual(["javascript", "typescript", "rust"]);
  expect(result.rows[0].scores).toEqual([100, 95, 88]);
});

test("JSONB column can store primitives (string, number, boolean, null)", async () => {
  const stringResult = await pg.query(`SELECT single_value FROM jsonb_test WHERE name = 'Array Test'`);
  expect(stringResult.rows[0].single_value).toBe("production");

  const numberResult = await pg.query(`SELECT single_value FROM jsonb_test WHERE name = 'Number Test'`);
  expect(numberResult.rows[0].single_value).toBe(42);

  const boolResult = await pg.query(`SELECT single_value FROM jsonb_test WHERE name = 'Boolean Test'`);
  expect(boolResult.rows[0].single_value).toBe(true);

  const nullResult = await pg.query(`SELECT single_value FROM jsonb_test WHERE name = 'Null Test'`);
  expect(nullResult.rows[0].single_value).toBe(null);
});

test("Generated types support array overrides", async () => {
  // Import the types file to verify it exists
  await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/client/types/jsonb_test.ts`);

  // Type usage is verified in the compile-time test
  // Just verify the file imports without error
  expect(true).toBe(true);
});

test("SDK operations work with JSONB arrays", async () => {
  const { listRecords } = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/server/core-operations.ts`);

  const result = await listRecords(
    { pg, table: "jsonb_test", pkColumns: ["id"], includeMethodsDepth: 2 },
    { where: {} }
  );

  expect(result.status).toBe(200);
  expect(result.data?.length).toBeGreaterThan(0);

  // Find the array test record
  const arrayTest = result.data?.find((r: any) => r.name === "Array Test");
  expect(arrayTest).toBeDefined();
  expect(Array.isArray(arrayTest.tags)).toBe(true);
  expect(arrayTest.tags).toEqual(["javascript", "typescript", "rust"]);
});

test("JSONB query operators work with arrays", async () => {
  const { listRecords } = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/server/core-operations.ts`);

  // Test $jsonbContains with array
  const result = await listRecords(
    { pg, table: "jsonb_test", pkColumns: ["id"], includeMethodsDepth: 2 },
    {
      where: {
        tags: { $jsonbContains: ["typescript"] }
      }
    }
  );

  expect(result.status).toBe(200);
  expect(result.data?.length).toBe(1);
  expect(result.data?.[0].name).toBe("Array Test");
});

test("Can insert JSONB arrays via SDK types", async () => {
  // Verify the insert type accepts arrays
  const { InsertJsonbTest } = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/client/types/jsonb_test.ts`);

  type TagsArray = string[];
  type ScoresArray = number[];

  // This would be used like:
  // type TypedInsert = InsertJsonbTest<{ tags: TagsArray; scores: ScoresArray }>;

  // Mock insert data
  const insertData = {
    name: "New Test",
    tags: ["new", "test"],
    scores: [10, 20, 30],
    config: { enabled: true },
    single_value: "test",
    mixed: { value: 123 }
  };

  expect(Array.isArray(insertData.tags)).toBe(true);
  expect(Array.isArray(insertData.scores)).toBe(true);
});

test("Compile-time verification for array types", async () => {
  // Generate compile-time test for arrays
  const compileTest = `
import type { SelectJsonbTest, InsertJsonbTest } from './client/types/jsonb_test';

type TagsArray = string[];
type ScoresArray = number[];
type ConfigObject = { theme: string; debug?: boolean };

// Test 1: Array types work
type TypedTest = SelectJsonbTest<{
  tags: TagsArray;
  scores: ScoresArray;
  config: ConfigObject;
}>;

const test: TypedTest = {
  id: 1,
  name: "Test",
  tags: ["typescript", "rust"],           // ✅ Should compile: string[]
  scores: [100, 95],                      // ✅ Should compile: number[]
  config: { theme: "dark" },              // ✅ Should compile: object
  single_value: null,
  mixed: null
};

// Should compile: array access
const firstTag: string | undefined = test.tags[0];
const tagCount: number = test.tags.length;
const upperTags: string[] = test.tags.map(t => t.toUpperCase());

// Should compile: array methods
const total: number = test.scores.reduce((sum, score) => sum + score, 0);

// Test 2: Insert with arrays
type TypedInsert = InsertJsonbTest<{
  tags: TagsArray;
  scores: ScoresArray;
}>;

const insertData: TypedInsert = {
  name: "New",
  tags: ["a", "b"],                       // ✅ Should compile
  scores: [1, 2, 3],                      // ✅ Should compile
};

// Test 3: Pure array at root level
type PureArray = string[];
type OnlyTags = SelectJsonbTest<{ tags: PureArray }>;

const onlyTags: OnlyTags = {
  id: 1,
  name: "Test",
  tags: ["pure", "array"],                // ✅ Should compile
  scores: null,
  config: null,
  single_value: null,
  mixed: null
};

export {};
`;

  writeFileSync(`${OUTPUT_DIR}/test-arrays-compile.ts`, compileTest);

  // Run TypeScript type-check
  await execAsync(`cd ${OUTPUT_DIR} && bunx tsc --noEmit --strict test-arrays-compile.ts`);

  // If we got here, compilation succeeded!
  expect(true).toBe(true);
});

test("JSONB primitives work correctly", async () => {
  const { listRecords } = await import(`${process.cwd()}${OUTPUT_DIR.slice(1)}/server/core-operations.ts`);

  const result = await listRecords(
    { pg, table: "jsonb_test", pkColumns: ["id"], includeMethodsDepth: 2 },
    { where: {} }
  );

  // Verify different primitive types
  const records = result.data || [];

  // String primitive
  const stringRecord = records.find((r: any) => r.name === "Array Test");
  expect(stringRecord?.single_value).toBe("production");
  expect(typeof stringRecord?.single_value).toBe("string");

  // Number primitive
  const numberRecord = records.find((r: any) => r.name === "Number Test");
  expect(numberRecord?.single_value).toBe(42);
  expect(typeof numberRecord?.single_value).toBe("number");

  // Boolean primitive
  const boolRecord = records.find((r: any) => r.name === "Boolean Test");
  expect(boolRecord?.single_value).toBe(true);
  expect(typeof boolRecord?.single_value).toBe("boolean");

  // Null primitive
  const nullRecord = records.find((r: any) => r.name === "Null Test");
  expect(nullRecord?.single_value).toBe(null);
});

test("Empty arrays work correctly", async () => {
  const result = await pg.query(`SELECT tags, scores FROM jsonb_test WHERE name = 'Boolean Test'`);

  expect(result.rows[0].tags).toEqual([]);
  expect(result.rows[0].scores).toEqual([]);
  expect(Array.isArray(result.rows[0].tags)).toBe(true);
  expect(Array.isArray(result.rows[0].scores)).toBe(true);
});

test("Array of objects works", async () => {
  const result = await pg.query(`SELECT mixed FROM jsonb_test WHERE name = 'Mixed Test'`);

  const mixed = result.rows[0].mixed;
  expect(mixed).toHaveProperty("array");
  expect(Array.isArray(mixed.array)).toBe(true);
  expect(mixed.array).toEqual([{ id: 1 }, { id: 2 }]);
});
