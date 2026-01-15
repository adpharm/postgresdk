#!/usr/bin/env bun

import { test, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Client } from "pg";
import { SDK } from "./.results/client";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { SelectBooks } from "./.results/client/types/books";
import type { SelectTags } from "./.results/client/types/tags";
import type { SelectAuthors } from "./.results/client/types/authors";

type BookWithAuthor = SelectBooks & { author: SelectAuthors };
type BookWithTags = SelectBooks & { tags: SelectTags[] };
type AuthorWithBooks = SelectAuthors & { books: SelectBooks[] };
type BookWithAuthorAndTags = SelectBooks & { author: SelectAuthors; tags: SelectTags[] };
type AuthorWithBooksAndTags = SelectAuthors & { books: BookWithTags[] };

const execAsync = promisify(exec);
const CONTAINER_NAME = "postgresdk-test-db";

async function ensurePostgresRunning(): Promise<void> {
  try {
    const { stdout } = await execAsync(`docker ps --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`);
    if (stdout.trim() === CONTAINER_NAME) {
      return;
    }
  } catch {}

  console.log("🐳 Starting PostgreSQL container for include methods tests...");
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

test("listWithBooks with orderBy on included books", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM authors");

    const author = await pg.query("INSERT INTO authors (name) VALUES ('Author') RETURNING *");
    const authorId = author.rows[0]!.id;

    await pg.query("INSERT INTO books (title, author_id) VALUES ('Zebra Book', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Apple Book', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Mango Book', $1)", [authorId]);

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const { registerBooksRoutes } = await import("./.results/server/routes/books");
    const app = new Hono();
    registerAuthorsRoutes(app, { pg });
    registerBooksRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3470 });

    const sdk = new SDK({ baseUrl: "http://localhost:3470" });

    const result = await sdk.authors.listWithBooks({
      booksInclude: {
        orderBy: 'title',
        order: 'asc'
      }
    });

    expect(result.data).toHaveLength(1);
    const authorData = result.data[0] as AuthorWithBooks;
    expect(authorData.books).toHaveLength(3);
    expect(authorData.books[0]!.title).toBe('Apple Book');
    expect(authorData.books[1]!.title).toBe('Mango Book');
    expect(authorData.books[2]!.title).toBe('Zebra Book');

    server.close();
  } finally {
    await pg.end();
  }
});

test("listWithBooks with limit on included books", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM authors");

    const author = await pg.query("INSERT INTO authors (name) VALUES ('Prolific Author') RETURNING *");
    const authorId = author.rows[0]!.id;

    await pg.query("INSERT INTO books (title, author_id) VALUES ('Book 1', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Book 2', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Book 3', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Book 4', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Book 5', $1)", [authorId]);

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const { registerBooksRoutes } = await import("./.results/server/routes/books");
    const app = new Hono();
    registerAuthorsRoutes(app, { pg });
    registerBooksRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3471 });

    const sdk = new SDK({ baseUrl: "http://localhost:3471" });

    const result = await sdk.authors.listWithBooks({
      booksInclude: {
        limit: 3
      }
    });

    expect(result.data).toHaveLength(1);
    const authorData = result.data[0] as AuthorWithBooks;
    expect(authorData.books).toHaveLength(3);

    server.close();
  } finally {
    await pg.end();
  }
});

test("listWithBooks with orderBy + limit (top-N pattern)", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM authors");

    const author = await pg.query("INSERT INTO authors (name) VALUES ('Author') RETURNING *");
    const authorId = author.rows[0]!.id;

    await pg.query("INSERT INTO books (title, author_id) VALUES ('F Book', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('A Book', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('D Book', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('C Book', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('B Book', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('E Book', $1)", [authorId]);

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const { registerBooksRoutes } = await import("./.results/server/routes/books");
    const app = new Hono();
    registerAuthorsRoutes(app, { pg });
    registerBooksRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3472 });

    const sdk = new SDK({ baseUrl: "http://localhost:3472" });

    const result = await sdk.authors.listWithBooks({
      booksInclude: {
        orderBy: 'title',
        order: 'asc',
        limit: 3
      }
    });

    expect(result.data).toHaveLength(1);
    const authorData = result.data[0] as AuthorWithBooks;
    expect(authorData.books).toHaveLength(3);
    expect(authorData.books[0]!.title).toBe('A Book');
    expect(authorData.books[1]!.title).toBe('B Book');
    expect(authorData.books[2]!.title).toBe('C Book');

    server.close();
  } finally {
    await pg.end();
  }
});

