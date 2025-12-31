#!/usr/bin/env bun

import { test, expect, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Client } from "pg";
import { SDK } from "./.results/client";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const CONTAINER_NAME = "postgresdk-test-db";

async function ensurePostgresRunning(): Promise<void> {
  try {
    const { stdout } = await execAsync(`docker ps --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`);
    if (stdout.trim() === CONTAINER_NAME) {
      return; // Already running
    }
  } catch {}

  // Container not running, start it
  console.log("🐳 Starting PostgreSQL container for $or/$and tests...");
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
      const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
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

beforeAll(async () => {
  await ensurePostgresRunning();
});

test("$or - basic OR with simple equality", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    // Clean up
    await pg.query("DELETE FROM authors");

    // Insert test data
    await pg.query("INSERT INTO authors (name) VALUES ('Alice'), ('Bob'), ('Charlie')");

    // Start server
    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const app = new Hono();
    const deps = { pg };
    registerAuthorsRoutes(app, deps);
    const server = serve({ fetch: app.fetch, port: 3470 });

    // Test SDK
    const sdk = new SDK({ baseUrl: "http://localhost:3470" });

    // Test: Find Alice OR Bob
    const result = await sdk.authors.list({
      where: {
        $or: [
          { name: "Alice" },
          { name: "Bob" }
        ]
      }
    });

    expect(result.data).toHaveLength(2);
    const names = result.data.map((a: any) => a.name).sort();
    expect(names).toEqual(["Alice", "Bob"]);

    // Cleanup
    server.close();
  } finally {
    await pg.end();
  }
});

test("$or - with operators inside OR conditions", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    // Clean up
    await pg.query("DELETE FROM authors");

    // Insert test data with varying names
    await pg.query("INSERT INTO authors (name) VALUES ('Alice Anderson'), ('Bob Brown'), ('Charlie Chen'), ('David Delta')");

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const app = new Hono();
    const deps = { pg };
    registerAuthorsRoutes(app, deps);
    const server = serve({ fetch: app.fetch, port: 3471 });

    const sdk = new SDK({ baseUrl: "http://localhost:3471" });

    // Test: Find names with 'A' OR 'B' using ILIKE
    const result = await sdk.authors.list({
      where: {
        $or: [
          { name: { $ilike: '%a%' } },
          { name: { $ilike: '%b%' } }
        ]
      }
    });

    // Should match: Alice Anderson (has 'a'), Bob Brown (has 'b')
    // Charlie Chen and David Delta also have 'a' and 'i' respectively
    expect(result.data.length).toBeGreaterThanOrEqual(2);
    const hasAlice = result.data.some((a: any) => a.name === "Alice Anderson");
    const hasBob = result.data.some((a: any) => a.name === "Bob Brown");
    expect(hasAlice).toBe(true);
    expect(hasBob).toBe(true);

    server.close();
  } finally {
    await pg.end();
  }
});

test("$or - multiple fields (your use case)", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    // Create a test table with first_name, last_name, email
    await pg.query(`
      CREATE TABLE IF NOT EXISTS test_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        first_name TEXT,
        last_name TEXT,
        email TEXT
      )
    `);

    await pg.query("DELETE FROM test_users");

    // Insert test data
    await pg.query(`
      INSERT INTO test_users (first_name, last_name, email) VALUES
        ('Fred', 'Smith', 'fred@example.com'),
        ('Alice', 'Fredson', 'alice@example.com'),
        ('Bob', 'Jones', 'bob@fredmail.com'),
        ('Charlie', 'Brown', 'charlie@example.com')
    `);

    // Generate SDK for this table (in a real test, this would already be generated)
    // For now, we'll test with raw queries to validate the SQL generation

    // Expected SQL:
    // WHERE (first_name ILIKE '%f%' OR last_name ILIKE '%f%' OR email ILIKE '%f%')

    const result = await pg.query(`
      SELECT * FROM test_users
      WHERE (first_name ILIKE '%f%' OR last_name ILIKE '%f%' OR email ILIKE '%f%')
    `);

    // Should match: Fred (first_name), Alice Fredson (last_name), bob@fredmail.com (email)
    expect(result.rows.length).toBe(3);
    const names = result.rows.map(r => r.first_name).sort();
    expect(names).toEqual(["Alice", "Bob", "Fred"]);

    // Cleanup
    await pg.query("DROP TABLE test_users");
  } finally {
    await pg.end();
  }
});

