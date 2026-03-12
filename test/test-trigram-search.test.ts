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
const PG_URL = "postgres://user:pass@localhost:5432/testdb";

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
      await execAsync(`docker run -d --name ${CONTAINER_NAME} -e POSTGRES_USER=user -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=testdb -p 5432:5432 pgvector/pgvector:pg17`);
    }
  } catch (error) {
    console.error("Failed to start container:", error);
    throw error;
  }

  let attempts = 0;
  while (attempts < 30) {
    try {
      const pg = new Client({ connectionString: PG_URL });
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

// Seed books with titles that have varying similarity to "postgresql database"
const BOOKS = [
  { title: "PostgreSQL: Up and Running" },
  { title: "PostgreSQL High Performance" },
  { title: "Learning PostgreSQL" },
  { title: "MySQL Database Administration" },
  { title: "JavaScript: The Good Parts" },
];

async function seedBooks(pg: Client): Promise<void> {
  await pg.query("DELETE FROM book_tags");
  await pg.query("DELETE FROM books");
  await pg.query("DELETE FROM authors");

  const { rows: [author] } = await pg.query(
    "INSERT INTO authors (name) VALUES ($1) RETURNING *",
    ["Test Author"]
  );
  for (const book of BOOKS) {
    await pg.query(
      "INSERT INTO books (author_id, title) VALUES ($1, $2)",
      [author.id, book.title]
    );
  }
}

test("trigram WHERE $similarity - boolean match operator", async () => {
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  try {
    await seedBooks(pg);

    // Set a low threshold so "PostgreSQL" matches all PostgreSQL titles
    await pg.query("SET pg_trgm.similarity_threshold = 0.1");

    const { registerBooksRoutes } = await import("./.results/server/routes/books");
    const app = new Hono();
    registerBooksRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3500 });

    const sdk = new SDK({ baseUrl: "http://localhost:3500" });

    const results = await sdk.books.list({
      where: { title: { $similarity: "PostgreSQL" } },
      limit: 10,
    });

    // All 3 PostgreSQL titles should match; JavaScript and MySQL should not
    expect(results.data.length).toBe(3);
    expect(results.data.every(b => b.title!.includes("PostgreSQL"))).toBe(true);

    server.close();
  } finally {
    await pg.end();
  }
});

test("trigram WHERE $wordSimilarity - word-level match operator", async () => {
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  try {
    await seedBooks(pg);

    const { registerBooksRoutes } = await import("./.results/server/routes/books");
    const app = new Hono();
    registerBooksRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3501 });

    const sdk = new SDK({ baseUrl: "http://localhost:3501" });

    // "database" should word-match "MySQL Database Administration" — it's the only exact word match
    const results = await sdk.books.list({
      where: { title: { $wordSimilarity: "database" } },
      limit: 10,
    });

    // "MySQL Database Administration" contains "database" as a full word
    expect(results.data.length).toBeGreaterThanOrEqual(1);
    const mysqlBook = results.data.find(b => b.title === "MySQL Database Administration");
    expect(mysqlBook).toBeDefined();
    // PostgreSQL titles do not contain "database" — should not match
    const pgBook = results.data.find(b => b.title!.startsWith("PostgreSQL"));
    expect(pgBook).toBeUndefined();

    server.close();
  } finally {
    await pg.end();
  }
});

test("trigram WHERE $strictWordSimilarity - strict word-level match", async () => {
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  try {
    await seedBooks(pg);

    const { registerBooksRoutes } = await import("./.results/server/routes/books");
    const app = new Hono();
    registerBooksRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3502 });

    const sdk = new SDK({ baseUrl: "http://localhost:3502" });

    const results = await sdk.books.list({
      where: { title: { $strictWordSimilarity: "PostgreSQL" } },
      limit: 10,
    });

    // All 3 PostgreSQL titles contain "PostgreSQL" as an exact word — should all match
    expect(results.data.length).toBe(3);
    results.data.forEach(b => {
      expect(b.title!.toLowerCase()).toContain("postgresql");
    });
    // JavaScript and MySQL books must not appear
    const nonPg = results.data.find(b => !b.title!.includes("PostgreSQL"));
    expect(nonPg).toBeUndefined();

    server.close();
  } finally {
    await pg.end();
  }
});