test("listWithAuthorAndTags with options on both includes", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM authors");
    await pg.query("DELETE FROM tags");

    // Create 2 authors
    const author1 = await pg.query("INSERT INTO authors (name) VALUES ('Zebra Author') RETURNING *");
    const author2 = await pg.query("INSERT INTO authors (name) VALUES ('Alpha Author') RETURNING *");

    // Create book associated with author1
    const book = await pg.query("INSERT INTO books (title, author_id) VALUES ('Test Book', $1) RETURNING *", [author1.rows[0]!.id]);
    const bookId = book.rows[0]!.id;

    // Create 5 tags
    const tag1 = await pg.query("INSERT INTO tags (name) VALUES ('Z Tag') RETURNING *");
    const tag2 = await pg.query("INSERT INTO tags (name) VALUES ('A Tag') RETURNING *");
    const tag3 = await pg.query("INSERT INTO tags (name) VALUES ('M Tag') RETURNING *");
    const tag4 = await pg.query("INSERT INTO tags (name) VALUES ('B Tag') RETURNING *");
    const tag5 = await pg.query("INSERT INTO tags (name) VALUES ('C Tag') RETURNING *");

    await pg.query("INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)", [bookId, tag1.rows[0]!.id]);
    await pg.query("INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)", [bookId, tag2.rows[0]!.id]);
    await pg.query("INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)", [bookId, tag3.rows[0]!.id]);
    await pg.query("INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)", [bookId, tag4.rows[0]!.id]);
    await pg.query("INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)", [bookId, tag5.rows[0]!.id]);

    const { registerBooksRoutes } = await import("./.results/server/routes/books");
    const { registerTagsRoutes } = await import("./.results/server/routes/tags");
    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const { registerBookTagsRoutes } = await import("./.results/server/routes/book_tags");
    const app = new Hono();
    registerBooksRoutes(app, { pg });
    registerTagsRoutes(app, { pg });
    registerAuthorsRoutes(app, { pg });
    registerBookTagsRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3473 });

    const sdk = new SDK({ baseUrl: "http://localhost:3473" });

    const result = await sdk.books.listWithAuthorAndTags({
      tagsInclude: {
        orderBy: 'name',
        order: 'asc',
        limit: 3
      }
    });

    expect(result.data).toHaveLength(1);
    const bookData = result.data[0] as BookWithAuthorAndTags;
    expect(bookData.author).toBeDefined();
    expect(bookData.author.name).toBe('Zebra Author');
    expect(bookData.tags).toHaveLength(3);
    expect(bookData.tags[0]!.name).toBe('A Tag');
    expect(bookData.tags[1]!.name).toBe('B Tag');
    expect(bookData.tags[2]!.name).toBe('C Tag');

    server.close();
  } finally {
    await pg.end();
  }
});

test("getByPkWithBooks respects booksInclude options", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM authors");

    const author = await pg.query("INSERT INTO authors (name) VALUES ('Author') RETURNING *");
    const authorId = author.rows[0]!.id;

    await pg.query("INSERT INTO books (title, author_id) VALUES ('Z Book', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('A Book', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('M Book', $1)", [authorId]);

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const { registerBooksRoutes } = await import("./.results/server/routes/books");
    const app = new Hono();
    registerAuthorsRoutes(app, { pg });
    registerBooksRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3474 });

    const sdk = new SDK({ baseUrl: "http://localhost:3474" });

    const result = await sdk.authors.getByPkWithBooks(authorId, {
      booksInclude: {
        orderBy: 'title',
        order: 'desc',
        limit: 2
      }
    });

    expect(result).not.toBeNull();
    const authorData = result as AuthorWithBooks;
    expect(authorData.books).toHaveLength(2);
    expect(authorData.books[0]!.title).toBe('Z Book');
    expect(authorData.books[1]!.title).toBe('M Book');

    server.close();
  } finally {
    await pg.end();
  }
});

