import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { Client } from "pg";
import { Hono } from "hono";
import { serve } from "@hono/node-server";

const PG_URL = "postgres://user:pass@localhost:5432/testdb";
const SERVER_DIR = "test/.results/server";
const CLIENT_DIR = "test/.results/client";
const CFG_PATH = join(process.cwd(), "gen.config.ts");

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

function writeTestConfig() {
  const cfg = `export default {
  connectionString: "${PG_URL}",
  schema: "public",
  outServer: "${SERVER_DIR}",
  outClient: "${CLIENT_DIR}",
  softDeleteColumn: null,
  includeDepthLimit: 3,
  dateType: "date"
};`;
  writeFileSync(CFG_PATH, cfg, "utf-8");
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function main() {
  console.log("0) Write test gen.config.ts …");
  writeTestConfig();

  console.log("1) Apply test schema via pg client …");
  await applySchemaWithPg("test/schema.sql");

  console.log("2) Run generator …");
  execSync(`bun run gen/index.ts`, { stdio: "inherit" });

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
}

main().catch((err) => {
  console.error("❌ Test failed", err);
  process.exit(1);
});
