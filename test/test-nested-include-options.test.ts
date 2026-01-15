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

type BookWithTags = SelectBooks & { tags: SelectTags[] };
type AuthorWithBooks = SelectAuthors & { books: SelectBooks[] };
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

  console.log("🐳 Starting PostgreSQL container for nested include tests...");
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

test("nested limit on 1:N relation (authors → books)", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM authors");

    // Create author with 5 books
    const author = await pg.query("INSERT INTO authors (name) VALUES ('Prolific Author') RETURNING *");
    const authorId = author.rows[0].id;

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
    const server = serve({ fetch: app.fetch, port: 3463 });

    const sdk = new SDK({ baseUrl: "http://localhost:3463" });

    const result = await sdk.authors.list({
      include: {
        books: {
          limit: 3
        }
      }
    });

    expect(result.data).toHaveLength(1);
    const author1 = result.data[0] as AuthorWithBooks;
    expect(author1.books).toBeDefined();
    expect(author1.books).toHaveLength(3); // Should only return 3 books, not 5

    server.close();
  } finally {
    await pg.end();
  }
});

test("nested orderBy on 1:N relation (authors → books)", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM authors");

    const author = await pg.query("INSERT INTO authors (name) VALUES ('Author') RETURNING *");
    const authorId = author.rows[0].id;

    // Insert in specific order, expect different order back
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Zebra Book', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Apple Book', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Mango Book', $1)", [authorId]);

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const { registerBooksRoutes } = await import("./.results/server/routes/books");
    const app = new Hono();
    registerAuthorsRoutes(app, { pg });
    registerBooksRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3464 });

    const sdk = new SDK({ baseUrl: "http://localhost:3464" });

    const result = await sdk.authors.list({
      include: {
        books: {
          orderBy: 'title',
          order: 'asc'
        }
      }
    });

    expect(result.data).toHaveLength(1);
    const author2 = result.data[0] as AuthorWithBooks;
    expect(author2.books).toHaveLength(3);
    expect(author2.books[0]!.title).toBe('Apple Book');
    expect(author2.books[1]!.title).toBe('Mango Book');
    expect(author2.books[2]!.title).toBe('Zebra Book');

    server.close();
  } finally {
    await pg.end();
  }
});

test("nested offset on 1:N relation (authors → books)", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM authors");

    const author = await pg.query("INSERT INTO authors (name) VALUES ('Author') RETURNING *");
    const authorId = author.rows[0].id;

    // Insert 5 books with sortable titles
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Book A', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Book B', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Book C', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Book D', $1)", [authorId]);
    await pg.query("INSERT INTO books (title, author_id) VALUES ('Book E', $1)", [authorId]);

    const { registerAuthorsRoutes } = await import("./.results/server/routes/authors");
    const { registerBooksRoutes } = await import("./.results/server/routes/books");
    const app = new Hono();
    registerAuthorsRoutes(app, { pg });
    registerBooksRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3465 });

    const sdk = new SDK({ baseUrl: "http://localhost:3465" });

    const result = await sdk.authors.list({
      include: {
        books: {
          orderBy: 'title',
          order: 'asc',
          offset: 2,
          limit: 2
        }
      }
    });

    expect(result.data).toHaveLength(1);
    const author3 = result.data[0] as AuthorWithBooks;
    expect(author3.books).toHaveLength(2);
    expect(author3.books[0]!.title).toBe('Book C'); // 3rd book (offset 2)
    expect(author3.books[1]!.title).toBe('Book D'); // 4th book

    server.close();
  } finally {
    await pg.end();
  }
});

