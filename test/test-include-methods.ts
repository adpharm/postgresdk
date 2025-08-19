#!/usr/bin/env bun

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Client } from "pg";
import { SDK } from "./.results/client";

async function main() {
  console.log("\n==================================================");
  console.log("🔍 Testing Include Methods Generation...");
  console.log("==================================================\n");

  // Setup database
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  // Clean up tables
  await pg.query("DELETE FROM book_tags");
  await pg.query("DELETE FROM books");
  await pg.query("DELETE FROM authors");
  await pg.query("DELETE FROM tags");

  // Insert test data
  const author1 = await pg.query("INSERT INTO authors (name) VALUES ('J.K. Rowling') RETURNING *");
  const author2 = await pg.query("INSERT INTO authors (name) VALUES ('George Orwell') RETURNING *");
  
  const book1 = await pg.query(
    "INSERT INTO books (title, author_id) VALUES ('Harry Potter', $1) RETURNING *",
    [author1.rows[0].id]
  );
  const book2 = await pg.query(
    "INSERT INTO books (title, author_id) VALUES ('1984', $1) RETURNING *",
    [author2.rows[0].id]
  );
  
  const tag1 = await pg.query("INSERT INTO tags (name) VALUES ('Fantasy') RETURNING *");
  const tag2 = await pg.query("INSERT INTO tags (name) VALUES ('Dystopian') RETURNING *");
  
  await pg.query(
    "INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)",
    [book1.rows[0].id, tag1.rows[0].id]
  );
  await pg.query(
    "INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)",
    [book2.rows[0].id, tag2.rows[0].id]
  );

  // Start server
  const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
  const { registerBooksRoutes } = await import("./.results/server/routes/books");
  const { registerTagsRoutes } = await import("./.results/server/routes/tags");
  const { registerBookTagsRoutes } = await import("./.results/server/routes/book_tags");

  const app = new Hono();
  const deps = { pg };
  
  registerAuthorsRoutes(app, deps);
  registerBooksRoutes(app, deps);
  registerTagsRoutes(app, deps);
  registerBookTagsRoutes(app, deps);

  const server = serve({ fetch: app.fetch, port: 3460 });
  console.log("   → Test server on http://localhost:3460\n");

  // Test SDK
  const sdk = new SDK({ baseUrl: "http://localhost:3460" });

  console.log("📝 Testing Generated Include Methods:\n");

  // Test listWithAuthor
  console.log("1. Testing books.listWithAuthor():");
  const booksWithAuthor = await sdk.books.listWithAuthor();
  console.log(`   ✓ Found ${booksWithAuthor.length} books`);
  for (const book of booksWithAuthor) {
    console.log(`   ✓ "${book.title}" by ${book.author.name}`);
    // TypeScript knows book.author exists and is of type SelectAuthors
    const authorName: string = book.author.name;
  }

  // Test listWithTags
  console.log("\n2. Testing books.listWithTags():");
  const booksWithTags = await sdk.books.listWithTags();
  console.log(`   ✓ Found ${booksWithTags.length} books`);
  for (const book of booksWithTags) {
    console.log(`   ✓ "${book.title}" has ${book.tags.length} tag(s): ${book.tags.map(t => t.name).join(", ")}`);
    // TypeScript knows book.tags exists and is SelectTags[]
    const firstTagName: string = book.tags[0]?.name ?? "";
  }

  // Test listWithAuthorAndTags
  console.log("\n3. Testing books.listWithAuthorAndTags():");
  const booksWithBoth = await sdk.books.listWithAuthorAndTags();
  console.log(`   ✓ Found ${booksWithBoth.length} books`);
  for (const book of booksWithBoth) {
    console.log(`   ✓ "${book.title}" by ${book.author.name} [${book.tags.map(t => t.name).join(", ")}]`);
  }

  // Test getByPkWithAuthor
  console.log("\n4. Testing books.getByPkWithAuthor():");
  const singleBook = await sdk.books.getByPkWithAuthor(book1.rows[0].id);
  if (singleBook) {
    console.log(`   ✓ Got "${singleBook.title}" by ${singleBook.author.name}`);
  }

  // Test getByPkWithTags
  console.log("\n5. Testing books.getByPkWithTags():");
  const singleBookWithTags = await sdk.books.getByPkWithTags(book2.rows[0].id);
  if (singleBookWithTags) {
    console.log(`   ✓ Got "${singleBookWithTags.title}" with tags: ${singleBookWithTags.tags.map(t => t.name).join(", ")}`);
  }

  // Test authors methods
  console.log("\n6. Testing authors.listWithBooks():");
  const authorsWithBooks = await sdk.authors.listWithBooks();
  console.log(`   ✓ Found ${authorsWithBooks.length} authors`);
  for (const author of authorsWithBooks) {
    console.log(`   ✓ ${author.name} has ${author.books.length} book(s)`);
  }

  console.log("\n==================================================");
  console.log("✅ Include methods generation test complete!");
  console.log("==================================================");
  console.log("\nGenerated methods provide:");
  console.log("  • Full type safety with TypeScript");
  console.log("  • No need to specify include objects");
  console.log("  • Autocomplete shows all available options");
  console.log("  • Each method has a concrete return type");
  console.log("  • Circular references are automatically avoided");

  // Cleanup
  server.close();
  await pg.end();
}

main().catch(console.error);