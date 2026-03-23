#!/usr/bin/env bun

import { test, expect, beforeAll } from "bun:test";
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
    if (stdout.trim() === CONTAINER_NAME) return;
  } catch {}

  try {
    const { stdout } = await execAsync(`docker ps -a --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`);
    if (stdout.trim() === CONTAINER_NAME) {
      await execAsync(`docker start ${CONTAINER_NAME}`);
    } else {
      await execAsync(`docker run -d --name ${CONTAINER_NAME} -e POSTGRES_USER=user -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=testdb -p 5432:5432 postgres:17-alpine`);
    }
  } catch (error) {
    throw error;
  }

  let attempts = 0;
  while (attempts < 30) {
    try {
      const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
      await pg.connect();
      await pg.query("SELECT 1");
      await pg.end();
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

test("list without limit returns all rows", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    // Clean and insert 60 authors (more than old default of 50)
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM authors");

    for (let i = 1; i <= 60; i++) {
      await pg.query("INSERT INTO authors (name) VALUES ($1)", [`Author ${String(i).padStart(3, "0")}`]);
    }

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const app = new Hono();
    registerAuthorsRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3500 });

    const sdk = new SDK({ baseUrl: "http://localhost:3500" });

    // list() with no limit should return ALL 60 rows
    const result = await sdk.authors.list();

    expect(result.data).toHaveLength(60);
    expect(result.total).toBe(60);
    expect(result.hasMore).toBe(false);
    // limit should be absent from response when not specified
    expect(result.limit).toBeUndefined();

    server.close();
  } finally {
    await pg.end();
  }
});

test("list with explicit limit still works", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM authors");

    for (let i = 1; i <= 60; i++) {
      await pg.query("INSERT INTO authors (name) VALUES ($1)", [`Author ${String(i).padStart(3, "0")}`]);
    }

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const app = new Hono();
    registerAuthorsRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3501 });

    const sdk = new SDK({ baseUrl: "http://localhost:3501" });

    // Explicit limit should cap results
    const result = await sdk.authors.list({ limit: 10 });

    expect(result.data).toHaveLength(10);
    expect(result.total).toBe(60);
    expect(result.hasMore).toBe(true);
    expect(result.limit).toBe(10);

    server.close();
  } finally {
    await pg.end();
  }
});

test("list with offset but no limit returns remaining rows", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM authors");

    for (let i = 1; i <= 20; i++) {
      await pg.query("INSERT INTO authors (name) VALUES ($1)", [`Author ${String(i).padStart(3, "0")}`]);
    }

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const app = new Hono();
    registerAuthorsRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3502 });

    const sdk = new SDK({ baseUrl: "http://localhost:3502" });

    // offset without limit should return all rows after offset
    const result = await sdk.authors.list({ offset: 5 });

    expect(result.data).toHaveLength(15);
    expect(result.total).toBe(20);
    expect(result.hasMore).toBe(false);

    server.close();
  } finally {
    await pg.end();
  }
});