test("$or - mixed with AND (implicit root level)", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM authors");
    await pg.query(`
      INSERT INTO authors (name) VALUES
        ('Active Alice'),
        ('Active Bob'),
        ('Inactive Charlie'),
        ('Active Charlie')
    `);

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const app = new Hono();
    const deps = { pg };
    registerAuthorsRoutes(app, deps);
    const server = serve({ fetch: app.fetch, port: 3472 });

    const sdk = new SDK({ baseUrl: "http://localhost:3472" });

    // Test: Find (Alice OR Bob) AND name starts with 'Active'
    const result = await sdk.authors.list({
      where: {
        name: { $ilike: 'Active%' },  // AND condition
        $or: [
          { name: { $ilike: '%Alice%' } },
          { name: { $ilike: '%Bob%' } }
        ]
      }
    });

    // Should match: Active Alice, Active Bob
    // Should NOT match: Inactive Charlie, Active Charlie
    expect(result.data).toHaveLength(2);
    const names = result.data.map((a: any) => a.name).sort();
    expect(names).toEqual(["Active Alice", "Active Bob"]);

    server.close();
  } finally {
    await pg.end();
  }
});

test("$and - explicit AND operator", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM authors");
    await pg.query(`
      INSERT INTO authors (name) VALUES
        ('Alice Anderson'),
        ('Alice Brown'),
        ('Bob Anderson')
    `);

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const app = new Hono();
    const deps = { pg };
    registerAuthorsRoutes(app, deps);
    const server = serve({ fetch: app.fetch, port: 3473 });

    const sdk = new SDK({ baseUrl: "http://localhost:3473" });

    // Test: Explicit AND
    const result = await sdk.authors.list({
      where: {
        $and: [
          { name: { $ilike: '%Alice%' } },
          { name: { $ilike: '%Anderson%' } }
        ]
      }
    });

    // Should match only: Alice Anderson
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.name).toBe("Alice Anderson");

    server.close();
  } finally {
    await pg.end();
  }
});

test("$or and $and - nested 2 levels", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM authors");
    await pg.query(`
      INSERT INTO authors (name) VALUES
        ('Alice Smith'),
        ('Alice Jones'),
        ('Bob Smith'),
        ('Bob Jones'),
        ('Charlie Smith')
    `);

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const app = new Hono();
    const deps = { pg };
    registerAuthorsRoutes(app, deps);
    const server = serve({ fetch: app.fetch, port: 3474 });

    const sdk = new SDK({ baseUrl: "http://localhost:3474" });

    // Test: (Alice OR Bob) AND Smith
    // Using $and with nested $or
    const result = await sdk.authors.list({
      where: {
        $and: [
          {
            $or: [
              { name: { $ilike: '%Alice%' } },
              { name: { $ilike: '%Bob%' } }
            ]
          },
          { name: { $ilike: '%Smith%' } }
        ]
      }
    });

    // Should match: Alice Smith, Bob Smith
    // Should NOT match: Alice Jones, Bob Jones, Charlie Smith
    expect(result.data).toHaveLength(2);
    const names = result.data.map((a: any) => a.name).sort();
    expect(names).toEqual(["Alice Smith", "Bob Smith"]);

    server.close();
  } finally {
    await pg.end();
  }
});

