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
    if (stdout.trim() === CONTAINER_NAME) {
      return;
    }
  } catch {}

  console.log("🐳 Starting PostgreSQL container for distinctOn tests...");
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

test("distinctOn - returns at most one row per distinct column value", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM authors");

    const a1 = await pg.query("INSERT INTO authors (name) VALUES ('Alice') RETURNING *");
    const a2 = await pg.query("INSERT INTO authors (name) VALUES ('Bob') RETURNING *");
    const a3 = await pg.query("INSERT INTO authors (name) VALUES ('Carol') RETURNING *");

    // Insert 2 books per author (6 total)
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Alice Book A', $1)", [a1.rows[0].id]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Alice Book B', $1)", [a1.rows[0].id]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Bob Book A', $1)", [a2.rows[0].id]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Bob Book B', $1)", [a2.rows[0].id]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Carol Book A', $1)", [a3.rows[0].id]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Carol Book B', $1)", [a3.rows[0].id]);

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const { registerBooksRoutes } = await import("./.results/server/routes/books");

    const app = new Hono();
    registerAuthorsRoutes(app, { pg });
    registerBooksRoutes(app, { pg });

    const server = serve({ fetch: app.fetch, port: 3491 });
    const sdk = new SDK({ baseUrl: "http://localhost:3491" });

    // With distinctOn: 'author_id', should return at most 1 book per author
    const result = await sdk.books.list({ distinctOn: "author_id", limit: 100 });

    expect(result.data.length).toBe(3);

    // Each author_id should appear exactly once
    const authorIds = result.data.map((b: any) => b.author_id);
    const uniqueAuthorIds = new Set(authorIds);
    expect(uniqueAuthorIds.size).toBe(3);

    server.close();
  } finally {
    await pg.end();
  }
});

test("distinctOn with orderBy - selects correct row per group", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM authors");

    const a1 = await pg.query("INSERT INTO authors (name) VALUES ('AuthorX') RETURNING *");

    // Insert books with predictable titles (alphabetical order matters)
    await pg.query("INSERT INTO books (title, author_id) VALUES ('A - First', $1)", [a1.rows[0].id]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('B - Second', $1)", [a1.rows[0].id]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('C - Third', $1)", [a1.rows[0].id]);

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const { registerBooksRoutes } = await import("./.results/server/routes/books");

    const app = new Hono();
    registerAuthorsRoutes(app, { pg });
    registerBooksRoutes(app, { pg });

    const server = serve({ fetch: app.fetch, port: 3492 });
    const sdk = new SDK({ baseUrl: "http://localhost:3492" });

    // DISTINCT ON (author_id) ORDER BY author_id ASC, title DESC → picks last title alphabetically
    const result = await sdk.books.list({
      distinctOn: "author_id",
      orderBy: ["author_id", "title"],
      order: ["asc", "desc"],
      limit: 100,
    });

    expect(result.data.length).toBe(1);
    // "C - Third" is last alphabetically with DESC order, so it should be selected
    expect((result.data[0] as any).title).toBe("C - Third");

    server.close();
  } finally {
    await pg.end();
  }
});

test("distinctOn - total count reflects number of distinct groups", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM authors");

    const a1 = await pg.query("INSERT INTO authors (name) VALUES ('AuthorCount1') RETURNING *");
    const a2 = await pg.query("INSERT INTO authors (name) VALUES ('AuthorCount2') RETURNING *");

    // 3 books for author1, 2 books for author2 = 5 total, but 2 distinct author_ids
    await pg.query("INSERT INTO books (title, author_id) VALUES ('P1', $1)", [a1.rows[0].id]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('P2', $1)", [a1.rows[0].id]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('P3', $1)", [a1.rows[0].id]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Q1', $1)", [a2.rows[0].id]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Q2', $1)", [a2.rows[0].id]);

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const { registerBooksRoutes } = await import("./.results/server/routes/books");

    const app = new Hono();
    registerAuthorsRoutes(app, { pg });
    registerBooksRoutes(app, { pg });

    const server = serve({ fetch: app.fetch, port: 3493 });
    const sdk = new SDK({ baseUrl: "http://localhost:3493" });

    const result = await sdk.books.list({ distinctOn: "author_id", limit: 100 });

    // total should be 2 (distinct author_ids), not 5 (total books)
    expect(result.total).toBe(2);
    expect(result.data.length).toBe(2);

    server.close();
  } finally {
    await pg.end();
  }
});

test("distinctOn with non-distinct orderBy - uses subquery form and respects outer ordering", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM authors");

    const a1 = await pg.query("INSERT INTO authors (name) VALUES ('SubA') RETURNING *");
    const a2 = await pg.query("INSERT INTO authors (name) VALUES ('SubB') RETURNING *");
    const a3 = await pg.query("INSERT INTO authors (name) VALUES ('SubC') RETURNING *");

    // One representative book per author with predictable titles for outer ORDER BY
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Zeta', $1)", [a1.rows[0].id]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Zeta Extra', $1)", [a1.rows[0].id]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Mu', $1)", [a2.rows[0].id]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Alpha', $1)", [a3.rows[0].id]);

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const { registerBooksRoutes } = await import("./.results/server/routes/books");

    const app = new Hono();
    registerAuthorsRoutes(app, { pg });
    registerBooksRoutes(app, { pg });

    const server = serve({ fetch: app.fetch, port: 3495 });
    const sdk = new SDK({ baseUrl: "http://localhost:3495" });

    // orderBy: "title" is NOT in distinctOn: "author_id" → triggers subquery form
    // Outer ORDER BY title ASC → expect Alpha, Mu, Zeta (or Zeta Extra)
    const result = await sdk.books.list({
      distinctOn: "author_id",
      orderBy: "title",
      order: "asc",
      limit: 100,
    });

    expect(result.data.length).toBe(3); // one per author
    const titles = result.data.map((b: any) => b.title);
    expect(titles[0]).toBe("Alpha");
    expect(titles[1]).toBe("Mu");
    expect(titles[2]).toMatch(/^Zeta/); // either "Zeta" or "Zeta Extra"

    server.close();
  } finally {
    await pg.end();
  }
});

test("distinctOn - invalid column rejected with 400", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const { registerBooksRoutes } = await import("./.results/server/routes/books");

    const app = new Hono();
    registerAuthorsRoutes(app, { pg });
    registerBooksRoutes(app, { pg });

    const server = serve({ fetch: app.fetch, port: 3494 });

    // POST directly with an invalid column name
    const response = await fetch("http://localhost:3494/v1/books/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ distinctOn: "nonexistent_column" }),
    });

    expect(response.status).toBe(400);
    const body = await response.json() as any;
    expect(body.error).toBeDefined();

    server.close();
  } finally {
    await pg.end();
  }
});