test("trigram top-level param - scored similarity search with _similarity field", async () => {
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  try {
    await seedBooks(pg);

    const { registerBooksRoutes } = await import("./.results/server/routes/books");
    const app = new Hono();
    registerBooksRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3503 });

    const sdk = new SDK({ baseUrl: "http://localhost:3503" });

    const results = await sdk.books.list({
      trigram: { field: "title", query: "postgresql" },
      limit: 5,
    });

    // All records should have _similarity score
    expect(results.data.length).toBeGreaterThan(0);
    expect(results.data[0]!._similarity).toBeDefined();
    expect(typeof results.data[0]!._similarity).toBe("number");

    // Results should be ordered by score descending (most similar first)
    for (let i = 1; i < results.data.length; i++) {
      expect(results.data[i - 1]!._similarity!).toBeGreaterThanOrEqual(results.data[i]!._similarity!);
    }

    // PostgreSQL books should have higher score than JavaScript book
    const pgBook = results.data.find(b => b.title!.includes("PostgreSQL"));
    const jsBook = results.data.find(b => b.title!.includes("JavaScript"));
    expect(pgBook).toBeDefined();
    expect(jsBook).toBeDefined();
    expect(pgBook!._similarity!).toBeGreaterThan(jsBook!._similarity!);

    server.close();
  } finally {
    await pg.end();
  }
});

test("trigram top-level param - threshold filter excludes low-similarity rows", async () => {
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  try {
    await seedBooks(pg);

    const { registerBooksRoutes } = await import("./.results/server/routes/books");
    const app = new Hono();
    registerBooksRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3504 });

    const sdk = new SDK({ baseUrl: "http://localhost:3504" });

    // High threshold — only very similar titles should pass
    const results = await sdk.books.list({
      trigram: { field: "title", query: "postgresql", threshold: 0.15 },
      limit: 10,
    });

    expect(results.data.length).toBeGreaterThan(0);
    // All returned rows must meet the threshold
    results.data.forEach(b => {
      expect(b._similarity!).toBeGreaterThanOrEqual(0.15);
    });
    // JavaScript book should be excluded (very low similarity to "postgresql")
    const jsBook = results.data.find(b => b.title!.includes("JavaScript"));
    expect(jsBook).toBeUndefined();

    server.close();
  } finally {
    await pg.end();
  }
});

test("trigram top-level param - combined with WHERE clause", async () => {
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  try {
    await seedBooks(pg);

    const { registerBooksRoutes } = await import("./.results/server/routes/books");
    const app = new Hono();
    registerBooksRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3505 });

    const sdk = new SDK({ baseUrl: "http://localhost:3505" });

    // Trigram search + WHERE restricts to only titles containing "High"
    const results = await sdk.books.list({
      trigram: { field: "title", query: "postgresql" },
      where: { title: { $ilike: "%High%" } },
      limit: 10,
    });

    expect(results.data.length).toBe(1);
    expect(results.data[0]!.title).toBe("PostgreSQL High Performance");
    expect(results.data[0]!._similarity).toBeDefined();

    server.close();
  } finally {
    await pg.end();
  }
});

// --- Multi-column trigram tests (websites table: name + url) ---

const WEBSITES = [
  { name: "Google Search", url: "search.google.com" },
  { name: "GitHub",        url: "github.com" },
  { name: "Stack Overflow", url: "stackoverflow.com" },
  { name: "Random Blog",   url: "randomblog.net" },
];

async function seedWebsites(pg: Client): Promise<void> {
  await pg.query("DELETE FROM websites");
  for (const site of WEBSITES) {
    await pg.query("INSERT INTO websites (name, url) VALUES ($1, $2)", [site.name, site.url]);
  }
}

