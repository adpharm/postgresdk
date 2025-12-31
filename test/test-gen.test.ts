import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { Client } from "pg";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { TEST_PATHS, TEST_PORTS, PG_URL, CLI_PATH, ensurePostgresRunning } from "./test-utils";

const SERVER_DIR = TEST_PATHS.gen + "/server";
const CLIENT_DIR = TEST_PATHS.gen + "/client";
const CFG_PATH = join(process.cwd(), "gen.config.ts");

function writeTestConfig(withAuth = false) {
  const authConfig = withAuth ? `,
  auth: {
    strategy: "api-key",
    apiKeyHeader: "x-api-key",
    apiKeys: ["test-key-123", "test-key-456"]
  }` : "";

  const cfg = `export default {
  connectionString: "${PG_URL}",
  schema: "public",
  outDir: { server: "${SERVER_DIR}", client: "${CLIENT_DIR}" },
  softDeleteColumn: null,
  includeMethodsDepth: 3${authConfig},
  tests: {
    generate: true,
    output: "${join(TEST_PATHS.gen, "tests")}",
    framework: "vitest"
  }
};`;
  writeFileSync(CFG_PATH, cfg, "utf-8");
}

async function applySchemaWithPg(sqlPath: string) {
  const sql = readFileSync(sqlPath, "utf8");
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();
  try {
    await pg.query(sql);
  } finally {
    await pg.end();
  }
}

