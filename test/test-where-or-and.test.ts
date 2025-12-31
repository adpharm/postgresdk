import { describe, test, expect, beforeAll } from "vitest";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Client } from "pg";
import { TEST_PATHS, TEST_PORTS, PG_URL, ensurePostgresRunning } from "./test-utils";

beforeAll(async () => {
  await ensurePostgresRunning();
});

describe("$or and $and operator tests", () => {
  test("$or - basic OR with simple equality", async () => {
    const pg = new Client({ connectionString: PG_URL });
    await pg.connect();

    try {
      await pg.query("DELETE FROM authors");
      await pg.query("INSERT INTO authors (name) VALUES ('Alice'), ('Bob'), ('Charlie')");

      const { registerAuthorsRoutes } = await import(`../${TEST_PATHS.gen}/server/routes/authors`);
      const app = new Hono();
      registerAuthorsRoutes(app, { pg });
      const server = serve({ fetch: app.fetch, port: TEST_PORTS.whereOrAnd });

      const { SDK } = await import(`../${TEST_PATHS.gen}/client/index.ts`);
      const sdk = new SDK({ baseUrl: `http://localhost:${TEST_PORTS.whereOrAnd}` });

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

      server.close();
    } finally {
      await pg.end();
    }
  });

  test("$or - with operators inside OR conditions", async () => {
    const pg = new Client({ connectionString: PG_URL });
    await pg.connect();

    try {
      await pg.query("DELETE FROM authors");
      await pg.query("INSERT INTO authors (name) VALUES ('Alice Anderson'), ('Bob Brown'), ('Charlie Chen'), ('David Delta')");

      const { registerAuthorsRoutes } = await import(`../${TEST_PATHS.gen}/server/routes/authors`);
      const app = new Hono();
      registerAuthorsRoutes(app, { pg });
      const server = serve({ fetch: app.fetch, port: TEST_PORTS.whereOrAnd + 1 });

      const { SDK } = await import(`../${TEST_PATHS.gen}/client/index.ts`);
      const sdk = new SDK({ baseUrl: `http://localhost:${TEST_PORTS.whereOrAnd + 1}` });

      const result = await sdk.authors.list({
        where: {
          $or: [
            { name: { $ilike: '%a%' } },
            { name: { $ilike: '%b%' } }
          ]
        }
      });

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

  test("$or - multiple fields", async () => {
    const pg = new Client({ connectionString: PG_URL });
    await pg.connect();

    try {
      await pg.query(`
        CREATE TABLE IF NOT EXISTS test_users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          first_name TEXT,
          last_name TEXT,
          email TEXT
        )
      `);

      await pg.query("DELETE FROM test_users");
      await pg.query(`
        INSERT INTO test_users (first_name, last_name, email) VALUES
          ('Fred', 'Smith', 'fred@example.com'),
          ('Alice', 'Fredson', 'alice@example.com'),
          ('Bob', 'Jones', 'bob@fredmail.com'),
          ('Charlie', 'Brown', 'charlie@example.com')
      `);

      const result = await pg.query(`
        SELECT * FROM test_users
        WHERE (first_name ILIKE '%f%' OR last_name ILIKE '%f%' OR email ILIKE '%f%')
      `);

      expect(result.rows.length).toBe(3);
      const names = result.rows.map(r => r.first_name).sort();
      expect(names).toEqual(["Alice", "Bob", "Fred"]);

      await pg.query("DROP TABLE test_users");
    } finally {
      await pg.end();
    }
  });

  test("$or - mixed with AND (implicit root level)", async () => {
    const pg = new Client({ connectionString: PG_URL });
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

      const { registerAuthorsRoutes } = await import(`../${TEST_PATHS.gen}/server/routes/authors`);
      const app = new Hono();
      registerAuthorsRoutes(app, { pg });
      const server = serve({ fetch: app.fetch, port: TEST_PORTS.whereOrAnd + 2 });

      const { SDK } = await import(`../${TEST_PATHS.gen}/client/index.ts`);
      const sdk = new SDK({ baseUrl: `http://localhost:${TEST_PORTS.whereOrAnd + 2}` });

      const result = await sdk.authors.list({
        where: {
          name: { $ilike: 'Active%' },
          $or: [
            { name: { $ilike: '%Alice%' } },
            { name: { $ilike: '%Bob%' } }
          ]
        }
      });

      expect(result.data).toHaveLength(2);
      const names = result.data.map((a: any) => a.name).sort();
      expect(names).toEqual(["Active Alice", "Active Bob"]);

      server.close();
    } finally {
      await pg.end();
    }
  });

  test("$and - explicit AND operator", async () => {
    const pg = new Client({ connectionString: PG_URL });
    await pg.connect();

    try {
      await pg.query("DELETE FROM authors");
      await pg.query(`
        INSERT INTO authors (name) VALUES
          ('Alice Anderson'),
          ('Alice Brown'),
          ('Bob Anderson')
      `);

      const { registerAuthorsRoutes } = await import(`../${TEST_PATHS.gen}/server/routes/authors`);
      const app = new Hono();
      registerAuthorsRoutes(app, { pg });
      const server = serve({ fetch: app.fetch, port: TEST_PORTS.whereOrAnd + 3 });

      const { SDK } = await import(`../${TEST_PATHS.gen}/client/index.ts`);
      const sdk = new SDK({ baseUrl: `http://localhost:${TEST_PORTS.whereOrAnd + 3}` });

      const result = await sdk.authors.list({
        where: {
          $and: [
            { name: { $ilike: '%Alice%' } },
            { name: { $ilike: '%Anderson%' } }
          ]
        }
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.name).toBe("Alice Anderson");

      server.close();
    } finally {
      await pg.end();
    }
  });

  test("$or and $and - nested 2 levels", async () => {
    const pg = new Client({ connectionString: PG_URL });
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

      const { registerAuthorsRoutes } = await import(`../${TEST_PATHS.gen}/server/routes/authors`);
      const app = new Hono();
      registerAuthorsRoutes(app, { pg });
      const server = serve({ fetch: app.fetch, port: TEST_PORTS.whereOrAnd + 4 });

      const { SDK } = await import(`../${TEST_PATHS.gen}/client/index.ts`);
      const sdk = new SDK({ baseUrl: `http://localhost:${TEST_PORTS.whereOrAnd + 4}` });

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

      expect(result.data).toHaveLength(2);
      const names = result.data.map((a: any) => a.name).sort();
      expect(names).toEqual(["Alice Smith", "Bob Smith"]);

      server.close();
    } finally {
      await pg.end();
    }
  });

  test("$or - edge case: empty array", async () => {
    const pg = new Client({ connectionString: PG_URL });
    await pg.connect();

    try {
      await pg.query("DELETE FROM authors");
      await pg.query("INSERT INTO authors (name) VALUES ('Alice')");

      const { registerAuthorsRoutes } = await import(`../${TEST_PATHS.gen}/server/routes/authors`);
      const app = new Hono();
      registerAuthorsRoutes(app, { pg });
      const server = serve({ fetch: app.fetch, port: TEST_PORTS.whereOrAnd + 5 });

      const { SDK } = await import(`../${TEST_PATHS.gen}/client/index.ts`);
      const sdk = new SDK({ baseUrl: `http://localhost:${TEST_PORTS.whereOrAnd + 5}` });

      const result = await sdk.authors.list({
        where: {
          $or: []
        }
      });

      expect(result.data).toHaveLength(0);

      server.close();
    } finally {
      await pg.end();
    }
  });

  test("$or - edge case: single condition", async () => {
    const pg = new Client({ connectionString: PG_URL });
    await pg.connect();

    try {
      await pg.query("DELETE FROM authors");
      await pg.query("INSERT INTO authors (name) VALUES ('Alice'), ('Bob')");

      const { registerAuthorsRoutes } = await import(`../${TEST_PATHS.gen}/server/routes/authors`);
      const app = new Hono();
      registerAuthorsRoutes(app, { pg });
      const server = serve({ fetch: app.fetch, port: TEST_PORTS.whereOrAnd + 6 });

      const { SDK } = await import(`../${TEST_PATHS.gen}/client/index.ts`);
      const sdk = new SDK({ baseUrl: `http://localhost:${TEST_PORTS.whereOrAnd + 6}` });

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
    const pg = new Client({ connectionString: PG_URL });
    await pg.connect();

    try {
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

      expect(result.rows.length).toBe(4);

      await pg.query("DROP TABLE test_operators");
    } finally {
      await pg.end();
    }
  });

  test("$or - complex real-world scenario", async () => {
    const pg = new Client({ connectionString: PG_URL });
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

      expect(result.rows.length).toBe(3);
      const names = result.rows.map(r => r.name).sort();
      expect(names).toEqual(["Alice", "David", "Eve"]);

      await pg.query("DROP TABLE users_complex");
    } finally {
      await pg.end();
    }
  });
});