test("nested limit + orderBy combined (top N pattern)", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM authors");

    const author = await pg.query("INSERT INTO authors (name) VALUES ('Author') RETURNING *");
    const authorId = author.rows[0].id;

    // Insert 6 books
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
    const server = serve({ fetch: app.fetch, port: 3466 });

    const sdk = new SDK({ baseUrl: "http://localhost:3466" });

    const result = await sdk.authors.list({
      include: {
        books: {
          orderBy: 'title',
          order: 'asc',
          limit: 3
        }
      }
    });

    expect(result.data).toHaveLength(1);
    const author4 = result.data[0] as AuthorWithBooks;
    expect(author4.books).toHaveLength(3);
    expect(author4.books[0]!.title).toBe('A Book');
    expect(author4.books[1]!.title).toBe('B Book');
    expect(author4.books[2]!.title).toBe('C Book');

    server.close();
  } finally {
    await pg.end();
  }
});

test("nested limit on M:N relation (books → tags)", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM tags");
    await pg.query("DELETE FROM authors");

    const author5 = await pg.query("INSERT INTO authors (name) VALUES ('Author') RETURNING *");
    const bookResult = await pg.query("INSERT INTO books (title, author_id) VALUES ('Tagged Book', $1) RETURNING *", [author5.rows[0].id]);
    const bookId = bookResult.rows[0].id;

    // Create 4 tags
    const tag1 = await pg.query("INSERT INTO tags (name) VALUES ('Tag 1') RETURNING *");
    const tag2 = await pg.query("INSERT INTO tags (name) VALUES ('Tag 2') RETURNING *");
    const tag3 = await pg.query("INSERT INTO tags (name) VALUES ('Tag 3') RETURNING *");
    const tag4 = await pg.query("INSERT INTO tags (name) VALUES ('Tag 4') RETURNING *");

    await pg.query("INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)", [bookId, tag1.rows[0]!.id]);
    await pg.query("INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)", [bookId, tag2.rows[0]!.id]);
    await pg.query("INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)", [bookId, tag3.rows[0]!.id]);
    await pg.query("INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)", [bookId, tag4.rows[0]!.id]);

    const { registerBooksRoutes } = await import("./.results/server/routes/books");
    const { registerTagsRoutes } = await import("./.results/server/routes/tags");
    const { registerBookTagsRoutes } = await import("./.results/server/routes/book_tags");
    const app = new Hono();
    registerBooksRoutes(app, { pg });
    registerTagsRoutes(app, { pg });
    registerBookTagsRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3467 });

    const sdk = new SDK({ baseUrl: "http://localhost:3467" });

    const result = await sdk.books.list({
      include: {
        tags: {
          limit: 2
        }
      }
    });

    expect(result.data).toHaveLength(1);
    const book5 = result.data[0] as BookWithTags;
    expect(book5.tags).toBeDefined();
    expect(book5.tags).toHaveLength(2); // Should only return 2 tags, not 4

    server.close();
  } finally {
    await pg.end();
  }
});

test("nested orderBy on M:N relation (books → tags)", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM tags");
    await pg.query("DELETE FROM authors");

    const author6 = await pg.query("INSERT INTO authors (name) VALUES ('Author') RETURNING *");
    const bookResult2 = await pg.query("INSERT INTO books (title, author_id) VALUES ('Book', $1) RETURNING *", [author6.rows[0].id]);
    const bookId = bookResult2.rows[0].id;

    const tagZoo = await pg.query("INSERT INTO tags (name) VALUES ('Zoo') RETURNING *");
    const tagAlpha = await pg.query("INSERT INTO tags (name) VALUES ('Alpha') RETURNING *");
    const tagBeta = await pg.query("INSERT INTO tags (name) VALUES ('Beta') RETURNING *");

    await pg.query("INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)", [bookId, tagZoo.rows[0]!.id]);
    await pg.query("INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)", [bookId, tagAlpha.rows[0]!.id]);
    await pg.query("INSERT INTO book_tags (book_id, tag_id) VALUES ($1, $2)", [bookId, tagBeta.rows[0]!.id]);

    const { registerBooksRoutes } = await import("./.results/server/routes/books");
    const { registerTagsRoutes } = await import("./.results/server/routes/tags");
    const { registerBookTagsRoutes } = await import("./.results/server/routes/book_tags");
    const app = new Hono();
    registerBooksRoutes(app, { pg });
    registerTagsRoutes(app, { pg });
    registerBookTagsRoutes(app, { pg });
    const server = serve({ fetch: app.fetch, port: 3468 });

    const sdk = new SDK({ baseUrl: "http://localhost:3468" });

    const result = await sdk.books.list({
      include: {
        tags: {
          orderBy: 'name',
          order: 'desc'
        }
      }
    });

    expect(result.data).toHaveLength(1);
    const book = result.data[0] as BookWithTags;
    expect(book.tags).toHaveLength(3);
    expect(book.tags[0]!.name).toBe('Zoo');
    expect(book.tags[1]!.name).toBe('Beta');
    expect(book.tags[2]!.name).toBe('Alpha');

    server.close();
  } finally {
    await pg.end();
  }
});

