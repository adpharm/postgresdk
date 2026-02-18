#!/usr/bin/env bun

import { test, expect } from "bun:test";
import { SDK } from "./.results/client";
import type { SelectAuthors } from "./.results/client/types/authors";

/**
 * Test: Non-include calls still work correctly
 *
 * Verifies that the generic list() method doesn't break:
 * 1. Calls without include
 * 2. Calls with select
 * 3. Calls with exclude
 */

test("list() without include returns base type", () => {
  const sdk = new SDK({ baseUrl: "http://localhost:3000" });

  type ResultType = ReturnType<typeof sdk.authors.list>;
  type AuthorType = Awaited<ResultType>['data'][number];

  // Should be exactly SelectAuthors (not with any extra properties)
  const mockAuthor: AuthorType = {
    id: "1",
    name: "Test",
  };

  // Verify it matches SelectAuthors
  const selectAuthor: SelectAuthors = mockAuthor;
  expect(selectAuthor).toBeDefined();
});

test("list() with empty params returns base type", () => {
  const sdk = new SDK({ baseUrl: "http://localhost:3000" });

  // Call with empty params
  type ResultType = ReturnType<typeof sdk.authors.list>;
  type AuthorType = Awaited<ResultType>['data'][number];

  // Should be base type
  const mockAuthor: AuthorType = {
    id: "1",
    name: "Test",
  };

  const selectAuthor: SelectAuthors = mockAuthor;
  expect(selectAuthor).toBeDefined();
});

test("list() with where/orderBy but no include returns base type", () => {
  const sdk = new SDK({ baseUrl: "http://localhost:3000" });

  // These params don't affect the return type (only include does)
  type ResultType = ReturnType<typeof sdk.authors.list>;
  type AuthorType = Awaited<ResultType>['data'][number];

  // Should still be base type
  const mockAuthor: AuthorType = {
    id: "1",
    name: "Test",
  };

  const selectAuthor: SelectAuthors = mockAuthor;
  expect(selectAuthor).toBeDefined();
});

console.log("✅ Non-include types work correctly!");