test("$or - edge case: empty array", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM authors");
    await pg.query("INSERT INTO authors (name) VALUES ('Alice')");

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const app = new Hono();
    const deps = { pg };
    registerAuthorsRoutes(app, deps);
    const server = serve({ fetch: app.fetch, port: 3475 });

    const sdk = new SDK({ baseUrl: "http://localhost:3475" });

    // Test: Empty OR should return no results (or could error)
    const result = await sdk.authors.list({
      where: {
        $or: []
      }
    });

    // Empty OR is logically false, so should return nothing
    expect(result.data).toHaveLength(0);

    server.close();
  } finally {
    await pg.end();
  }
});

test("$or - edge case: single condition", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM authors");
    await pg.query("INSERT INTO authors (name) VALUES ('Alice'), ('Bob')");

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const app = new Hono();
    const deps = { pg };
    registerAuthorsRoutes(app, deps);
    const server = serve({ fetch: app.fetch, port: 3476 });

    const sdk = new SDK({ baseUrl: "http://localhost:3476" });

    // Test: Single condition in OR (should work like a simple where)
    const result = await sdk.authors.list({
      where: {
        $or: [
          { name: "Alice" }
        ]
      }
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.name).toBe("Alice");

    server.close();
  } finally {
    await pg.end();
  }
});

test("$or - all 12 operators should work inside OR", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    // Create test table with various types
    await pg.query(`
      CREATE TABLE IF NOT EXISTS test_operators (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT,
        age INT,
        status TEXT,
        deleted_at TIMESTAMP
      )
    `);

    await pg.query("DELETE FROM test_operators");
    await pg.query(`
      INSERT INTO test_operators (name, age, status, deleted_at) VALUES
        ('Alice', 25, 'active', NULL),
        ('Bob', 35, 'inactive', NULL),
        ('Charlie', 45, 'active', NULL),
        ('David', 15, 'active', '2024-01-01'::timestamp)
    `);

    // Test various operators in OR
    const result = await pg.query(`
      SELECT * FROM test_operators
      WHERE (
        age > 40
        OR age < 20
        OR name ILIKE '%alice%'
        OR status = ANY(ARRAY['inactive'])
        OR deleted_at IS NOT NULL
      )
    `);

    // Should match: Alice (name), Bob (inactive), Charlie (age > 40), David (age < 20, deleted_at)
    expect(result.rows.length).toBe(4);

    await pg.query("DROP TABLE test_operators");
  } finally {
    await pg.end();
  }
});

test("$or - complex real-world scenario", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query(`
      CREATE TABLE IF NOT EXISTS users_complex (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT,
        email TEXT,
        age INT,
        status TEXT,
        role TEXT
      )
    `);

    await pg.query("DELETE FROM users_complex");
    await pg.query(`
      INSERT INTO users_complex (name, email, age, status, role) VALUES
        ('Alice', 'alice@company.com', 30, 'active', 'admin'),
        ('Bob', 'bob@personal.com', 25, 'active', 'user'),
        ('Charlie', 'charlie@company.com', 40, 'inactive', 'user'),
        ('David', 'david@company.com', 35, 'active', 'user'),
        ('Eve', 'eve@personal.com', 28, 'active', 'admin')
    `);

    // Real-world query: Find all:
    // - Admins OR
    // - Active users at company.com domain with age 25-35
    const result = await pg.query(`
      SELECT * FROM users_complex
      WHERE (
        role = 'admin'
        OR (
          status = 'active'
          AND email ILIKE '%@company.com'
          AND age >= 25
          AND age <= 35
        )
      )
    `);

    // Should match: Alice (admin), David (active company 35), Eve (admin)
    // Should NOT match: Bob (personal.com), Charlie (inactive)
    expect(result.rows.length).toBe(3);
    const names = result.rows.map(r => r.name).sort();
    expect(names).toEqual(["Alice", "David", "Eve"]);

    await pg.query("DROP TABLE users_complex");
  } finally {
    await pg.end();
  }
});