test("listWithBooksAndTags with nested include options", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM tags");
    await pg.query("DELETE FROM authors");

    const author = await pg.query("INSERT INTO authors (name) VALUES ('Author') RETURNING *");
    const authorId = author.rows[0]!.id;

    // Create 4 books
    const book1 = await pg.query("INSERT INTO books (title, author_id) VALUES ('Book A', $1) RETURNING *", [authorId]);
    const book2 = await pg.query("INSERT INTO books (title, author_id) VALUES ('Book B', $1) RETURNING *", [authorId]);
    const book3 = await pg.query("INSERT INTO books (title, author_id) VALUES ('Book C', $1) RETURNING *", [authorId]);
    const book4 = await pg.query("INSERT INTO books (title, author_id) VALUES ('Book D', $1) RETURNING *", [authorId]);

    // Create 3 tags per book
    for (const bookResult of [book1, book2, book3, book4]) {
      const bookTitle = bookResult.rows[0]!.title;
      const tag1 = await pg.query("INSERT INTO tags (name) VALUES ($1) RETURNING *", [`Z-Tag-${bookTitle}`]);
      const tag2 = await pg.query("INSERT INTO tags (name) VALUES ($1) RETURNING *", [`A-Tag-${bookTitle}`]);
      const tag3 = await pg.query("INSERT INTO tags (name) VALUES ($1) RETURNING *", [`M-Tag-${bookTitle}`]);

      await pg.query("INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)", [bookResult.rows[0]!.id, tag1.rows[0]!.id]);
      await pg.query("INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)", [bookResult.rows[0]!.id, tag2.rows[0]!.id]);
      await pg.query("INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)", [bookResult.rows[0]!.id, tag3.rows[0]!.id]);
    }

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const { registerBooksRoutes } = await import("./.results/server/routes/books");
    const { registerTagsRoutes } = await import("./.results/server/routes/tags");
    const { registerBookTagsRoutes } = await import("./.results/server/routes/book_tags");
    const app = new Hono();
    registerAuthorsRoutes(app, { pg });
    registerBooksRoutes(app, { pg });
    registerTagsRoutes(app, { pg });
    registerBookTagsRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3475 });

    const sdk = new SDK({ baseUrl: "http://localhost:3475" });

    const result = await sdk.authors.listWithBooksAndTags({
      booksInclude: {
        orderBy: 'title',
        order: 'asc',
        limit: 2,
        include: {
          tags: {
            orderBy: 'name',
            order: 'asc',
            limit: 2
          }
        }
      }
    });

    expect(result.data).toHaveLength(1);
    const authorData = result.data[0] as AuthorWithBooksAndTags;
    expect(authorData.books).toHaveLength(2);
    expect(authorData.books[0]!.title).toBe('Book A');
    expect(authorData.books[1]!.title).toBe('Book B');

    // Each book should have max 2 tags, sorted alphabetically
    expect(authorData.books[0]!.tags).toHaveLength(2);
    expect(authorData.books[0]!.tags[0]!.name).toBe('A-Tag-Book A');
    expect(authorData.books[0]!.tags[1]!.name).toBe('M-Tag-Book A');

    expect(authorData.books[1]!.tags).toHaveLength(2);
    expect(authorData.books[1]!.tags[0]!.name).toBe('A-Tag-Book B');
    expect(authorData.books[1]!.tags[1]!.name).toBe('M-Tag-Book B');

    server.close();
  } finally {
    await pg.end();
  }
});

test("listWithBooks with no options works like before", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM authors");

    const author = await pg.query("INSERT INTO authors (name) VALUES ('Author') RETURNING *");
    const authorId = author.rows[0]!.id;

    await pg.query("INSERT INTO books (title, author_id) VALUES ('Book 1', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Book 2', $1)", [authorId]);

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const { registerBooksRoutes } = await import("./.results/server/routes/books");
    const app = new Hono();
    registerAuthorsRoutes(app, { pg });
    registerBooksRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3476 });

    const sdk = new SDK({ baseUrl: "http://localhost:3476" });

    // Call without any options - should work like before
    const result = await sdk.authors.listWithBooks();

    expect(result.data).toHaveLength(1);
    const authorData = result.data[0] as AuthorWithBooks;
    expect(authorData.books).toHaveLength(2);

    server.close();
  } finally {
    await pg.end();
  }
});

test("listWithBooks combines base params with include options", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM authors");

    const author1 = await pg.query("INSERT INTO authors (name) VALUES ('Alice') RETURNING *");
    const author2 = await pg.query("INSERT INTO authors (name) VALUES ('Bob') RETURNING *");

    await pg.query("INSERT INTO books (title, author_id) VALUES ('Z Book', $1)", [author1.rows[0]!.id]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('A Book', $1)", [author1.rows[0]!.id]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Book X', $1)", [author2.rows[0]!.id]);

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const { registerBooksRoutes } = await import("./.results/server/routes/books");
    const app = new Hono();
    registerAuthorsRoutes(app, { pg });
    registerBooksRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3477 });

    const sdk = new SDK({ baseUrl: "http://localhost:3477" });

    const result = await sdk.authors.listWithBooks({
      where: { name: 'Alice' },
      orderBy: 'name',
      order: 'asc',
      booksInclude: {
        orderBy: 'title',
        order: 'desc',
        limit: 1
      }
    });

    expect(result.data).toHaveLength(1);
    const authorData = result.data[0] as AuthorWithBooks;
    expect(authorData.name).toBe('Alice');
    expect(authorData.books).toHaveLength(1);
    expect(authorData.books[0]!.title).toBe('Z Book'); // desc order, limit 1

    server.close();
  } finally {
    await pg.end();
  }
});
