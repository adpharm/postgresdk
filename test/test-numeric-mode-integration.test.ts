#!/usr/bin/env bun

/**
 * Integration test for numericMode functionality
 * Tests actual runtime behavior of integer types with auto mode
 */

import { test, expect, beforeAll, afterAll } from "bun:test";
import { Client } from "pg";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { generate } from "../src/index";

const execAsync = promisify(exec);
const CONTAINER_NAME = "postgresdk-test-numeric-mode";
const TEST_PORT = 5439;
const CONNECTION_STRING = `postgres://user:pass@localhost:${TEST_PORT}/testdb`;
const OUTPUT_DIR = "./test/.numeric-mode-test";

async function ensurePostgresRunning(): Promise<void> {
  try {
    const { stdout } = await execAsync(`docker ps --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`);
    if (stdout.trim() === CONTAINER_NAME) {
      return;
    }
  } catch {}

  console.log("🐳 Starting PostgreSQL container for numeric mode test...");
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
let SDK: any;

beforeAll(async () => {
  await ensurePostgresRunning();

  pg = new Client({ connectionString: CONNECTION_STRING });
  await pg.connect();

  // Create test schema with all numeric types
  await pg.query(`
    DROP TABLE IF EXISTS numeric_test;
    CREATE TABLE numeric_test (
      id SERIAL PRIMARY KEY,           -- int4, should be number
      small_val SMALLINT NOT NULL,     -- int2, should be number
      big_val BIGINT NOT NULL,         -- int8, should be string
      decimal_val NUMERIC(10,2) NOT NULL,  -- numeric, should be string
      float_val REAL NOT NULL,         -- float4, should be number
      double_val DOUBLE PRECISION NOT NULL, -- float8, should be number
      name TEXT NOT NULL
    );
  `);

  // Generate SDK with auto mode
  console.log("  → Generating SDK with numericMode: 'auto'...");

  // Clean output dir
  try {
    rmSync(OUTPUT_DIR, { recursive: true, force: true });
  } catch {}

  // Create temp config file
  const configPath = `${OUTPUT_DIR}/postgresdk.config.ts`;
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(configPath, `
export default {
  connectionString: "${CONNECTION_STRING}",
  schema: "public",
  outDir: { client: "${OUTPUT_DIR}/client", server: "${OUTPUT_DIR}/server" },
  serverFramework: "hono" as const,
  numericMode: "auto" as const
};
`);

  await generate(configPath);

  // Import generated SDK
  const { SDK: GeneratedSDK } = await import(`../${OUTPUT_DIR}/client/index.ts`);
  SDK = GeneratedSDK;

  console.log("  ✓ SDK generated");
});

afterAll(async () => {
  await pg?.end();
  // Cleanup
  try {
    rmSync(OUTPUT_DIR, { recursive: true, force: true });
  } catch {}
});

test("numericMode auto: int4 (SERIAL) returns number", async () => {
  // Direct DB query
  const { rows } = await pg.query(`
    INSERT INTO numeric_test (small_val, big_val, decimal_val, float_val, double_val, name)
    VALUES (100, 9223372036854775807, 99.99, 3.14, 2.71828, 'test')
    RETURNING *
  `);

  const dbRecord = rows[0];

  // Verify pg driver returns int4 as number
  expect(typeof dbRecord.id).toBe("number");
  expect(typeof dbRecord.small_val).toBe("number");

  // int8 is returned as string by pg driver for precision safety
  expect(typeof dbRecord.big_val).toBe("string");

  // numeric is returned as string by pg driver
  expect(typeof dbRecord.decimal_val).toBe("string");

  // floats are numbers
  expect(typeof dbRecord.float_val).toBe("number");
  expect(typeof dbRecord.double_val).toBe("number");
});

test("generated types match auto mode expectations", async () => {
  // Read generated type file
  const typeFile = await Bun.file(`${OUTPUT_DIR}/client/types/numeric_test.ts`).text();

  // int4 and int2 should be number
  expect(typeFile).toContain("id: number");
  expect(typeFile).toContain("small_val: number");

  // int8 and numeric should be string
  expect(typeFile).toContain("big_val: string");
  expect(typeFile).toContain("decimal_val: string");

  // floats should be number
  expect(typeFile).toContain("float_val: number");
  expect(typeFile).toContain("double_val: number");
});

test("generated Zod schemas match auto mode expectations", async () => {
  // Read generated Zod file
  const zodFile = await Bun.file(`${OUTPUT_DIR}/client/zod/numeric_test.ts`).text();

  // int4 and int2 should be z.number()
  expect(zodFile).toContain("id: z.number()");
  expect(zodFile).toContain("small_val: z.number()");

  // int8 and numeric should be z.string()
  expect(zodFile).toContain("big_val: z.string()");
  expect(zodFile).toContain("decimal_val: z.string()");

  // floats should be z.number()
  expect(zodFile).toContain("float_val: z.number()");
  expect(zodFile).toContain("double_val: z.number()");
});

test("numericMode string: all become strings", async () => {
  const outputDir = "./test/.numeric-mode-string-test";

  try {
    rmSync(outputDir, { recursive: true, force: true });
  } catch {}

  mkdirSync(outputDir, { recursive: true });
  const configPath = `${outputDir}/postgresdk.config.ts`;
  writeFileSync(configPath, `
export default {
  connectionString: "${CONNECTION_STRING}",
  schema: "public",
  outDir: { client: "${outputDir}/client", server: "${outputDir}/server" },
  serverFramework: "hono" as const,
  numericMode: "string" as const
};
`);

  await generate(configPath);

  const typeFile = await Bun.file(`${outputDir}/client/types/numeric_test.ts`).text();

  // All numeric types should be string
  expect(typeFile).toContain("id: string");
  expect(typeFile).toContain("small_val: string");
  expect(typeFile).toContain("big_val: string");
  expect(typeFile).toContain("decimal_val: string");
  expect(typeFile).toContain("float_val: string");
  expect(typeFile).toContain("double_val: string");

  rmSync(outputDir, { recursive: true, force: true });
});

test("numericMode number: all become numbers", async () => {
  const outputDir = "./test/.numeric-mode-number-test";

  try {
    rmSync(outputDir, { recursive: true, force: true });
  } catch {}

  mkdirSync(outputDir, { recursive: true });
  const configPath = `${outputDir}/postgresdk.config.ts`;
  writeFileSync(configPath, `
export default {
  connectionString: "${CONNECTION_STRING}",
  schema: "public",
  outDir: { client: "${outputDir}/client", server: "${outputDir}/server" },
  serverFramework: "hono" as const,
  numericMode: "number" as const
};
`);

  await generate(configPath);

  const typeFile = await Bun.file(`${outputDir}/client/types/numeric_test.ts`).text();

  // All numeric types should be number
  expect(typeFile).toContain("id: number");
  expect(typeFile).toContain("small_val: number");
  expect(typeFile).toContain("big_val: number");  // DANGEROUS but allowed
  expect(typeFile).toContain("decimal_val: number");  // DANGEROUS but allowed
  expect(typeFile).toContain("float_val: number");
  expect(typeFile).toContain("double_val: number");

  rmSync(outputDir, { recursive: true, force: true });
});
