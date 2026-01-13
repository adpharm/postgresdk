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
  console.log("🐳 Starting PostgreSQL container for array operator tests...");
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

test("$in - basic usage with string values", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    // Clean up
    await pg.query("DELETE FROM authors");

    // Insert test data
    await pg.query("INSERT INTO authors (name) VALUES ('Alice'), ('Bob'), ('Charlie'), ('David')");

    // Start server
    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const app = new Hono();
    const deps = { pg };
    registerAuthorsRoutes(app, deps);
    const server = serve({ fetch: app.fetch, port: 3480 });

    // Test SDK
    const sdk = new SDK({ baseUrl: "http://localhost:3480" });

    // Test: Find names in array
    const result = await sdk.authors.list({
      where: {
        name: { $in: ["Alice", "Charlie"] }
      }
    });

    expect(result.data).toHaveLength(2);
    const names = result.data.map((a: any) => a.name).sort();
    expect(names).toEqual(["Alice", "Charlie"]);

    // Cleanup
    server.close();
  } finally {
    await pg.end();
  }
});

test("$in - with UUID values", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    // Clean up
    await pg.query("DELETE FROM authors");

    // Insert test data
    const author1 = await pg.query("INSERT INTO authors (name) VALUES ('Alice') RETURNING id");
    const author2 = await pg.query("INSERT INTO authors (name) VALUES ('Bob') RETURNING id");
    const author3 = await pg.query("INSERT INTO authors (name) VALUES ('Charlie') RETURNING id");

    const id1 = author1.rows[0].id;
    const id2 = author2.rows[0].id;
    const id3 = author3.rows[0].id;

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const app = new Hono();
    const deps = { pg };
    registerAuthorsRoutes(app, deps);
    const server = serve({ fetch: app.fetch, port: 3481 });

    const sdk = new SDK({ baseUrl: "http://localhost:3481" });

    // Test: Find by UUIDs in array
    const result = await sdk.authors.list({
      where: {
        id: { $in: [id1, id3] }
      }
    });

    expect(result.data).toHaveLength(2);
    const ids = result.data.map((a: any) => a.id).sort();
    expect(ids).toEqual([id1, id3].sort());

    server.close();
  } finally {
    await pg.end();
  }
});

test("$nin - basic usage (NOT IN)", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM authors");
    await pg.query("INSERT INTO authors (name) VALUES ('Alice'), ('Bob'), ('Charlie'), ('David')");

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const app = new Hono();
    const deps = { pg };
    registerAuthorsRoutes(app, deps);
    const server = serve({ fetch: app.fetch, port: 3482 });

    const sdk = new SDK({ baseUrl: "http://localhost:3482" });

    // Test: Find names NOT in array
    const result = await sdk.authors.list({
      where: {
        name: { $nin: ["Alice", "Charlie"] }
      }
    });

    expect(result.data).toHaveLength(2);
    const names = result.data.map((a: any) => a.name).sort();
    expect(names).toEqual(["Bob", "David"]);

    server.close();
  } finally {
    await pg.end();
  }
});

test("$in - edge case: empty array returns no results", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM authors");
    await pg.query("INSERT INTO authors (name) VALUES ('Alice'), ('Bob')");

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const app = new Hono();
    const deps = { pg };
    registerAuthorsRoutes(app, deps);
    const server = serve({ fetch: app.fetch, port: 3483 });

    const sdk = new SDK({ baseUrl: "http://localhost:3483" });

    // Test: Empty array should return no results
    const result = await sdk.authors.list({
      where: {
        name: { $in: [] }
      }
    });

    expect(result.data).toHaveLength(0);

    server.close();
  } finally {
    await pg.end();
  }
});

test("$in - single value in array", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM authors");
    await pg.query("INSERT INTO authors (name) VALUES ('Alice'), ('Bob')");

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const app = new Hono();
    const deps = { pg };
    registerAuthorsRoutes(app, deps);
    const server = serve({ fetch: app.fetch, port: 3484 });

    const sdk = new SDK({ baseUrl: "http://localhost:3484" });

    // Test: Single value in array
    const result = await sdk.authors.list({
      where: {
        name: { $in: ["Alice"] }
      }
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.name).toBe("Alice");

    server.close();
  } finally {
    await pg.end();
  }
});

test("$in - combined with $or", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM authors");
    await pg.query(`
      INSERT INTO authors (name) VALUES
        ('Alice Anderson'),
        ('Bob Brown'),
        ('Charlie Chen'),
        ('David Delta')
    `);

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const app = new Hono();
    const deps = { pg };
    registerAuthorsRoutes(app, deps);
    const server = serve({ fetch: app.fetch, port: 3485 });

    const sdk = new SDK({ baseUrl: "http://localhost:3485" });

    // Test: $in combined with $or
    const result = await sdk.authors.list({
      where: {
        $or: [
          { name: { $in: ["Alice Anderson", "Bob Brown"] } },
          { name: { $ilike: "%Delta%" } }
        ]
      }
    });

    // Should match: Alice Anderson, Bob Brown, David Delta
    expect(result.data).toHaveLength(3);
    const names = result.data.map((a: any) => a.name).sort();
    expect(names).toEqual(["Alice Anderson", "Bob Brown", "David Delta"]);

    server.close();
  } finally {
    await pg.end();
  }
});

test("$in - combined with $and", async () => {
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
    const server = serve({ fetch: app.fetch, port: 3486 });

    const sdk = new SDK({ baseUrl: "http://localhost:3486" });

    // Test: $in combined with $and
    const result = await sdk.authors.list({
      where: {
        $and: [
          { name: { $in: ["Alice Anderson", "Alice Brown", "Bob Anderson"] } },
          { name: { $ilike: "%Alice%" } }
        ]
      }
    });

    // Should match only: Alice Anderson, Alice Brown
    expect(result.data).toHaveLength(2);
    const names = result.data.map((a: any) => a.name).sort();
    expect(names).toEqual(["Alice Anderson", "Alice Brown"]);

    server.close();
  } finally {
    await pg.end();
  }
});

test("$nin - combined with other operators", async () => {
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
    const server = serve({ fetch: app.fetch, port: 3487 });

    const sdk = new SDK({ baseUrl: "http://localhost:3487" });

    // Test: Find Active users NOT named Alice or Bob
    const result = await sdk.authors.list({
      where: {
        name: {
          $ilike: "Active%",
          $nin: ["Active Alice", "Active Bob"]
        }
      }
    });

    // Should match only: Active Charlie
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.name).toBe("Active Charlie");

    server.close();
  } finally {
    await pg.end();
  }
});

test("$in - large array (100+ values)", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM authors");

    // Insert 150 authors
    const insertPromises = [];
    for (let i = 1; i <= 150; i++) {
      insertPromises.push(pg.query(`INSERT INTO authors (name) VALUES ('Author ${i}')`));
    }
    await Promise.all(insertPromises);

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const app = new Hono();
    const deps = { pg };
    registerAuthorsRoutes(app, deps);
    const server = serve({ fetch: app.fetch, port: 3488 });

    const sdk = new SDK({ baseUrl: "http://localhost:3488" });

    // Create array with 100 names
    const searchNames = Array.from({ length: 100 }, (_, i) => `Author ${i + 1}`);

    // Test: Large $in array
    const result = await sdk.authors.list({
      where: {
        name: { $in: searchNames }
      },
      limit: 200
    });

    expect(result.data).toHaveLength(100);

    server.close();
  } finally {
    await pg.end();
  }
});