test("multi-level nesting with options (authors → books → tags)", async () => {
  const pg = new Client({ connectionString: "postgres://user:pass@localhost:5432/testdb" });
  await pg.connect();

  try {
    await pg.query("DELETE FROM book_tags");
    await pg.query("DELETE FROM books");
    await pg.query("DELETE FROM tags");
    await pg.query("DELETE FROM authors");

    const author7 = await pg.query("INSERT INTO authors (name) VALUES ('Author') RETURNING *");
    const authorId = author7.rows[0].id;

    // Create 4 books
    const book1 = await pg.query("INSERT INTO books (title, author_id) VALUES ('Book A', $1) RETURNING *", [authorId]);
    const book2 = await pg.query("INSERT INTO books (title, author_id) VALUES ('Book B', $1) RETURNING *", [authorId]);
    const book3 = await pg.query("INSERT INTO books (title, author_id) VALUES ('Book C', $1) RETURNING *", [authorId]);
    const book4 = await pg.query("INSERT INTO books (title, author_id) VALUES ('Book D', $1) RETURNING *", [authorId]);

    // Create tags (3 per book)
    for (const bookResult of [book1, book2, book3, book4]) {
      const tag1 = await pg.query("INSERT INTO tags (name) VALUES ($1) RETURNING *", [`Z-Tag-${bookResult.rows[0]!.title}`]);
      const tag2 = await pg.query("INSERT INTO tags (name) VALUES ($1) RETURNING *", [`A-Tag-${bookResult.rows[0]!.title}`]);
      const tag3 = await pg.query("INSERT INTO tags (name) VALUES ($1) RETURNING *", [`M-Tag-${bookResult.rows[0]!.title}`]);

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
    const server = serve({ fetch: app.fetch, port: 3469 });

    const sdk = new SDK({ baseUrl: "http://localhost:3469" });

    const result = await sdk.authors.list({
      include: {
        books: {
          limit: 2,
          orderBy: 'title',
          order: 'asc',
          include: {
            tags: {
              orderBy: 'name',
              order: 'asc',
              limit: 2
            }
          }
        }
      }
    });

    expect(result.data).toHaveLength(1);
    const author8 = result.data[0] as AuthorWithBooksAndTags;
    expect(author8.books).toHaveLength(2); // Only 2 books
    expect(author8.books[0]!.title).toBe('Book A'); // First alphabetically
    expect(author8.books[1]!.title).toBe('Book B'); // Second alphabetically

    // Each book should have max 2 tags, ordered alphabetically
    expect(author8.books[0]!.tags).toHaveLength(2);
    expect(author8.books[0]!.tags[0]!.name).toBe('A-Tag-Book A');
    expect(author8.books[0]!.tags[1]!.name).toBe('M-Tag-Book A');

    expect(author8.books[1]!.tags).toHaveLength(2);
    expect(author8.books[1]!.tags[0]!.name).toBe('A-Tag-Book B');
    expect(author8.books[1]!.tags[1]!.name).toBe('M-Tag-Book B');

    server.close();
  } finally {
    await pg.end();
  }
});
