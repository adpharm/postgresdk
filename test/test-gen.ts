import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
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
        await execAsync(`docker pull pgvector/pgvector:pg17`);
      } catch {
        // Image might already exist
      }

      await execAsync(`docker run -d --name ${CONTAINER_NAME} -e POSTGRES_USER=user -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=testdb -p 5432:5432 pgvector/pgvector:pg17`);
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
    output: "${join("test", ".results", "tests")}",
    framework: "vitest"
  }
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

  // Clean up all test result directories before running tests
  const testDirs = ["test/.results", "test/.results-apikey", "test/.results-jwt", "test/.results-same-dir"];
  for (const dir of testDirs) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
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

  // Type checking is now done in test:typecheck for better coverage
  console.log("4) Skipping type-check (done in dedicated test:typecheck)...");

  console.log("5) Boot Hono API using generated routes …");
  const { registerAuthorsRoutes } = await import(`../${SERVER_DIR}/routes/authors.ts`);
  const { registerBooksRoutes } = await import(`../${SERVER_DIR}/routes/books.ts`);
  const { registerTagsRoutes } = await import(`../${SERVER_DIR}/routes/tags.ts`);
  const { registerBookTagsRoutes } = await import(`../${SERVER_DIR}/routes/book_tags.ts`);
  const { registerProductsRoutes } = await import(`../${SERVER_DIR}/routes/products.ts`);
  const { registerUsersRoutes } = await import(`../${SERVER_DIR}/routes/users.ts`);

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
  registerProductsRoutes(app, { pg });
  registerUsersRoutes(app, { pg });

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
    const authorsResult = await sdk.authors.list();
    console.log("  ✓ Listed authors, count:", authorsResult.data.length);
    assert(authorsResult.data.length >= 2, "Should have at least 2 authors");

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

    const authorsWithBooksResult = await sdk.authors.list({ include: { books: true } });
    console.log("  ✓ Fetched authors with books");

    const janeWithBooks = authorsWithBooksResult.data.find((a: any) => a.id === author1.id);
    assert(janeWithBooks, "Author not found in list");
    assert(Array.isArray(janeWithBooks.books), "Books should be an array");
    assert(janeWithBooks.books.length === 2, "Jane should have 2 books");
    console.log(`  ✓ Author "${janeWithBooks.name}" has ${janeWithBooks.books.length} books`);

    const markWithBooks = authorsWithBooksResult.data.find((a: any) => a.id === author2.id);
    assert(markWithBooks, "Author not found in list");
    assert(markWithBooks.books.length === 1, "Mark should have 1 book");
    console.log(`  ✓ Author "${markWithBooks.name}" has ${markWithBooks.books.length} book`);

    // ===== TEST INCLUDES (M:N) =====
    console.log("\n🔗 Testing M:N Includes (Books ↔ Tags):");

    const booksWithTagsResult = await sdk.books.list({ include: { tags: true } });
    console.log("  ✓ Fetched books with tags");

    const prideBook = booksWithTagsResult.data.find((b: any) => b.id === book1.id);
    assert(prideBook, "Book not found");
    assert(Array.isArray(prideBook.tags), "Tags should be an array");
    assert(prideBook.tags.length === 2, "Pride & Prejudice should have 2 tags");
    console.log(
      `  ✓ "${prideBook.title}" has ${prideBook.tags.length} tags:`,
      prideBook.tags.map((t: any) => t.name).join(", ")
    );

    // ===== TEST NESTED INCLUDES =====
    console.log("\n🔗 Testing Nested Includes (Authors → Books → Tags):");

    const authorsWithBooksAndTagsResult = await sdk.authors.list({
      include: {
        books: {
          tags: true,
        },
      },
    });
    console.log("  ✓ Fetched authors with books and tags (nested)");

    const janeNested = authorsWithBooksAndTagsResult.data.find((a: any) => a.id === author1.id);
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

    // ===== TEST SORTING =====
    console.log("\n📊 Testing Sorting (orderBy/order):");

    // Single column sort ASC
    const booksSortedAscResult = await sdk.books.list({ orderBy: "title", order: "asc" });
    assert(booksSortedAscResult.data.length >= 3, "Should have at least 3 books");
    const firstTitleAsc = booksSortedAscResult.data[0].title;
    console.log(`  ✓ Single column ASC: "${firstTitleAsc}" comes first`);

    // Single column sort DESC
    const booksSortedDescResult = await sdk.books.list({ orderBy: "title", order: "desc" });
    const firstTitleDesc = booksSortedDescResult.data[0].title;
    const lastTitleDesc = booksSortedDescResult.data[booksSortedDescResult.data.length - 1].title;
    assert(firstTitleDesc !== firstTitleAsc, `DESC should reverse order (got "${firstTitleDesc}" vs "${firstTitleAsc}")`);
    assert(lastTitleDesc === firstTitleAsc, `Last in DESC should equal first in ASC`);
    console.log(`  ✓ Single column DESC: "${firstTitleDesc}" comes first`);

    // Multi-column sort with same direction
    const booksMultiSortResult = await sdk.books.list({
      orderBy: ["author_id", "title"],
      order: "asc"
    });
    assert(booksMultiSortResult.data.length >= 3, "Multi-sort should return books");
    console.log(`  ✓ Multi-column sort (same direction) works`);

    // Multi-column sort with mixed directions [DESC, ASC]
    const booksMixedSortResult = await sdk.books.list({
      orderBy: ["author_id", "title"],
      order: ["desc", "asc"]
    });
    for (let i = 1; i < booksMixedSortResult.data.length; i++) {
      const prev = booksMixedSortResult.data[i-1];
      const curr = booksMixedSortResult.data[i];
      if (prev.author_id < curr.author_id) {
        throw new Error(`author_id not DESC at index ${i}`);
      }
      if (prev.author_id === curr.author_id && prev.title > curr.title) {
        throw new Error(`title not ASC within same author at index ${i}`);
      }
    }
    console.log(`  ✓ Multi-column sort [DESC, ASC] works`);

    // Multi-column sort with both DESC [DESC, DESC]
    const booksDescDescResult = await sdk.books.list({
      orderBy: ["author_id", "title"],
      order: ["desc", "desc"]
    });
    for (let i = 1; i < booksDescDescResult.data.length; i++) {
      const prev = booksDescDescResult.data[i-1];
      const curr = booksDescDescResult.data[i];
      if (prev.author_id < curr.author_id) {
        throw new Error(`author_id not DESC at index ${i}`);
      }
      if (prev.author_id === curr.author_id && prev.title < curr.title) {
        throw new Error(`title not DESC within same author at index ${i}`);
      }
    }
    console.log(`  ✓ Multi-column sort [DESC, DESC] works`);

    // Sort with where clause
    const filteredSortedResult = await sdk.books.list({
      where: { author_id: author1.id },
      orderBy: "title",
      order: "asc"
    });
    assert(filteredSortedResult.data.length === 2, "Jane should have 2 books");
    assert(filteredSortedResult.data.every((b: any) => b.author_id === author1.id), "All books should be Jane's");
    console.log(`  ✓ Sorting with WHERE clause: ${filteredSortedResult.data.length} books filtered and sorted`);

    // ===== TEST PAGINATION METADATA =====
    console.log("\n📄 Testing Pagination Metadata:");

    // Create additional authors and books for pagination testing
    const paginationAuthors = [];
    for (let i = 1; i <= 5; i++) {
      const author = await sdk.authors.create({ name: `Pagination Author ${i}` });
      paginationAuthors.push(author);
    }

    const paginationBooks = [];
    for (let i = 1; i <= 25; i++) {
      const book = await sdk.books.create({
        author_id: paginationAuthors[i % 5].id,
        title: `Pagination Book ${i.toString().padStart(2, '0')}`,
      });
      paginationBooks.push(book);
    }
    console.log("  ✓ Created 25 books for pagination testing");

    // Test 1: Basic pagination metadata structure
    const page1 = await sdk.books.list({ limit: 10, offset: 0, orderBy: "title", order: "asc" });
    assert(typeof page1 === 'object' && !Array.isArray(page1), "Response should be an object, not array");
    assert(Array.isArray(page1.data), "Response should have data array");
    assert(typeof page1.total === 'number', "Response should have total count");
    assert(typeof page1.limit === 'number', "Response should have limit");
    assert(typeof page1.offset === 'number', "Response should have offset");
    assert(typeof page1.hasMore === 'boolean', "Response should have hasMore flag");
    console.log(`  ✓ Pagination metadata structure correct`);

    // Test 2: Verify metadata values for first page
    assert(page1.data.length === 10, "First page should have 10 records");
    assert(page1.limit === 10, "Limit should match request");
    assert(page1.offset === 0, "Offset should match request");
    assert(page1.total >= 28, `Total should be at least 28 (got ${page1.total})`); // 3 original + 25 new
    assert(page1.hasMore === true, "First page should have more pages");
    console.log(`  ✓ First page metadata: ${page1.data.length} records, ${page1.total} total, hasMore=${page1.hasMore}`);

    // Test 3: Second page with offset
    const page2 = await sdk.books.list({ limit: 10, offset: 10, orderBy: "title", order: "asc" });
    assert(page2.data.length === 10, "Second page should have 10 records");
    assert(page2.limit === 10, "Limit should match request");
    assert(page2.offset === 10, "Offset should match request");
    assert(page2.total === page1.total, "Total should be same across pages");
    assert(page2.hasMore === true, "Second page should have more pages");
    console.log(`  ✓ Second page metadata: offset=${page2.offset}, hasMore=${page2.hasMore}`);

    // Test 4: Last page (hasMore should be false)
    const lastPageOffset = Math.floor(page1.total / 10) * 10;
    const lastPage = await sdk.books.list({ limit: 10, offset: lastPageOffset, orderBy: "title", order: "asc" });
    assert(lastPage.hasMore === false, `Last page should have hasMore=false (offset=${lastPageOffset}, total=${lastPage.total})`);
    console.log(`  ✓ Last page correctly reports hasMore=false`);

    // Test 5: Pagination with WHERE clause
    const authorId = paginationAuthors[0].id;
    const filteredPage = await sdk.books.list({
      where: { author_id: authorId },
      limit: 2,
      offset: 0,
      orderBy: "title",
      order: "asc"
    });
    assert(filteredPage.data.length <= 2, "Filtered page should respect limit");
    assert(filteredPage.data.every((b: any) => b.author_id === authorId), "All books should match WHERE clause");
    assert(filteredPage.total <= page1.total, "Filtered total should be less than or equal to unfiltered");
    assert(filteredPage.limit === 2, "Filtered limit should match request");
    console.log(`  ✓ Pagination with WHERE: ${filteredPage.total} total matching, ${filteredPage.data.length} returned`);

    // Test 6: Empty results pagination
    const emptyPage = await sdk.books.list({
      where: { title: "This Book Does Not Exist XYZ123" },
      limit: 10,
      offset: 0
    });
    assert(emptyPage.data.length === 0, "Empty results should have no data");
    assert(emptyPage.total === 0, "Empty results should have total=0");
    assert(emptyPage.hasMore === false, "Empty results should have hasMore=false");
    console.log(`  ✓ Empty results: total=0, hasMore=false`);

    // Test 7: Single page of results (no pagination needed)
    const singlePage = await sdk.books.list({
      where: { author_id: authorId },
      limit: 100,
      offset: 0
    });
    assert(singlePage.total <= 100, "Should fit in single page");
    assert(singlePage.hasMore === false, "Single page should have hasMore=false");
    assert(singlePage.data.length === singlePage.total, "Single page should return all records");
    console.log(`  ✓ Single page: ${singlePage.total} records, hasMore=false`);

    // Test 8: Calculate pages correctly
    const pageSize = 7;
    const allBooksPage = await sdk.books.list({ limit: pageSize, offset: 0 });
    const totalPages = Math.ceil(allBooksPage.total / pageSize);
    const currentPage = Math.floor(allBooksPage.offset / pageSize) + 1;
    assert(totalPages >= 4, `Should have at least 4 pages with pageSize=${pageSize} (got ${totalPages})`);
    assert(currentPage === 1, "First request should be page 1");
    console.log(`  ✓ Page calculation: page ${currentPage} of ${totalPages}`);

    // Test 9: hasMore calculation edge case (exact multiple)
    const exactPage = await sdk.books.list({
      limit: allBooksPage.total,
      offset: 0
    });
    assert(exactPage.hasMore === false, "Exact page should have hasMore=false");
    console.log(`  ✓ Exact page (limit=total): hasMore=false`);

    // Test 10: Offset beyond total
    const beyondPage = await sdk.books.list({
      limit: 10,
      offset: allBooksPage.total + 100
    });
    assert(beyondPage.data.length === 0, "Offset beyond total should return empty data");
    assert(beyondPage.total === allBooksPage.total, "Total should still be accurate");
    assert(beyondPage.hasMore === false, "Beyond total should have hasMore=false");
    console.log(`  ✓ Offset beyond total: returns empty data, correct metadata`);

    // ===== TEST JSONB OPERATIONS =====
    console.log("\n📦 Testing JSONB Operations:");

    // Create product with JSONB fields (objects and arrays)
    const product1 = await sdk.products.create({
      name: "Test Product",
      metadata: { category: "electronics", price: 99.99, inStock: true },
      tags: ["new", "featured", "sale"],
      settings: { notifications: { email: true, sms: false } }
    });
    console.log("  ✓ Created product with JSONB objects and arrays");

    // Verify JSONB data was stored correctly
    const fetchedProduct = await sdk.products.getByPk(product1.id);
    assert(fetchedProduct, "Product should exist");
    assert(fetchedProduct.metadata.category === "electronics", "JSONB object field should match");
    assert(fetchedProduct.metadata.price === 99.99, "JSONB number field should match");
    assert(Array.isArray(fetchedProduct.tags), "JSONB array should be array");
    assert(fetchedProduct.tags.length === 3, "JSONB array length should match");
    assert(fetchedProduct.settings.notifications.email === true, "Nested JSONB should match");
    console.log("  ✓ JSONB data retrieved correctly");

    // Update JSONB fields
    const updatedProduct = await sdk.products.update(product1.id, {
      metadata: { category: "computers", price: 89.99, clearance: true },
      tags: ["clearance", "limited"]
    });
    assert(updatedProduct.metadata.category === "computers", "Updated JSONB should match");
    assert(updatedProduct.tags.length === 2, "Updated JSONB array length should match");
    console.log("  ✓ JSONB fields updated correctly");

    // Test with null JSONB fields
    const product2 = await sdk.products.create({
      name: "Minimal Product",
      metadata: null,
      tags: null,
      settings: null
    });
    assert(product2.metadata === null, "Null JSONB should be null");
    console.log("  ✓ Null JSONB fields handled correctly");

    // ===== TEST SELECT/EXCLUDE =====
    console.log("\n🔍 Testing Select/Exclude Field Filtering:");

    // Test list with select
    const listWithSelect = await sdk.authors.list({ select: ["id", "name"], limit: 1 });
    assert(listWithSelect.data.length > 0, "Should have authors");
    const selectedAuthor: any = listWithSelect.data[0];
    assert(selectedAuthor.id !== undefined, "Should have id");
    assert(selectedAuthor.name !== undefined, "Should have name");
    assert(selectedAuthor.bio === undefined, "Should NOT have bio");
    console.log("  ✓ List with select: returns only selected fields");

    // Test list with exclude
    const listWithExclude = await sdk.authors.list({ exclude: ["bio", "created_at"], limit: 1 });
    assert(listWithExclude.data.length > 0, "Should have authors");
    const excludedAuthor: any = listWithExclude.data[0];
    assert(excludedAuthor.id !== undefined, "Should have id");
    assert(excludedAuthor.name !== undefined, "Should have name");
    assert(excludedAuthor.bio === undefined, "Should NOT have bio");
    console.log("  ✓ List with exclude: excludes specified fields");

    // Test create with select
    const createdWithSelect = await sdk.authors.create(
      { name: "Select Test Author", bio: "Test bio" },
      { select: ["id", "name"] }
    );
    assert(createdWithSelect.id !== undefined, "Should have id");
    assert(createdWithSelect.name === "Select Test Author", "Should have name");
    assert((createdWithSelect as any).bio === undefined, "Should NOT have bio");
    console.log("  ✓ Create with select: returns only selected fields");

    // Test update with select
    const updatedWithSelect = await sdk.authors.update(
      createdWithSelect.id,
      { name: "Updated Name" },
      { select: ["id", "name"] }
    );
    assert(updatedWithSelect?.id !== undefined, "Should have id");
    assert(updatedWithSelect?.name === "Updated Name", "Should have updated name");
    assert((updatedWithSelect as any)?.bio === undefined, "Should NOT have bio");
    console.log("  ✓ Update with select: returns only selected fields");

    // Test getByPk with select
    const fetchedWithSelect = await sdk.authors.getByPk(
      createdWithSelect.id,
      { select: ["id", "name"] }
    );
    assert(fetchedWithSelect?.id !== undefined, "Should have id");
    assert(fetchedWithSelect?.name !== undefined, "Should have name");
    assert((fetchedWithSelect as any)?.bio === undefined, "Should NOT have bio");
    console.log("  ✓ GetByPk with select: returns only selected fields");

    // Test delete with select
    const deletedWithSelect = await sdk.authors.delete(
      createdWithSelect.id,
      { select: ["id", "name"] }
    );
    assert(deletedWithSelect?.id !== undefined, "Should have id");
    assert(deletedWithSelect?.name !== undefined, "Should have name");
    assert((deletedWithSelect as any)?.bio === undefined, "Should NOT have bio");
    console.log("  ✓ Delete with select: returns only selected fields");

    // Test nested select in includes
    const withNestedSelect: any = await sdk.authors.list({
      select: ["id", "name"],
      include: {
        books: {
          select: ["id", "title"]
        }
      },
      limit: 1
    });
    if (withNestedSelect.data.length > 0 && withNestedSelect.data[0].books?.length > 0) {
      const author = withNestedSelect.data[0];
      assert(author.id !== undefined, "Author should have id");
      assert(author.name !== undefined, "Author should have name");
      assert(author.bio === undefined, "Author should NOT have bio");

      const book = author.books[0];
      assert(book.id !== undefined, "Book should have id");
      assert(book.title !== undefined, "Book should have title");
      assert(book.description === undefined, "Book should NOT have description");
      console.log("  ✓ Nested select in includes: filters both parent and child fields");
    }

    // Test error handling - both select and exclude
    try {
      await sdk.authors.list({
        select: ["id"],
        exclude: ["bio"]
      } as any);
      assert(false, "Should have thrown an error for both select and exclude");
    } catch (e: any) {
      const errorMessage = e.message || JSON.stringify(e);
      // The validation happens on the server, so we'll get a 400 error
      const hasError = errorMessage.includes("Cannot specify both") || errorMessage.includes("400");
      assert(hasError, "Error should mention both select and exclude or be a 400 error");
      console.log("  ✓ Error handling: rejects both select and exclude");
    }

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
    console.log("  • Sorting (single-col, multi-col, mixed directions)");
    console.log("  • Pagination metadata (total, hasMore, limit, offset)");
    console.log("  • JSONB operations (objects, arrays, nested, null)");
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
  outDir: { server: "${AUTH_SERVER_DIR}", client: "${AUTH_CLIENT_DIR}" },
  softDeleteColumn: null,
  includeMethodsDepth: 3,
  auth: {
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
    const { SDK } = await import(`../${AUTH_CLIENT_DIR}/index.ts`);
    
    // Test without auth header - should fail
    console.log("\n📝 Testing Auth Protection:");
    const sdkNoAuth = new SDK({ baseUrl: "http://localhost:3457" });
    
    try {
      await sdkNoAuth.authors.list();
      assert(false, "Should have failed without auth");
    } catch (e: any) {
      assert(e.message.includes("401") || e.message.includes("Unauthorized"), "Should get 401 without auth");
      console.log("  ✓ Requests rejected without API key");
    }
    
    // Test with valid auth header using the simplified API
    const sdkWithAuth = new SDK({ 
      baseUrl: "http://localhost:3457",
      auth: { apiKey: "test-key-123" }
    });
    
    const authAuthors = await sdkWithAuth.authors.list();
    console.log("  ✓ Requests accepted with valid API key");
    assert(Array.isArray(authAuthors.data), "Should get authors with valid key");
    
    // Test with invalid auth header
    const sdkBadAuth = new SDK({ 
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

  // Set the JWT secret as an environment variable so it can be resolved at runtime
  process.env.TEST_JWT_SECRET = jwtSecret;

  // Test 1: Verify hardcoded secrets are rejected
  console.log("\n  Testing security validation...");
  const badJwtConfig = `export default {
  connectionString: "${PG_URL}",
  schema: "public",
  outDir: { server: "${JWT_SERVER_DIR}", client: "${JWT_CLIENT_DIR}" },
  softDeleteColumn: null,
  includeMethodsDepth: 3,
  auth: {
    jwt: {
      services: [
        { issuer: "test-app", secret: "hardcoded-secret-value" }
      ],
      audience: "test-client"
    }
  }
};`;
  writeFileSync(CFG_PATH, badJwtConfig, "utf-8");

  try {
    execSync(`bun run src/cli.ts generate -c ${CFG_PATH}`, { stdio: "pipe" });
    throw new Error("Generator should have rejected hardcoded secret!");
  } catch (e: any) {
    if (e.message.includes("should have rejected")) throw e;
    assert(e.stderr?.toString().includes("SECURITY ERROR"), "Should show security error");
    console.log("  ✓ Generator rejects hardcoded secrets");
  }

  // Test 2: Generate with correct env: pattern
  const jwtConfig = `export default {
  connectionString: "${PG_URL}",
  schema: "public",
  outDir: { server: "${JWT_SERVER_DIR}", client: "${JWT_CLIENT_DIR}" },
  softDeleteColumn: null,
  includeMethodsDepth: 3,
  auth: {
    jwt: {
      services: [
        { issuer: "test-app", secret: "env:TEST_JWT_SECRET" }
      ],
      audience: "test-client"
    }
  }
};`;
  writeFileSync(CFG_PATH, jwtConfig, "utf-8");
  execSync(`bun run src/cli.ts generate -c ${CFG_PATH}`, { stdio: "inherit" });

  // Test 3: Verify generated code contains process.env reference (not "env:" string)
  const authFileContent = readFileSync(`${JWT_SERVER_DIR}/auth.ts`, "utf-8");
  assert(authFileContent.includes("process.env.TEST_JWT_SECRET"), "Generated auth.ts should contain process.env.TEST_JWT_SECRET");
  assert(!authFileContent.includes('"env:TEST_JWT_SECRET"'), "Generated auth.ts should NOT contain the env: DSL string");
  console.log("  ✓ Generated code uses process.env.TEST_JWT_SECRET");
  
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
    assert(Array.isArray(jwtAuthors.data), "Should get authors with valid JWT");

    // Test with JWT provider function
    const sdkWithJWTProvider = new SDKJWT({
      baseUrl: "http://localhost:3458",
      auth: { jwt: async () => validJWT }
    });

    const jwtAuthors2 = await sdkWithJWTProvider.authors.list();
    console.log("  ✓ Requests accepted with JWT provider function");
    assert(Array.isArray(jwtAuthors2.data), "Should get authors with JWT provider");
    
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

  // ===== TEST WITH SAME OUTPUT DIRECTORY =====
  console.log("\n" + "=".repeat(50));
  console.log("📁 Testing with same output directory...");
  console.log("=".repeat(50));
  
  const SAME_DIR = "test/.results-same-dir";
  
  console.log("\n1) Generating with same server and client directory...");
  const sameDirConfig = `export default {
  connectionString: "${PG_URL}",
  schema: "public",
  outDir: "${SAME_DIR}",
  softDeleteColumn: null,
  includeMethodsDepth: 3
};`;
  writeFileSync(CFG_PATH, sameDirConfig, "utf-8");
  execSync(`bun run src/cli.ts generate -c ${CFG_PATH}`, { stdio: "inherit" });
  
  console.log("\n2) Verifying directory structure...");
  
  // Check that SDK files are in the sdk subdirectory
  assert(existsSync(join(SAME_DIR, "sdk")), "SDK subdirectory should exist");
  assert(existsSync(join(SAME_DIR, "sdk", "index.ts")), "SDK index.ts should be in sdk subdir");
  assert(existsSync(join(SAME_DIR, "sdk", "authors.ts")), "SDK client files should be in sdk subdir");
  assert(existsSync(join(SAME_DIR, "sdk", "base-client.ts")), "Base client should be in sdk subdir");
  
  // Check that server files are in the root
  assert(existsSync(join(SAME_DIR, "router.ts")), "Router should be in root");
  assert(existsSync(join(SAME_DIR, "routes")), "Routes directory should be in root");
  assert(existsSync(join(SAME_DIR, "include-loader.ts")), "Include loader should be in root");
  assert(existsSync(join(SAME_DIR, "sdk-bundle.ts")), "SDK bundle should be in root");
  
  console.log("  ✓ Client SDK files are in 'sdk' subdirectory");
  console.log("  ✓ Server files are in root directory");
  console.log("  ✓ Clean separation between server and client code");
  
  // Verify SDK bundle is generated correctly with client files
  console.log("\n2b) Verifying SDK bundle generation...");
  const bundleContent = readFileSync(join(SAME_DIR, "sdk-bundle.ts"), "utf-8");
  assert(bundleContent.includes("SDK_MANIFEST"), "Bundle should contain SDK_MANIFEST");
  assert(bundleContent.includes("files:"), "Bundle should have files object");
  assert(!bundleContent.includes("files: {}"), "Bundle files should not be empty");
  assert(bundleContent.includes('"index.ts":'), "Bundle should contain index.ts");
  assert(bundleContent.includes('"authors.ts":'), "Bundle should contain authors.ts");
  assert(bundleContent.includes('"base-client.ts":'), "Bundle should contain base-client.ts");
  console.log("  ✓ SDK bundle correctly includes all client files");
  
  // Test that the generated code works
  console.log("\n3) Testing generated code functionality...");
  const { registerAuthorsRoutes: registerAuthorsSameDir } = await import(`../${SAME_DIR}/routes/authors.ts`);
  const { registerBooksRoutes: registerBooksSameDir } = await import(`../${SAME_DIR}/routes/books.ts`);
  
  const pg4 = new Client({ connectionString: PG_URL });
  await pg4.connect();
  
  const appSameDir = new Hono();
  registerAuthorsSameDir(appSameDir, { pg: pg4 });
  registerBooksSameDir(appSameDir, { pg: pg4 });
  
  const serverSameDir = serve({ fetch: appSameDir.fetch, port: 3459 });
  console.log("   → Testing server on http://localhost:3459");
  
  try {
    const { SDK: SDKSameDir } = await import(`../${SAME_DIR}/sdk/index.ts`);
    const sdkSameDir = new SDKSameDir({ baseUrl: "http://localhost:3459" });
    
    // Quick functionality test
    const testAuthor = await sdkSameDir.authors.create({ name: "Test Author Same Dir" });
    assert(testAuthor.name === "Test Author Same Dir", "Should create author");
    
    const fetchedAuthor = await sdkSameDir.authors.getByPk(testAuthor.id);
    assert(fetchedAuthor?.name === "Test Author Same Dir", "Should fetch author");
    
    await sdkSameDir.authors.delete(testAuthor.id);
    console.log("  ✓ SDK from same-dir configuration works correctly");
    
  } finally {
    serverSameDir.close();
    await pg4.end();
  }
  
  console.log("\n✅ Same directory configuration tests passed!");
    
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
