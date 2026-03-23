#!/usr/bin/env bun

import { describe, test, expect } from "bun:test";
import { buildGraph } from "../src/rel-classify";
import { emitIncludeResolver } from "../src/emit-include-resolver";
import { generateIncludeMethods } from "../src/emit-include-methods";
import type { Model } from "../src/introspect";

/**
 * Verify that nullable FK columns produce `| null` in generated types
 * for belongs-to (kind: "one") relations, and that non-nullable FKs don't.
 *
 * Regression test for: runtime null crash when FK is nullable but generated
 * types declare the relation as non-null.
 */

/** Minimal model: books -> authors (nullable FK), book_tags -> books (non-null FK) */
const model: Model = {
  schema: "public",
  enums: {},
  tables: {
    authors: {
      name: "authors",
      columns: [{ name: "id", pgType: "uuid", nullable: false, hasDefault: true }],
      pk: ["id"],
      uniques: [],
      fks: [],
    },
    books: {
      name: "books",
      columns: [
        { name: "id", pgType: "uuid", nullable: false, hasDefault: true },
        { name: "author_id", pgType: "uuid", nullable: true, hasDefault: false },
        { name: "title", pgType: "text", nullable: false, hasDefault: false },
      ],
      pk: ["id"],
      uniques: [],
      fks: [
        { from: ["author_id"], toTable: "authors", to: ["id"], onDelete: "cascade", onUpdate: "no action" },
      ],
    },
    book_tags: {
      name: "book_tags",
      columns: [
        { name: "book_id", pgType: "uuid", nullable: false, hasDefault: false },
        { name: "tag_id", pgType: "uuid", nullable: false, hasDefault: false },
      ],
      pk: ["book_id", "tag_id"],
      uniques: [],
      fks: [
        { from: ["book_id"], toTable: "books", to: ["id"], onDelete: "cascade", onUpdate: "no action" },
        { from: ["tag_id"], toTable: "tags", to: ["id"], onDelete: "cascade", onUpdate: "no action" },
      ],
    },
    tags: {
      name: "tags",
      columns: [{ name: "id", pgType: "uuid", nullable: false, hasDefault: true }],
      pk: ["id"],
      uniques: [],
      fks: [],
    },
  },
};

describe("nullable belongs-to", () => {
  const graph = buildGraph(model);

  describe("buildGraph", () => {
    test("marks edge as nullable when FK column is nullable", () => {
      // books.author_id is nullable → books->author edge should be nullable
      expect(graph.books?.author).toBeDefined();
      expect(graph.books!.author!.nullable).toBe(true);
    });

    test("does not mark edge nullable when FK column is NOT NULL", () => {
      // book_tags.book_id is NOT NULL → book_tags->book edge should not be nullable
      expect(graph.book_tags?.book).toBeDefined();
      expect(graph.book_tags!.book!.nullable).toBeUndefined();
    });

    test("never marks 1:N (many) edges as nullable", () => {
      expect(graph.authors?.books).toBeDefined();
      expect(graph.authors!.books!.kind).toBe("many");
      expect(graph.authors!.books!.nullable).toBeUndefined();
    });
  });

  describe("emitIncludeResolver", () => {
    const output = emitIncludeResolver(graph);

    test("emits | null for nullable belongs-to in resolver type", () => {
      // BooksWithIncludes should have `SelectAuthors | null` for the author relation
      expect(output).toContain("SelectAuthors | null");
    });

    test("does not emit | null for non-nullable belongs-to", () => {
      // BookTagsWithIncludes should have `SelectBooks` (no | null) for the book relation
      // Match the exact pattern to avoid false positives from the books->author nullable relation
      expect(output).toMatch(/K extends 'book' \?[\s\S]*?:\s*SelectBooks\n/);
    });
  });

  describe("generateIncludeMethods", () => {
    const allTables = Object.values(model.tables);

    test("includes | null in baseType for nullable belongs-to", () => {
      const methods = generateIncludeMethods(model.tables.books!, graph, {
        maxDepth: 2,
        skipJunctionTables: true,
      }, allTables);

      const listWithAuthor = methods.find(m => m.name === "listWithAuthor");
      expect(listWithAuthor).toBeDefined();
      expect(listWithAuthor!.baseType).toContain("author: SelectAuthors | null");
    });

    test("does not include | null for non-nullable belongs-to", () => {
      const methods = generateIncludeMethods(model.tables.book_tags!, graph, {
        maxDepth: 2,
        skipJunctionTables: false,
      }, allTables);

      const listWithBook = methods.find(m => m.name === "listWithBook");
      expect(listWithBook).toBeDefined();
      // Should be `book: SelectBooks` without `| null`
      expect(listWithBook!.baseType).toContain("book: SelectBooks");
      expect(listWithBook!.baseType).not.toContain("book: SelectBooks | null");
    });
  });
});
