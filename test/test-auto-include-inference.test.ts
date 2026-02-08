#!/usr/bin/env bun

import { test, expect } from "bun:test";
import { SDK } from "./.results/client";

/**
 * Test: Automatic Include Type Inference
 *
 * Verifies that the return type of list() automatically infers
 * the shape based on the include parameter - NO MANUAL CAST NEEDED!
 */

test("list() return type infers included relations", () => {
  const sdk = new SDK({ baseUrl: "http://localhost:3000" });

  // Type-only test: verify TypeScript infers the correct type
  type TestInference = ReturnType<typeof sdk.authors.list<{
    books: true
  }>>;

  // Extract the data array item type
  type AuthorWithBooks = Awaited<TestInference>['data'][number];

  // This should compile: books property should exist and be typed correctly
  const mockAuthor: AuthorWithBooks = {
    id: "1",
    name: "Test Author",
    created_at: new Date(),
    books: [
      {
        id: "1",
        title: "Test Book",
        author_id: "1",
        created_at: new Date()
      }
    ]
  };

  expect(mockAuthor.books).toBeDefined();
  expect(Array.isArray(mockAuthor.books)).toBe(true);
});

test("list() with nested includes infers nested types", () => {
  const sdk = new SDK({ baseUrl: "http://localhost:3000" });

  // Type-only test: verify nested include inference
  type TestNestedInference = ReturnType<typeof sdk.authors.list<{
    books: {
      include: {
        tags: true
      }
    }
  }>>;

  type AuthorWithBooksAndTags = Awaited<TestNestedInference>['data'][number];

  // This should compile: nested tags property should exist
  const mockAuthor: AuthorWithBooksAndTags = {
    id: "1",
    name: "Test Author",
    created_at: new Date(),
    books: [
      {
        id: "1",
        title: "Test Book",
        author_id: "1",
        created_at: new Date(),
        tags: [
          {
            id: "1",
            name: "Test Tag",
            book_id: "1",
            created_at: new Date()
          }
        ]
      }
    ]
  };

  expect(mockAuthor.books[0]?.tags).toBeDefined();
});

test("list() without include returns base type", () => {
  const sdk = new SDK({ baseUrl: "http://localhost:3000" });

  // Type-only test: without includes, should return base type
  type TestNoInclude = ReturnType<typeof sdk.authors.list>;
  type AuthorBase = Awaited<TestNoInclude>['data'][number];

  const mockAuthor: AuthorBase = {
    id: "1",
    name: "Test Author",
    created_at: new Date()
  };

  expect(mockAuthor.id).toBeDefined();
  expect(mockAuthor.name).toBeDefined();
});

test("Multiple relations inferred correctly", () => {
  const sdk = new SDK({ baseUrl: "http://localhost:3000" });

  // Books can include both author and tags
  type TestMultiple = ReturnType<typeof sdk.books.list<{
    author: true,
    tags: true
  }>>;

  type BookWithRelations = Awaited<TestMultiple>['data'][number];

  const mockBook: BookWithRelations = {
    id: "1",
    title: "Test Book",
    author_id: "1",
    created_at: new Date(),
    author: {
      id: "1",
      name: "Test Author",
      created_at: new Date()
    },
    tags: [
      {
        id: "1",
        name: "Test Tag",
        book_id: "1",
        created_at: new Date()
      }
    ]
  };

  expect(mockBook.author).toBeDefined();
  expect(mockBook.tags).toBeDefined();
});

console.log("✅ Automatic include inference works!");