test("trigram multi-field - greatest strategy scores best-matching column", async () => {
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  try {
    await seedWebsites(pg);

    const { registerWebsitesRoutes } = await import("./.results/server/routes/websites");
    const app = new Hono();
    registerWebsitesRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3507 });

    const sdk = new SDK({ baseUrl: "http://localhost:3507" });

    const results = await sdk.websites.list({
      trigram: { fields: ["name", "url"], query: "google", strategy: "greatest" },
      limit: 10,
    });

    expect(results.data.length).toBeGreaterThan(0);
    // All rows have _similarity
    results.data.forEach(r => {
      expect(typeof r._similarity).toBe("number");
    });
    // "Google Search" (name matches) should rank first
    expect(results.data[0]!.name).toBe("Google Search");
    // Scores are descending
    for (let i = 1; i < results.data.length; i++) {
      expect(results.data[i - 1]!._similarity!).toBeGreaterThanOrEqual(results.data[i]!._similarity!);
    }

    server.close();
  } finally {
    await pg.end();
  }
});

test("trigram multi-field - concat strategy matches across field boundary", async () => {
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  try {
    await seedWebsites(pg);

    const { registerWebsitesRoutes } = await import("./.results/server/routes/websites");
    const app = new Hono();
    registerWebsitesRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3508 });

    const sdk = new SDK({ baseUrl: "http://localhost:3508" });

    const results = await sdk.websites.list({
      trigram: { fields: ["name", "url"], query: "google", strategy: "concat" },
      limit: 10,
    });

    expect(results.data.length).toBeGreaterThan(0);
    results.data.forEach(r => {
      expect(typeof r._similarity).toBe("number");
    });
    // Google Search scores highest — "google" appears in both name and url when concatenated
    expect(results.data[0]!.name).toBe("Google Search");
    // Scores are descending
    for (let i = 1; i < results.data.length; i++) {
      expect(results.data[i - 1]!._similarity!).toBeGreaterThanOrEqual(results.data[i]!._similarity!);
    }

    server.close();
  } finally {
    await pg.end();
  }
});

test("trigram multi-field - weighted strategy blends scores by weight", async () => {
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  try {
    await seedWebsites(pg);

    const { registerWebsitesRoutes } = await import("./.results/server/routes/websites");
    const app = new Hono();
    registerWebsitesRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3509 });

    const sdk = new SDK({ baseUrl: "http://localhost:3509" });

    const results = await sdk.websites.list({
      trigram: {
        fields: [{ field: "name", weight: 2 }, { field: "url", weight: 1 }],
        query: "google",
      },
      limit: 10,
    });

    expect(results.data.length).toBeGreaterThan(0);
    results.data.forEach(r => {
      expect(typeof r._similarity).toBe("number");
      // Weighted score is a blend — must be between 0 and 1
      expect(r._similarity!).toBeGreaterThanOrEqual(0);
      expect(r._similarity!).toBeLessThanOrEqual(1);
    });
    // "Google Search" (name strongly matches, weight 2) should rank first
    expect(results.data[0]!.name).toBe("Google Search");
    // Scores are descending
    for (let i = 1; i < results.data.length; i++) {
      expect(results.data[i - 1]!._similarity!).toBeGreaterThanOrEqual(results.data[i]!._similarity!);
    }

    server.close();
  } finally {
    await pg.end();
  }
});

test("trigram top-level param - wordSimilarity metric", async () => {
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  try {
    await seedBooks(pg);

    const { registerBooksRoutes } = await import("./.results/server/routes/books");
    const app = new Hono();
    registerBooksRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3506 });

    const sdk = new SDK({ baseUrl: "http://localhost:3506" });

    const results = await sdk.books.list({
      trigram: { field: "title", query: "postgresql", metric: "wordSimilarity" },
      limit: 5,
    });

    expect(results.data.length).toBeGreaterThan(0);
    results.data.forEach(b => {
      expect(b._similarity).toBeDefined();
      expect(typeof b._similarity).toBe("number");
    });

    // PostgreSQL books score higher than non-PostgreSQL
    const pgBook = results.data[0];
    expect(pgBook!.title!.toLowerCase()).toContain("postgresql");

    server.close();
  } finally {
    await pg.end();
  }
});
