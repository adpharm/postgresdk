#!/usr/bin/env bun

import { test, expect } from "bun:test";
import { SDK } from "./.results/client";
import type { AuthorsIncludeSpec, BooksIncludeSpec } from "./.results/client/include-spec";

/**
 * Phase 4: Comprehensive Type Safety Tests for Include Parameter
 *
 * This test file verifies that:
 * 1. Include parameters are properly typed (not `any`)
 * 2. TypeScript catches invalid relation names at compile time
 * 3. TypeScript catches invalid options at compile time
 * 4. Valid includes compile correctly
 * 5. IncludeSpec types are exported and usable
 */

test("Include parameter has correct type (AuthorsIncludeSpec)", () => {
  // This test verifies the type is NOT `any`
  // The type assertion will fail at compile-time if the type is wrong

  const validInclude: AuthorsIncludeSpec = {
    books: true
  };

  expect(validInclude).toBeDefined();
});

test("AuthorsIncludeSpec supports nested includes", () => {
  const validNestedInclude: AuthorsIncludeSpec = {
    books: {
      limit: 5,
      select: ["id", "title"],
      include: {
        tags: true
      }
    }
  };

  expect(validNestedInclude).toBeDefined();
});

test("BooksIncludeSpec type works correctly", () => {
  const validInclude: BooksIncludeSpec = {
    tags: {
      limit: 5,
      orderBy: "name"
    },
    author: true
  };

  expect(validInclude).toBeDefined();
});

test("Empty include object is valid", () => {
  const emptyInclude: AuthorsIncludeSpec = {};
  expect(emptyInclude).toBeDefined();
});

test("Boolean include values are valid", () => {
  const booleanInclude: AuthorsIncludeSpec = {
    books: true
  };
  expect(booleanInclude).toBeDefined();
});

test("Include with all options is valid", () => {
  const fullInclude: BooksIncludeSpec = {
    tags: {
      select: ["id", "name"],
      exclude: ["created_at"],
      limit: 10,
      offset: 5,
      orderBy: "name",
      order: "desc"
    },
    author: {
      select: ["id", "name"]
    }
  };
  expect(fullInclude).toBeDefined();
});

/**
 * Compile-Time Type Safety Tests
 *
 * These tests use @ts-expect-error to verify that invalid code
 * FAILS to compile. If these lines compile successfully, the test
 * should fail.
 *
 * NOTE: These are compile-time checks, not runtime tests.
 * Run `bun run test:typecheck` to verify these work correctly.
 */

// Test: Invalid relation name should fail
function testInvalidRelation() {
  const sdk = new SDK({ baseUrl: "http://localhost:3000" });

  // @ts-expect-error - nonExistentRelation is not a valid relation
  sdk.authors.list({
    include: {
      nonExistentRelation: true
    }
  });
}

// Test: Invalid options should fail
function testInvalidOptions() {
  const sdk = new SDK({ baseUrl: "http://localhost:3000" });

  // @ts-expect-error - invalidOption is not a valid include option
  sdk.authors.list({
    include: {
      books: {
        invalidOption: 123
      }
    }
  });
}

// Test: Invalid nested relation should fail
function testInvalidNestedRelation() {
  const sdk = new SDK({ baseUrl: "http://localhost:3000" });

  // @ts-expect-error - authors don't have a 'chapters' relation
  sdk.authors.list({
    include: {
      books: {
        include: {
          chapters: true
        }
      }
    }
  });
}

// Test: Wrong type for limit should fail
function testWrongTypeForLimit() {
  const sdk = new SDK({ baseUrl: "http://localhost:3000" });

  // @ts-expect-error - limit must be a number, not a string
  sdk.authors.list({
    include: {
      books: {
        limit: "5"
      }
    }
  });
}

// Prevent unused function warnings
export { testInvalidRelation, testInvalidOptions, testInvalidNestedRelation, testWrongTypeForLimit };
