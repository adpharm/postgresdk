import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync, exec } from "node:child_process";
import { Client } from "pg";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const CONTAINER_NAME = "postgresdk-test-db";
const PG_URL = "postgres://user:pass@localhost:5432/testdb";
const SERVER_DIR = "test/.results/server";
const CLIENT_DIR = "test/.results/client";
const CFG_PATH = join(process.cwd(), "gen.config.ts");

async function checkDocker(): Promise<boolean> {
  try {
    await execAsync("docker --version");
    return true;
  } catch {
    return false;
  }
}

async function isContainerRunning(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`docker ps --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`);
    return stdout.trim() === CONTAINER_NAME;
  } catch {
    return false;
  }
}

async function startPostgres(): Promise<void> {
  console.log("🐳 Starting PostgreSQL container...");
  
  // Check if container exists but is stopped
  try {
    const { stdout } = await execAsync(`docker ps -a --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`);
    if (stdout.trim() === CONTAINER_NAME) {
      console.log("  → Container exists, starting it...");
      await execAsync(`docker start ${CONTAINER_NAME}`);
    } else {
      console.log("  → Creating new container...");
      // Pull image first if needed
      try {
        await execAsync(`docker pull postgres:17-alpine`);
      } catch {
        // Image might already exist
      }
      
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

async function stopPostgres(): Promise<void> {
  console.log("🐳 Stopping PostgreSQL container...");
  try {
    await execAsync(`docker stop ${CONTAINER_NAME}`);
    console.log("  ✓ Container stopped");
  } catch (error) {
    console.error("  ⚠️  Failed to stop container:", error);
  }
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
  outServer: "${SERVER_DIR}",
  outClient: "${CLIENT_DIR}",
  softDeleteColumn: null,
  includeDepthLimit: 3,
  dateType: "date"${authConfig}
};`;
  writeFileSync(CFG_PATH, cfg, "utf-8");
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

let startedContainer = false;

async function main() {
  // Check Docker is available
  if (!await checkDocker()) {
    console.error("❌ Docker is not installed or not running");
    console.error("   Please install Docker and try again");
    process.exit(1);
  }

  // Check if container is running
  const isRunning = await isContainerRunning();
  
  if (!isRunning) {
    console.log("⚠️  PostgreSQL container is not running");
    console.log("   Starting container: " + CONTAINER_NAME);
    await startPostgres();
    startedContainer = true;
  } else {
    console.log("✓ PostgreSQL container is running");
  }

  console.log("\n0) Write test gen.config.ts …");
  writeTestConfig();

  console.log("1) Apply test schema via pg client …");
  await applySchemaWithPg("test/schema.sql");

  console.log("2) Run generator …");
  // Use the CLI with the config we just wrote
  execSync(`bun run src/cli.ts generate -c ${CFG_PATH}`, { stdio: "inherit" });

  console.log("3) Verify generated files exist …");
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
    if (!existsSync(f)) throw new Error(`Missing generated file: ${f}`);
  }

  console.log("4) Type-check generated code …");
  execSync(`tsc --noEmit`, { stdio: "inherit" });

  console.log("5) Boot Hono API using generated routes …");
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
      console.error("🔴 Thrown error:", e);
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

  const server = serve({ fetch: app.fetch, port: 3456 });
  console.log("   → Hono on http://localhost:3456");

  try {
    console.log("\n6) Testing SDK operations …\n");
    const { SDK } = await import(`../${CLIENT_DIR}/index.ts`);
    const sdk = new SDK({ baseUrl: "http://localhost:3456" });

    // ===== TEST AUTHORS CRUD =====
    console.log("📝 Testing Authors CRUD:");

    // Create
    const author1 = await sdk.authors.create({ name: "Jane Austen" });
    console.log("  ✓ Created author:", author1.name);
    assert(author1.name === "Jane Austen", "Author name mismatch");

    const author2 = await sdk.authors.create({ name: "Mark Twain" });
    console.log("  ✓ Created author:", author2.name);

    // Read by ID
    const fetchedAuthor = await sdk.authors.getByPk(author1.id);
    console.log("  ✓ Fetched author by ID");
    assert(fetchedAuthor.name === "Jane Austen", "Fetched author name mismatch");

    // Update
    const updatedAuthor = await sdk.authors.update(author1.id, { name: "Jane Austen (Updated)" });
    console.log("  ✓ Updated author name");
    assert(updatedAuthor.name === "Jane Austen (Updated)", "Updated name mismatch");

    // List
    const authors = await sdk.authors.list();
    console.log("  ✓ Listed authors, count:", authors.length);
    assert(authors.length >= 2, "Should have at least 2 authors");

    // ===== TEST BOOKS CRUD =====
    console.log("\n📚 Testing Books CRUD:");

    // Create books
    const book1 = await sdk.books.create({
      author_id: author1.id,
      title: "Pride and Prejudice",
    });
    console.log("  ✓ Created book:", book1.title);

    const book2 = await sdk.books.create({
      author_id: author1.id,
      title: "Sense and Sensibility",
    });
    console.log("  ✓ Created book:", book2.title);

    const book3 = await sdk.books.create({
      author_id: author2.id,
      title: "Adventures of Tom Sawyer",
    });
    console.log("  ✓ Created book:", book3.title);

    // Update book
    const updatedBook = await sdk.books.update(book1.id, { title: "Pride and Prejudice (Special Edition)" });
    console.log("  ✓ Updated book title");
    assert(updatedBook.title === "Pride and Prejudice (Special Edition)", "Book title update failed");

    // ===== TEST TAGS & M:N RELATIONSHIPS =====
    console.log("\n🏷️  Testing Tags & M:N Relationships:");

    // Create tags
    const tag1 = await sdk.tags.create({ name: "Classic" });
    const tag2 = await sdk.tags.create({ name: "Romance" });
    const tag3 = await sdk.tags.create({ name: "Adventure" });
    console.log("  ✓ Created 3 tags");

    // Create book-tag relationships (M:N)
    await sdk.book_tags.create({ book_id: book1.id, tag_id: tag1.id });
    await sdk.book_tags.create({ book_id: book1.id, tag_id: tag2.id });
    await sdk.book_tags.create({ book_id: book2.id, tag_id: tag1.id });
    await sdk.book_tags.create({ book_id: book3.id, tag_id: tag3.id });
    console.log("  ✓ Created book-tag relationships");

    // ===== TEST INCLUDES (1:N) =====
    console.log("\n🔗 Testing 1:N Includes (Authors → Books):");

    const authorsWithBooks = await sdk.authors.list({ include: { books: true } });
    console.log("  ✓ Fetched authors with books");

    const janeWithBooks = authorsWithBooks.find((a: any) => a.id === author1.id);
    assert(janeWithBooks, "Author not found in list");
    assert(Array.isArray(janeWithBooks.books), "Books should be an array");
    assert(janeWithBooks.books.length === 2, "Jane should have 2 books");
    console.log(`  ✓ Author "${janeWithBooks.name}" has ${janeWithBooks.books.length} books`);

    const markWithBooks = authorsWithBooks.find((a: any) => a.id === author2.id);
    assert(markWithBooks, "Author not found in list");
    assert(markWithBooks.books.length === 1, "Mark should have 1 book");
    console.log(`  ✓ Author "${markWithBooks.name}" has ${markWithBooks.books.length} book`);

    // ===== TEST INCLUDES (M:N) =====
    console.log("\n🔗 Testing M:N Includes (Books ↔ Tags):");

    const booksWithTags = await sdk.books.list({ include: { tags: true } });
    console.log("  ✓ Fetched books with tags");

    const prideBook = booksWithTags.find((b: any) => b.id === book1.id);
    assert(prideBook, "Book not found");
    assert(Array.isArray(prideBook.tags), "Tags should be an array");
    assert(prideBook.tags.length === 2, "Pride & Prejudice should have 2 tags");
    console.log(
      `  ✓ "${prideBook.title}" has ${prideBook.tags.length} tags:`,
      prideBook.tags.map((t: any) => t.name).join(", ")
    );

    // ===== TEST NESTED INCLUDES =====
    console.log("\n🔗 Testing Nested Includes (Authors → Books → Tags):");

    const authorsWithBooksAndTags = await sdk.authors.list({
      include: {
        books: {
          include: {
            tags: true,
          },
        },
      },
    });
    console.log("  ✓ Fetched authors with books and tags (nested)");

    const janeNested = authorsWithBooksAndTags.find((a: any) => a.id === author1.id);
    assert(janeNested, "Author not found");
    assert(janeNested.books.length === 2, "Should have 2 books");
    const prideNested = janeNested.books.find((b: any) => b.id === book1.id);
    assert(prideNested, "Book not found in nested include");
    assert(prideNested.tags?.length === 2, "Nested book should have 2 tags");
    console.log(
      `  ✓ Nested include works: ${janeNested.name} → ${prideNested.title} → [${prideNested.tags
        .map((t: any) => t.name)
        .join(", ")}]`
    );

    // ===== TEST DELETE =====
    console.log("\n🗑️  Testing Delete Operations:");

    // Delete a book
    const deletedBook = await sdk.books.delete(book3.id);
    console.log("  ✓ Deleted book:", deletedBook.title);

    // Verify it's deleted
    const deletedCheck = await sdk.books.getByPk(book3.id);
    assert(deletedCheck === null, "Deleted book should return null");
    console.log("  ✓ Confirmed book is deleted (returns null)");

    // Delete an author (should work since we deleted their book)
    const deletedAuthor = await sdk.authors.delete(author2.id);
    console.log("  ✓ Deleted author:", deletedAuthor.name);

    // ===== FINAL SUMMARY =====
    console.log("\n" + "=".repeat(50));
    console.log("✅ All tests passed!");
    console.log("=".repeat(50));
    console.log("\nTested:");
    console.log("  • CRUD operations (Create, Read, Update, Delete)");
    console.log("  • 1:N relationships (Authors → Books)");
    console.log("  • M:N relationships (Books ↔ Tags)");
    console.log("  • Include patterns (simple & nested)");
    console.log("  • Error handling (404 on deleted resource)");
  } finally {
    server.close();
    await pg.end();
  }

  // ===== TEST WITH AUTH ENABLED =====
  console.log("\n" + "=".repeat(50));
  console.log("🔐 Testing with Auth enabled...");
  console.log("=".repeat(50));
  
  // Use different directories for auth tests
  const AUTH_SERVER_DIR = "test/.results-apikey/server";
  const AUTH_CLIENT_DIR = "test/.results-apikey/client";
  
  // Generate with API key auth
  console.log("\n1) Regenerating with auth enabled...");
  const authConfig = `export default {
  connectionString: "${PG_URL}",
  schema: "public",
  outServer: "${AUTH_SERVER_DIR}",
  outClient: "${AUTH_CLIENT_DIR}",
  softDeleteColumn: null,
  includeDepthLimit: 3,
  dateType: "date",
  auth: {
    strategy: "api-key",
    apiKeyHeader: "x-api-key",
    apiKeys: ["test-key-123", "test-key-456"]
  }
};`;
  writeFileSync(CFG_PATH, authConfig, "utf-8");
  execSync(`bun run src/cli.ts generate -c ${CFG_PATH}`, { stdio: "inherit" });
  
  // Import from the new location
  const { registerAuthorsRoutes: registerAuthorsRoutesAuth } = await import(`../${AUTH_SERVER_DIR}/routes/authors.ts`);
  const { registerBooksRoutes: registerBooksRoutesAuth } = await import(`../${AUTH_SERVER_DIR}/routes/books.ts`);
  
  const pg2 = new Client({ connectionString: PG_URL });
  await pg2.connect();
  
  const appAuth = new Hono();
  appAuth.onError((err, c) => {
    console.error("[auth-test:onError]", err?.message || err);
    return c.json({ error: err?.message || "Internal error" }, 500);
  });
  
  registerAuthorsRoutesAuth(appAuth, { pg: pg2 });
  registerBooksRoutesAuth(appAuth, { pg: pg2 });
  
  const serverAuth = serve({ fetch: appAuth.fetch, port: 3457 });
  console.log("   → Auth-enabled Hono on http://localhost:3457");
  
  // Give server time to fully initialize
  await new Promise(resolve => setTimeout(resolve, 100));
  
  try {
    const { SDK: SDKAuth } = await import(`../${AUTH_CLIENT_DIR}/index.ts`);
    
    // Test without auth header - should fail
    console.log("\n📝 Testing Auth Protection:");
    const sdkNoAuth = new SDKAuth({ baseUrl: "http://localhost:3457" });
    
    try {
      await sdkNoAuth.authors.list();
      assert(false, "Should have failed without auth");
    } catch (e: any) {
      assert(e.message.includes("401") || e.message.includes("Unauthorized"), "Should get 401 without auth");
      console.log("  ✓ Requests rejected without API key");
    }
    
    // Test with valid auth header using the simplified API
    const sdkWithAuth = new SDKAuth({ 
      baseUrl: "http://localhost:3457",
      auth: { apiKey: "test-key-123" }
    });
    
    const authAuthors = await sdkWithAuth.authors.list();
    console.log("  ✓ Requests accepted with valid API key");
    assert(Array.isArray(authAuthors), "Should get authors with valid key");
    
    // Test with invalid auth header
    const sdkBadAuth = new SDKAuth({ 
      baseUrl: "http://localhost:3457",
      auth: { apiKey: "invalid-key" }
    });
    
    try {
      await sdkBadAuth.authors.list();
      assert(false, "Should have failed with invalid auth");
    } catch (e: any) {
      assert(e.message.includes("401") || e.message.includes("Unauthorized"), "Should get 401 with invalid key");
      console.log("  ✓ Requests rejected with invalid API key");
    }
    
    console.log("\n✅ API Key auth tests passed!");
    
  } finally {
    serverAuth.close();
    await pg2.end();
  }

  // ===== TEST WITH JWT AUTH =====
  console.log("\n" + "=".repeat(50));
  console.log("🔐 Testing with JWT Auth...");
  console.log("=".repeat(50));
  
  // Use different directories for JWT test
  const JWT_SERVER_DIR = "test/.results-jwt/server";
  const JWT_CLIENT_DIR = "test/.results-jwt/client";
  
  // Regenerate with JWT auth
  console.log("\n1) Regenerating with JWT auth enabled...");
  
  const jwtSecret = "test-secret-key-for-jwt";
  const jwtConfig = `export default {
  connectionString: "${PG_URL}",
  schema: "public",
  outServer: "${JWT_SERVER_DIR}",
  outClient: "${JWT_CLIENT_DIR}",
  softDeleteColumn: null,
  includeDepthLimit: 3,
  dateType: "date",
  auth: {
    strategy: "jwt-hs256",
    jwt: {
      sharedSecret: "${jwtSecret}",
      issuer: "test-app",
      audience: "test-client"
    }
  }
};`;
  writeFileSync(CFG_PATH, jwtConfig, "utf-8");
  execSync(`bun run src/cli.ts generate -c ${CFG_PATH}`, { stdio: "inherit" });
  
  // Import from JWT-specific directory
  const { registerAuthorsRoutes: registerAuthorsRoutesJWT } = await import(`../${JWT_SERVER_DIR}/routes/authors.ts`);
  const { registerBooksRoutes: registerBooksRoutesJWT } = await import(`../${JWT_SERVER_DIR}/routes/books.ts`);
  
  const pg3 = new Client({ connectionString: PG_URL });
  await pg3.connect();
  
  const appJWT = new Hono();
  appJWT.onError((err, c) => {
    console.error("[jwt-test:onError]", err?.message || err);
    return c.json({ error: err?.message || "Internal error" }, 500);
  });
  
  registerAuthorsRoutesJWT(appJWT, { pg: pg3 });
  registerBooksRoutesJWT(appJWT, { pg: pg3 });
  
  const serverJWT = serve({ fetch: appJWT.fetch, port: 3458 });
  console.log("   → JWT-enabled Hono on http://localhost:3458");
  
  // Give server time to start
  await new Promise(resolve => setTimeout(resolve, 500));
  
  try {
    const { SDK: SDKJWT } = await import(`../${JWT_CLIENT_DIR}/index.ts`);
    const { SignJWT } = await import("jose");
    
    // Generate a valid JWT
    const validJWT = await new SignJWT({ sub: "user123", name: "Test User" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("test-app")
      .setAudience("test-client")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(jwtSecret));
    
    // Generate an invalid JWT (wrong secret)
    const invalidJWT = await new SignJWT({ sub: "user123" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("test-app")
      .setAudience("test-client")
      .sign(new TextEncoder().encode("wrong-secret"));
    
    console.log("\n📝 Testing JWT Auth:");
    
    // Test without JWT - should fail
    const sdkNoJWT = new SDKJWT({ baseUrl: "http://localhost:3458" });
    try {
      await sdkNoJWT.authors.list();
      assert(false, "Should have failed without JWT");
    } catch (e: any) {
      assert(e.message.includes("401") || e.message.includes("Unauthorized"), "Should get 401 without JWT");
      console.log("  ✓ Requests rejected without JWT");
    }
    
    // Test with valid JWT
    const sdkWithJWT = new SDKJWT({ 
      baseUrl: "http://localhost:3458",
      auth: { jwt: validJWT }
    });
    
    const jwtAuthors = await sdkWithJWT.authors.list();
    console.log("  ✓ Requests accepted with valid JWT");
    assert(Array.isArray(jwtAuthors), "Should get authors with valid JWT");
    
    // Test with JWT provider function
    const sdkWithJWTProvider = new SDKJWT({ 
      baseUrl: "http://localhost:3458",
      auth: { jwt: async () => validJWT }
    });
    
    const jwtAuthors2 = await sdkWithJWTProvider.authors.list();
    console.log("  ✓ Requests accepted with JWT provider function");
    assert(Array.isArray(jwtAuthors2), "Should get authors with JWT provider");
    
    // Test with invalid JWT
    const sdkBadJWT = new SDKJWT({ 
      baseUrl: "http://localhost:3458",
      auth: { jwt: invalidJWT }
    });
    
    try {
      await sdkBadJWT.authors.list();
      assert(false, "Should have failed with invalid JWT");
    } catch (e: any) {
      assert(e.message.includes("401") || e.message.includes("Unauthorized"), "Should get 401 with invalid JWT");
      console.log("  ✓ Requests rejected with invalid JWT");
    }
    
    console.log("\n✅ JWT auth tests passed!");
    
  } finally {
    serverJWT.close();
    await pg3.end();
  }
    
  // Stop container if we started it
  if (startedContainer) {
    await stopPostgres();
  }
}

main().catch(async (err) => {
  console.error("❌ Test failed", err);
  
  // Stop container if we started it
  if (startedContainer) {
    try {
      await stopPostgres();
    } catch {}
  }
  
  process.exit(1);
});
