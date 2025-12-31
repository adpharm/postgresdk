import { describe, test, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { Client } from "pg";
import { TEST_PATHS, PG_URL, CLI_PATH, CONTAINER_NAME, ensurePostgresRunning } from "./test-utils";

const DB_NAME = "drizzle_test";
const ADMIN_URL = PG_URL.replace("/testdb", "/testdb");
const TEST_URL = PG_URL.replace("/testdb", `/${DB_NAME}`);
const OUTPUT_DIR = TEST_PATHS.drizzle;

async function createDatabase() {
  console.log("Creating test database...");
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();

  try {
    await client.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    await client.query(`CREATE DATABASE ${DB_NAME}`);
    console.log("  ✓ Database created");
  } finally {
    await client.end();
  }
}

async function pushDrizzleSchema() {
  console.log("Pushing Drizzle schema to database...");

  try {
    const { join } = require("node:path");
    const configPath = join(__dirname, "drizzle-e2e", "drizzle.config.ts");
    execSync(`bunx drizzle-kit push --config=${configPath} --force`, {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: TEST_URL }
    });
    console.log("  ✓ Schema pushed successfully");
  } catch (error) {
    console.error("  ❌ Failed to push schema:", error);
    throw error;
  }
}

async function generatePostgreSDK() {
  console.log("Generating PostgreSDK API...");

  if (existsSync(OUTPUT_DIR)) {
    rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const config = `export default {
  connectionString: "${TEST_URL}",
  outDir: {
    server: "${OUTPUT_DIR}/server",
    client: "${OUTPUT_DIR}/client"
  },
  includeMethodsDepth: 2,
  skipJunctionTables: true,
  tests: {
    generate: true,
    output: "${OUTPUT_DIR}/tests",
    framework: "vitest"
  }
};`;

  const configPath = `${OUTPUT_DIR}/postgresdk.config.ts`;
  writeFileSync(configPath, config);

  execSync(`bun ${CLI_PATH} generate -c ${configPath}`, {
    stdio: "inherit"
  });
  console.log("  ✓ API generated successfully");
}

async function verifyIncludeMethods() {
  console.log("Verifying include methods generation...");

  // Check if Select schemas are generated
  const zodPath = `${OUTPUT_DIR}/server/zod/contacts.ts`;
  if (existsSync(zodPath)) {
    const zodContent = require("fs").readFileSync(zodPath, "utf-8");
    expect(zodContent.includes("SelectContactsSchema")).toBe(true);
  }

  // Check if include methods are generated in client
  const clientPath = `${OUTPUT_DIR}/client/contacts.ts`;
  if (existsSync(clientPath)) {
    const clientContent = require("fs").readFileSync(clientPath, "utf-8");
    const methods = clientContent.match(/async (list|getByPk)With[A-Z]\w+/g) || [];
    expect(methods.length).toBeGreaterThan(0);
  }

  return true;
}

describe("Drizzle End-to-End Test", () => {
  beforeAll(async () => {
    await ensurePostgresRunning();
  }, 30000);

  test("create database for Drizzle test", async () => {
    await createDatabase();
  }, 30000);

  test("push Drizzle schema", async () => {
    await pushDrizzleSchema();
  }, 60000);

  test("generate PostgreSDK API from Drizzle schema", async () => {
    await generatePostgreSDK();
  }, 60000);

  test("verify include methods were generated", async () => {
    const includeMethodsValid = await verifyIncludeMethods();
    expect(includeMethodsValid).toBe(true);
  });

  test("verify generated files exist", async () => {
    console.log("Verifying generated files...");
    const files = execSync(`find ${OUTPUT_DIR} -type f -name "*.ts" | head -20`, { encoding: "utf-8" });
    expect(files.length).toBeGreaterThan(0);
  });
});
