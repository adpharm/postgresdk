#!/usr/bin/env bun

import { test, expect } from "bun:test";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Client } from "pg";
import { SDK } from "./.results/client";

test("getByPkWith* methods return the correct record", async () => {
  // Setup database
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    // Clean up
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM authors");
    await pg.query("DELETE FROM tags");

    // Insert test data - IMPORTANT: Insert multiple records to ensure we can detect the bug
    const author1 = await pg.query("INSERT INTO authors (name) VALUES ('Author One') RETURNING *");
    const author2 = await pg.query("INSERT INTO authors (name) VALUES ('Author Two') RETURNING *");
    const author3 = await pg.query("INSERT INTO authors (name) VALUES ('Author Three') RETURNING *");
    
    // Insert books in a specific order
    const book1 = await pg.query(
      "INSERT INTO books (title, author_id) VALUES ('First Book', $1) RETURNING *",
      [author1.rows[0].id]
    );
    const book2 = await pg.query(
      "INSERT INTO books (title, author_id) VALUES ('Second Book', $1) RETURNING *",
      [author2.rows[0].id]
    );
    const book3 = await pg.query(
      "INSERT INTO books (title, author_id) VALUES ('Third Book', $1) RETURNING *",
      [author3.rows[0].id]
    );
    
    // Add tags
    const tag1 = await pg.query("INSERT INTO tags (name) VALUES ('Tag One') RETURNING *");
    const tag2 = await pg.query("INSERT INTO tags (name) VALUES ('Tag Two') RETURNING *");
    
    await pg.query("INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)", [book1.rows[0].id, tag1.rows[0].id]);
    await pg.query("INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)", [book2.rows[0].id, tag2.rows[0].id]);
    await pg.query("INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)", [book3.rows[0].id, tag1.rows[0].id]);

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

    const server = serve({ fetch: app.fetch, port: 3461 });

    // Test SDK
    const sdk = new SDK({ baseUrl: "http://localhost:3461" });

    // CRITICAL TESTS: Verify we get the CORRECT record, not just any record
    
    // Test 1: Get SECOND book with author (not first)
    const secondBook = await sdk.books.getByPkWithAuthor(book2.rows[0].id);
    expect(secondBook).not.toBeNull();
    expect(secondBook!.id).toBe(book2.rows[0].id);
    expect(secondBook!.title).toBe("Second Book");
    expect(secondBook!.author.name).toBe("Author Two");
    
    // Test 2: Get THIRD book with tags (not first)
    const thirdBook = await sdk.books.getByPkWithTags(book3.rows[0].id);
    expect(thirdBook).not.toBeNull();
    expect(thirdBook!.id).toBe(book3.rows[0].id);
    expect(thirdBook!.title).toBe("Third Book");
    expect(thirdBook!.tags[0].name).toBe("Tag One");
    
    // Test 3: Get FIRST book with author (to ensure it also works)
    const firstBook = await sdk.books.getByPkWithAuthor(book1.rows[0].id);
    expect(firstBook).not.toBeNull();
    expect(firstBook!.id).toBe(book1.rows[0].id);
    expect(firstBook!.title).toBe("First Book");
    expect(firstBook!.author.name).toBe("Author One");
    
    // Test 4: Get author with books - verify correct author
    const secondAuthor = await sdk.authors.getByPkWithBooks(author2.rows[0].id);
    expect(secondAuthor).not.toBeNull();
    expect(secondAuthor!.id).toBe(author2.rows[0].id);
    expect(secondAuthor!.name).toBe("Author Two");
    expect(secondAuthor!.books).toHaveLength(1);
    expect(secondAuthor!.books[0].title).toBe("Second Book");
    
    // Test 5: Non-existent ID should return null
    const nonExistent = await sdk.books.getByPkWithAuthor("00000000-0000-0000-0000-000000000000");
    expect(nonExistent).toBeNull();

    // Cleanup
    server.close();
  } finally {
    await pg.end();
  }
});

test("list with where clause filters correctly", async () => {
  // Setup database
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    // Clean up
    await pg.query("DELETE FROM authors");

    // Insert test data
    await pg.query("INSERT INTO authors (name) VALUES ('Alice'), ('Bob'), ('Charlie')");
    
    // Start server
    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const app = new Hono();
    const deps = { pg };
    registerAuthorsRoutes(app, deps);
    const server = serve({ fetch: app.fetch, port: 3462 });

    // Test SDK
    const sdk = new SDK({ baseUrl: "http://localhost:3462" });

    // Test WHERE clause filtering
    const bobAuthors = await sdk.authors.list({ where: { name: "Bob" } });
    expect(bobAuthors).toHaveLength(1);
    expect(bobAuthors[0].name).toBe("Bob");
    
    const allAuthors = await sdk.authors.list();
    expect(allAuthors.length).toBeGreaterThanOrEqual(3);

    // Cleanup
    server.close();
  } finally {
    await pg.end();
  }
});