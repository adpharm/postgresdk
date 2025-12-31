import { describe, test, expect, beforeAll } from "vitest";
import { Hono, type Context } from "hono";
import { serve } from "@hono/node-server";
import { Client } from "pg";
import { TEST_PATHS, TEST_PORTS, PG_URL, ensurePostgresRunning } from "./test-utils";

beforeAll(async () => {
  await ensurePostgresRunning();
});

describe("onRequest hook tests", () => {
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
    const { createRouter } = await import(`../${TEST_PATHS.gen}/server/router`);

    // Track onRequest calls
    const onRequestCalls: Array<{ path: string; method: string }> = [];

    // Create router with onRequest hook
    const router = createRouter({
      pg,
      onRequest: async (c: Context, pgClient: Client) => {
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

    const server = serve({ fetch: app.fetch, port: TEST_PORTS.onRequest });

    // Give server time to start
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const baseUrl = `http://localhost:${TEST_PORTS.onRequest}`;

      // Test CREATE operation
      const createRes = await fetch(`${baseUrl}/v1/authors`, {
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
      const getRes = await fetch(`${baseUrl}/v1/authors/${created.id}`);
      expect(getRes.ok).toBe(true);

      // Verify onRequest was called for GET
      expect(onRequestCalls.some(c => c.method === "GET")).toBe(true);

      // Test LIST operation
      const listRes = await fetch(`${baseUrl}/v1/authors/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      expect(listRes.ok).toBe(true);

      // Test UPDATE operation
      const updateRes = await fetch(`${baseUrl}/v1/authors/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Author" })
      });
      expect(updateRes.ok).toBe(true);

      // Test DELETE operation
      const deleteRes = await fetch(`${baseUrl}/v1/authors/${created.id}`, {
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
      const { createRouter } = await import(`../${TEST_PATHS.gen}/server/router`);

      // Create router WITHOUT onRequest (should still work)
      const router = createRouter({ pg });

      const app = new Hono();
      app.route("/", router);

      const server = serve({ fetch: app.fetch, port: TEST_PORTS.onRequestNoHook });

      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        const baseUrl = `http://localhost:${TEST_PORTS.onRequestNoHook}`;

        // Test that basic operations still work without onRequest
        const createRes = await fetch(`${baseUrl}/v1/authors`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test Author No Hook" })
        });

        expect(createRes.ok).toBe(true);
        const created = await createRes.json() as any;
        expect(created.name).toBe("Test Author No Hook");

        const getRes = await fetch(`${baseUrl}/v1/authors/${created.id}`);
        expect(getRes.ok).toBe(true);
        const fetched = await getRes.json() as any;
        expect(fetched.name).toBe("Test Author No Hook");
      } finally {
        server.close();
      }
    } finally {
      await pg.end();
    }
  });
});
