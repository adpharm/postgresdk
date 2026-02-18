#!/usr/bin/env bun

import { test, expect } from "bun:test";
import type { AuthorsIncludeSpec, BooksIncludeSpec } from "./.results/client/include-spec";

/**
 * Test: Nested include parameters use correct IncludeSpec types
 *
 * Previously: capturesInclude had `include?: WebsitesIncludeSpec` (WRONG - parent table)
 * Now: capturesInclude has `include?: CapturesIncludeSpec` (CORRECT - target table)
 *
 * This test verifies that when you configure nested includes for a relation,
 * the type system uses the TARGET table's IncludeSpec, not the parent's.
 */

test("Nested include uses target table's IncludeSpec", () => {
  // For authors.listWithBooksAndTags, the booksInclude parameter
  // should allow you to specify what to include FROM books

  // ✅ This should compile: books can include tags
  const validBooksInclude: BooksIncludeSpec = {
    tags: true,
    author: true  // Books can also include their author
  };

  expect(validBooksInclude).toBeDefined();
});

test("Nested include allows deep nesting", () => {
  // When including books from authors, you should be able to
  // specify includes FROM books (like tags)

  const nestedInclude: BooksIncludeSpec = {
    tags: {
      limit: 5,
      orderBy: "name"
    },
    author: true
  };

  expect(nestedInclude).toBeDefined();
});

test("Parent table IncludeSpec is different from child", () => {
  // Authors and Books have different relations, so their
  // IncludeSpec types should be different

  const authorInclude: AuthorsIncludeSpec = {
    books: true  // Authors can include books
  };

  const bookInclude: BooksIncludeSpec = {
    tags: true,  // Books can include tags
    author: true  // Books can include author
  };

  // These should be different types
  expect(authorInclude).toBeDefined();
  expect(bookInclude).toBeDefined();
});

// Compile-time verification that wrong types fail
function testWrongNestedInclude() {
  const invalid: AuthorsIncludeSpec = {
    // @ts-expect-error - Authors don't have a 'tags' relation (only books do)
    tags: true
  };

  return invalid;
}

export { testWrongNestedInclude };

console.log("✅ Nested include types are correct!");