describe("SDK Generation and E2E Tests", () => {
  beforeAll(async () => {
    await ensurePostgresRunning();

    // Clean up test directories
    const testDirs = [TEST_PATHS.gen, TEST_PATHS.apikey, TEST_PATHS.jwt, TEST_PATHS.sameDir];
    for (const dir of testDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  test("generate SDK from schema", async () => {
    console.log("Writing test gen.config.ts...");
    writeTestConfig();

    console.log("Applying test schema...");
    await applySchemaWithPg(join(__dirname, "schema.sql"));

    console.log("Running generator...");
    execSync(`bun ${CLI_PATH} generate -c ${CFG_PATH}`, { stdio: "inherit" });

    console.log("Verifying generated files exist...");
    const required = [
      `${SERVER_DIR}/include-builder.ts`,
      `${SERVER_DIR}/include-loader.ts`,
      `${SERVER_DIR}/routes/authors.ts`,
      `${SERVER_DIR}/routes/books.ts`,
      `${SERVER_DIR}/routes/tags.ts`,
      `${SERVER_DIR}/routes/book_tags.ts`,
      `${CLIENT_DIR}/authors.ts`,
      `${CLIENT_DIR}/books.ts`,
      `${CLIENT_DIR}/tags.ts`,
      `${CLIENT_DIR}/index.ts`,
    ];
    for (const f of required) {
      expect(existsSync(f)).toBe(true);
    }
  }, 60000);

  test("test CRUD operations and relationships", async () => {
    const { registerAuthorsRoutes } = await import(`../${SERVER_DIR}/routes/authors.ts`);
    const { registerBooksRoutes } = await import(`../${SERVER_DIR}/routes/books.ts`);
    const { registerTagsRoutes } = await import(`../${SERVER_DIR}/routes/tags.ts`);
    const { registerBookTagsRoutes } = await import(`../${SERVER_DIR}/routes/book_tags.ts`);

    const pg = new Client({ connectionString: PG_URL });
    await pg.connect();

    const app = new Hono();

    app.use("*", async (c, next) => {
      try {
        await next();
      } catch (e) {
        console.error("Error:", e);
        throw e;
      }
    });

    app.onError((err, c) => {
      console.error("[sdk:onError]", err?.stack || err);
      return c.json({ error: err?.message || "Internal error", stack: err?.stack }, 500);
    });

    app.notFound((c) => {
      console.error("[sdk:notFound]", c.req.method, c.req.path);
      return c.json({ error: "Not Found" }, 404);
    });

    registerAuthorsRoutes(app, { pg });
    registerBooksRoutes(app, { pg });
    registerTagsRoutes(app, { pg });
    registerBookTagsRoutes(app, { pg });

    const server = serve({ fetch: app.fetch, port: TEST_PORTS.gen });

    try {
      const { SDK } = await import(`../${CLIENT_DIR}/index.ts`);
      const sdk = new SDK({ baseUrl: `http://localhost:${TEST_PORTS.gen}` });

      // Test Authors CRUD
      const author1 = await sdk.authors.create({ name: "Jane Austen" });
      expect(author1.name).toBe("Jane Austen");

      const author2 = await sdk.authors.create({ name: "Mark Twain" });
      expect(author2.name).toBe("Mark Twain");

      const fetchedAuthor = await sdk.authors.getByPk(author1.id);
      expect(fetchedAuthor.name).toBe("Jane Austen");

      const updatedAuthor = await sdk.authors.update(author1.id, { name: "Jane Austen (Updated)" });
      expect(updatedAuthor.name).toBe("Jane Austen (Updated)");

      const authorsResult = await sdk.authors.list();
      expect(authorsResult.data.length).toBeGreaterThanOrEqual(2);

      // Test Books CRUD
      const book1 = await sdk.books.create({
        author_id: author1.id,
        title: "Pride and Prejudice",
      });
      expect(book1.title).toBe("Pride and Prejudice");

      const book2 = await sdk.books.create({
        author_id: author1.id,
        title: "Sense and Sensibility",
      });

      const book3 = await sdk.books.create({
        author_id: author2.id,
        title: "Adventures of Tom Sawyer",
      });

      const updatedBook = await sdk.books.update(book1.id, { title: "Pride and Prejudice (Special Edition)" });
      expect(updatedBook.title).toBe("Pride and Prejudice (Special Edition)");

      // Test Tags & M:N Relationships
      const tag1 = await sdk.tags.create({ name: "Classic" });
      const tag2 = await sdk.tags.create({ name: "Romance" });
      const tag3 = await sdk.tags.create({ name: "Adventure" });

      await sdk.book_tags.create({ book_id: book1.id, tag_id: tag1.id });
      await sdk.book_tags.create({ book_id: book1.id, tag_id: tag2.id });
      await sdk.book_tags.create({ book_id: book2.id, tag_id: tag1.id });
      await sdk.book_tags.create({ book_id: book3.id, tag_id: tag3.id });

      // Test 1:N Includes
      const authorsWithBooksResult = await sdk.authors.list({ include: { books: true } });
      const janeWithBooks = authorsWithBooksResult.data.find((a: any) => a.id === author1.id);
      expect(janeWithBooks).toBeTruthy();
      expect(Array.isArray(janeWithBooks.books)).toBe(true);
      expect(janeWithBooks.books.length).toBe(2);

      // Test M:N Includes
      const booksWithTagsResult = await sdk.books.list({ include: { tags: true } });
      const prideBook = booksWithTagsResult.data.find((b: any) => b.id === book1.id);
      expect(prideBook).toBeTruthy();
      expect(Array.isArray(prideBook.tags)).toBe(true);
      expect(prideBook.tags.length).toBe(2);

      // Test Nested Includes
      const authorsWithBooksAndTagsResult = await sdk.authors.list({
        include: {
          books: {
            include: {
              tags: true,
            },
          },
        },
      });

      const janeNested = authorsWithBooksAndTagsResult.data.find((a: any) => a.id === author1.id);
      expect(janeNested).toBeTruthy();
      expect(janeNested.books.length).toBe(2);
      const prideNested = janeNested.books.find((b: any) => b.id === book1.id);
      expect(prideNested).toBeTruthy();
      expect(prideNested.tags?.length).toBe(2);

      // Test Sorting
      const booksSortedAscResult = await sdk.books.list({ orderBy: "title", order: "asc" });
      expect(booksSortedAscResult.data.length).toBeGreaterThanOrEqual(3);

      const booksSortedDescResult = await sdk.books.list({ orderBy: "title", order: "desc" });
      expect(booksSortedDescResult.data[0].title).not.toBe(booksSortedAscResult.data[0].title);

      // Test Pagination
      const page1 = await sdk.books.list({ limit: 10, offset: 0, orderBy: "title", order: "asc" });
      expect(typeof page1).toBe('object');
      expect(Array.isArray(page1.data)).toBe(true);
      expect(typeof page1.total).toBe('number');
      expect(typeof page1.limit).toBe('number');
      expect(typeof page1.offset).toBe('number');
      expect(typeof page1.hasMore).toBe('boolean');

      // Test Delete
      const deletedBook = await sdk.books.delete(book3.id);
      expect(deletedBook.title).toBe("Adventures of Tom Sawyer");

      const deletedCheck = await sdk.books.getByPk(book3.id);
      expect(deletedCheck).toBeNull();

      const deletedAuthor = await sdk.authors.delete(author2.id);
      expect(deletedAuthor.name).toBe("Mark Twain");

    } finally {
      server.close();
      await pg.end();
    }
  }, 60000);

  test("test with API key authentication", async () => {
    const AUTH_SERVER_DIR = TEST_PATHS.apikey + "/server";
    const AUTH_CLIENT_DIR = TEST_PATHS.apikey + "/client";

    const authConfig = `export default {
  connectionString: "${PG_URL}",
  schema: "public",
  outDir: { server: "${AUTH_SERVER_DIR}", client: "${AUTH_CLIENT_DIR}" },
  softDeleteColumn: null,
  includeMethodsDepth: 3,
  auth: {
    strategy: "api-key",
    apiKeyHeader: "x-api-key",
    apiKeys: ["test-key-123", "test-key-456"]
  }
};`;
    writeFileSync(CFG_PATH, authConfig, "utf-8");
    execSync(`bun ${CLI_PATH} generate -c ${CFG_PATH}`, { stdio: "inherit" });

    const { registerAuthorsRoutes } = await import(`../${AUTH_SERVER_DIR}/routes/authors.ts`);
    const { registerBooksRoutes } = await import(`../${AUTH_SERVER_DIR}/routes/books.ts`);

    const pg = new Client({ connectionString: PG_URL });
    await pg.connect();

    const appAuth = new Hono();
    appAuth.onError((err, c) => {
      return c.json({ error: err?.message || "Internal error" }, 500);
    });

    registerAuthorsRoutes(appAuth, { pg });
    registerBooksRoutes(appAuth, { pg });

    const serverAuth = serve({ fetch: appAuth.fetch, port: TEST_PORTS.gen + 1 });

    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const { SDK } = await import(`../${AUTH_CLIENT_DIR}/index.ts`);

      // Test without auth - should fail
      const sdkNoAuth = new SDK({ baseUrl: `http://localhost:${TEST_PORTS.gen + 1}` });

      try {
        await sdkNoAuth.authors.list();
        expect(true).toBe(false); // Should not reach here
      } catch (e: any) {
        expect(e.message.includes("401") || e.message.includes("Unauthorized")).toBe(true);
      }

      // Test with valid auth
      const sdkWithAuth = new SDK({
        baseUrl: `http://localhost:${TEST_PORTS.gen + 1}`,
        auth: { apiKey: "test-key-123" }
      });

      const authAuthors = await sdkWithAuth.authors.list();
      expect(Array.isArray(authAuthors.data)).toBe(true);

      // Test with invalid auth
      const sdkBadAuth = new SDK({
        baseUrl: `http://localhost:${TEST_PORTS.gen + 1}`,
        auth: { apiKey: "invalid-key" }
      });

      try {
        await sdkBadAuth.authors.list();
        expect(true).toBe(false); // Should not reach here
      } catch (e: any) {
        expect(e.message.includes("401") || e.message.includes("Unauthorized")).toBe(true);
      }

    } finally {
      serverAuth.close();
      await pg.end();
    }
  }, 60000);

  test("test with same output directory", async () => {
    const SAME_DIR = TEST_PATHS.sameDir;

    const sameDirConfig = `export default {
  connectionString: "${PG_URL}",
  schema: "public",
  outDir: "${SAME_DIR}",
  softDeleteColumn: null,
  includeMethodsDepth: 3
};`;
    writeFileSync(CFG_PATH, sameDirConfig, "utf-8");
    execSync(`bun ${CLI_PATH} generate -c ${CFG_PATH}`, { stdio: "inherit" });

    // Check directory structure
    expect(existsSync(join(SAME_DIR, "sdk"))).toBe(true);
    expect(existsSync(join(SAME_DIR, "sdk", "index.ts"))).toBe(true);
    expect(existsSync(join(SAME_DIR, "sdk", "authors.ts"))).toBe(true);
    expect(existsSync(join(SAME_DIR, "sdk", "base-client.ts"))).toBe(true);

    expect(existsSync(join(SAME_DIR, "router.ts"))).toBe(true);
    expect(existsSync(join(SAME_DIR, "routes"))).toBe(true);
    expect(existsSync(join(SAME_DIR, "include-loader.ts"))).toBe(true);
    expect(existsSync(join(SAME_DIR, "sdk-bundle.ts"))).toBe(true);

    // Verify SDK bundle
    const bundleContent = readFileSync(join(SAME_DIR, "sdk-bundle.ts"), "utf-8");
    expect(bundleContent.includes("SDK_MANIFEST")).toBe(true);
    expect(bundleContent.includes("files:")).toBe(true);
    expect(bundleContent.includes('"index.ts":')).toBe(true);

  }, 60000);
});
