#!/usr/bin/env bun

import { test, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Client } from "pg";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const CONTAINER_NAME = "postgresdk-test-db";
const PG_URL = "postgres://user:pass@localhost:5432/testdb";

async function ensurePostgresRunning(): Promise<void> {
  try {
    const { stdout } = await execAsync(`docker ps --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`);
    if (stdout.trim() === CONTAINER_NAME) {
      return; // Already running
    }
  } catch {}

  // Container not running, start it
  console.log("🐳 Starting PostgreSQL container for onRequest tests...");
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

beforeAll(async () => {
  await ensurePostgresRunning();
});

test("onRequest hook is called and can set session variables", async () => {
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  try {
    // Clean up
    await pg.query("DROP TABLE IF EXISTS request_log");
    await pg.query("DELETE FROM authors");

    // Create a table to log requests (simulating audit log)
    await pg.query(`
      CREATE TABLE request_log (
        id SERIAL PRIMARY KEY,
        user_id TEXT,
        operation TEXT,
        table_name TEXT,
        logged_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Import generated routes
    const { createRouter } = await import("./.results/server/router");

    // Track onRequest calls
    const onRequestCalls: Array<{ path: string; method: string }> = [];

    // Create router with onRequest hook
    const router = createRouter({
      pg,
      onRequest: async (c, pgClient) => {
        // Track that onRequest was called
        onRequestCalls.push({
          path: c.req.path,
          method: c.req.method
        });

        // Simulate getting user from auth context
        const mockUser = { id: "user_123", email: "test@example.com" };

        // Set PostgreSQL session variable (this is what users would do for audit triggers)
        // Note: SET LOCAL doesn't support parameterized queries, must use string interpolation
        await pgClient.query(`SET LOCAL app.user_id = '${mockUser.id}'`);

        // Also log the request to our test table
        await pgClient.query(
          `INSERT INTO request_log (user_id, operation, table_name) VALUES ($1, $2, $3)`,
          [mockUser.id, c.req.method, 'authors']
        );
      }
    });

    const app = new Hono();
    app.route("/", router);

    const server = serve({ fetch: app.fetch, port: 3463 });

    // Give server time to start
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // Test CREATE operation
      const createRes = await fetch("http://localhost:3463/v1/authors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Author" })
      });
      expect(createRes.ok).toBe(true);
      const created = await createRes.json() as any;

      // Verify onRequest was called for CREATE
      expect(onRequestCalls.length).toBeGreaterThanOrEqual(1);
      expect(onRequestCalls.some(c => c.method === "POST" && c.path.includes("/authors"))).toBe(true);

      // Test GET operation
      const getRes = await fetch(`http://localhost:3463/v1/authors/${created.id}`);
      expect(getRes.ok).toBe(true);

      // Verify onRequest was called for GET
      expect(onRequestCalls.some(c => c.method === "GET")).toBe(true);

      // Test LIST operation
      const listRes = await fetch("http://localhost:3463/v1/authors/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      expect(listRes.ok).toBe(true);

      // Test UPDATE operation
      const updateRes = await fetch(`http://localhost:3463/v1/authors/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Author" })
      });
      expect(updateRes.ok).toBe(true);

      // Test DELETE operation
      const deleteRes = await fetch(`http://localhost:3463/v1/authors/${created.id}`, {
        method: "DELETE"
      });
      expect(deleteRes.ok).toBe(true);

      // Verify onRequest was called for all operations
      expect(onRequestCalls.length).toBeGreaterThanOrEqual(5); // POST (create), GET, POST (list), PATCH, DELETE
      expect(onRequestCalls.some(c => c.method === "POST")).toBe(true);
      expect(onRequestCalls.some(c => c.method === "GET")).toBe(true);
      expect(onRequestCalls.some(c => c.method === "PATCH")).toBe(true);
      expect(onRequestCalls.some(c => c.method === "DELETE")).toBe(true);

      // Verify session variables were set and logs were created
      const logs = await pg.query("SELECT * FROM request_log");
      expect(logs.rows.length).toBeGreaterThanOrEqual(5);

      // All logs should have the same user_id
      logs.rows.forEach(log => {
        expect(log.user_id).toBe("user_123");
      });

      console.log("\n✅ onRequest hook tests passed!");
      console.log(`  → onRequest called ${onRequestCalls.length} times`);
      console.log(`  → ${logs.rows.length} request logs created`);
    } finally {
      server.close();
    }
  } finally {
    await pg.query("DROP TABLE IF EXISTS request_log");
    await pg.end();
  }
});

test("router works without onRequest (backward compatible)", async () => {
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  try {
    await pg.query("DELETE FROM authors");

    // Import generated routes
    const { createRouter } = await import("./.results/server/router");

    // Create router WITHOUT onRequest (should still work)
    const router = createRouter({ pg });

    const app = new Hono();
    app.route("/", router);

    const server = serve({ fetch: app.fetch, port: 3464 });

    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // Test that basic operations still work without onRequest
      const createRes = await fetch("http://localhost:3464/v1/authors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Author No Hook" })
      });

      expect(createRes.ok).toBe(true);
      const created = await createRes.json() as any;
      expect(created.name).toBe("Test Author No Hook");

      const getRes = await fetch(`http://localhost:3464/v1/authors/${created.id}`);
      expect(getRes.ok).toBe(true);
      const fetched = await getRes.json() as any;
      expect(fetched.name).toBe("Test Author No Hook");

      console.log("\n✅ Backward compatibility test passed!");
      console.log("  → Router works without onRequest parameter");
    } finally {
      server.close();
    }
  } finally {
    await pg.end();
  }
});
