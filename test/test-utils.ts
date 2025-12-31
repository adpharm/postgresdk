import { Client } from "pg";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { join, resolve } from "node:path";

const execAsync = promisify(exec);

export const CONTAINER_NAME = "postgresdk-test-db";
export const PG_URL = "postgres://user:pass@localhost:5432/testdb";

// CLI path - absolute path to CLI script from workspace root
export const CLI_PATH = resolve(__dirname, "../src/cli.ts");
export const WORKSPACE_ROOT = resolve(__dirname, "..");

export const TEST_PORTS = {
  gen: 3456,
  whereClause: 3457,
  whereOrAnd: 3458,
  pull: 3459,
  onRequest: 3463,
  onRequestNoHook: 3464,
  enums: 3465,
  drizzle: 3466,
} as const;

export const TEST_PATHS = {
  output: "test/.test-output",
  init: "test/.test-output/init",
  gen: "test/.test-output/gen",
  genWithTests: "test/.test-output/gen-with-tests",
  pull: "test/.test-output/pull",
  pullConfig: "test/.test-output/pull-config",
  pullToken: "test/.test-output/pull-token",
  enums: "test/.test-output/enums",
  typecheck: "test/.test-output/typecheck",
  drizzle: "test/.test-output/drizzle",
  apikey: "test/.test-output/apikey",
  jwt: "test/.test-output/jwt",
  sameDir: "test/.test-output/same-dir",
} as const;

/**
 * Ensures PostgreSQL container is running and ready to accept connections
 */
export async function ensurePostgresRunning(): Promise<void> {
  try {
    const { stdout } = await execAsync(`docker ps --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`);
    if (stdout.trim() === CONTAINER_NAME) {
      return; // Already running
    }
  } catch {}

  // Container not running, start it
  console.log("🐳 Starting PostgreSQL container...");
  try {
    const { stdout } = await execAsync(`docker ps -a --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`);
    if (stdout.trim() === CONTAINER_NAME) {
      await execAsync(`docker start ${CONTAINER_NAME}`);
    } else {
      await execAsync(`docker run -d --name ${CONTAINER_NAME} -e POSTGRES_USER=user -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=testdb -p 5432:5432 postgres:17-alpine`);
    }
  } catch (error) {
    console.error("Failed to start container:", error);
    throw error;
  }

  // Wait for PostgreSQL to be ready
  console.log("  → Waiting for PostgreSQL to be ready...");
  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    try {
      const pg = new Client({ connectionString: PG_URL });
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

/**
 * Creates a fresh test database with the given name
 */
export async function createTestDatabase(dbName: string): Promise<void> {
  const pg = new Client({ connectionString: PG_URL.replace("/testdb", "/postgres") });
  await pg.connect();

  try {
    // Drop existing database if it exists
    await pg.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await pg.query(`CREATE DATABASE ${dbName}`);
    console.log(`  ✓ Created database: ${dbName}`);
  } finally {
    await pg.end();
  }
}

/**
 * Connects to a test database and returns the client
 */
export async function connectToTestDb(dbName: string = "testdb"): Promise<Client> {
  const connectionString = PG_URL.replace("/testdb", `/${dbName}`);
  const pg = new Client({ connectionString });
  await pg.connect();
  return pg;
}

/**
 * Cleans up test tables
 */
export async function cleanupTables(pg: Client, tables: string[]): Promise<void> {
  for (const table of tables.reverse()) {
    try {
      await pg.query(`DELETE FROM ${table}`);
    } catch {
      // Table might not exist yet
    }
  }
}

/**
 * Waits for a server to be ready
 */
export async function waitForServer(port: number, maxAttempts: number = 10): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Server on port ${port} failed to start`);
}
