import { describe, it, expect } from "bun:test";
import { emitIncludeLoader } from "../src/emit-include-loader";
import type { Model } from "../src/introspect";

/** Minimal model: authors (soft-deletable) 1:N books (no soft delete) M:N tags (soft-deletable) via book_tags (no soft delete) */
const model: Model = {
  schema: "public",
  enums: {},
  tables: {
    authors: {
      name: "authors",
      pk: ["id"],
      uniques: [],
      columns: [
        { name: "id", pgType: "int4", nullable: false, hasDefault: true },
        { name: "deleted_at", pgType: "timestamptz", nullable: true, hasDefault: false },
      ],
      fks: [],
    },
    books: {
      name: "books",
      pk: ["id"],
      uniques: [],
      columns: [
        { name: "id", pgType: "int4", nullable: false, hasDefault: true },
        { name: "author_id", pgType: "int4", nullable: false, hasDefault: false },
      ],
      fks: [{ from: ["author_id"], toTable: "authors", to: ["id"], onDelete: "no action", onUpdate: "no action" }],
    },
    book_tags: {
      name: "book_tags",
      pk: ["book_id", "tag_id"],
      uniques: [],
      columns: [
        { name: "book_id", pgType: "int4", nullable: false, hasDefault: false },
        { name: "tag_id", pgType: "int4", nullable: false, hasDefault: false },
      ],
      fks: [
        { from: ["book_id"], toTable: "books", to: ["id"], onDelete: "no action", onUpdate: "no action" },
        { from: ["tag_id"], toTable: "tags", to: ["id"], onDelete: "no action", onUpdate: "no action" },
      ],
    },
    tags: {
      name: "tags",
      pk: ["id"],
      uniques: [],
      columns: [
        { name: "id", pgType: "int4", nullable: false, hasDefault: true },
        { name: "deleted_at", pgType: "timestamptz", nullable: true, hasDefault: false },
      ],
      fks: [],
    },
  },
};

const softDeleteCols: Record<string, string | null> = {
  authors: "deleted_at",
  books: null,
  book_tags: null,
  tags: "deleted_at",
};

/** Slice a named function's body out of the emitted string (handles both sync and async). */
function extractFn(output: string, fnName: string, nextFnName?: string): string {
  const start = output.search(new RegExp(`(?:async )?function ${fnName}\\(`));
  if (start === -1) throw new Error(`Function ${fnName} not found in output`);
  const end = nextFnName
    ? output.search(new RegExp(`(?:async )?function ${nextFnName}\\(`))
    : output.length;
  return output.slice(start, end === -1 ? output.length : end);
}

describe("emitIncludeLoader — soft delete in nested includes", () => {
  // Generate once; all tests in this describe share the same output.
  const output = emitIncludeLoader(model, 2, { softDeleteCols });

  it("bakes SOFT_DELETE_COLS constant with correct per-table values into emitted code", () => {
    expect(output).toContain('"authors": "deleted_at"');
    expect(output).toContain('"books": null');
    expect(output).toContain('"book_tags": null');
    expect(output).toContain('"tags": "deleted_at"');
  });

  it("emits softDeleteFilter helper that returns IS NULL clause with optional alias", () => {
    const helper = extractFn(output, "softDeleteFilter", "buildOrAndPredicate");
    expect(helper).toContain("IS NULL");
    expect(helper).toContain("alias");
  });

  it("applies conditional softDeleteFilter(target) in loadBelongsTo SQL — skipped when includeSoftDeleted, OR predicate wrapped in parens", () => {
    const fn = extractFn(output, "loadBelongsTo", "loadHasOne");
    expect(fn).toContain('(${where})${includeSoftDeleted ? "" : softDeleteFilter(target)}');
  });

  it("applies conditional softDeleteFilter(target) in loadHasOne SQL — skipped when includeSoftDeleted, OR predicate wrapped in parens", () => {
    const fn = extractFn(output, "loadHasOne", "loadOneToMany");
    expect(fn).toContain('(${where})${includeSoftDeleted ? "" : softDeleteFilter(target)}');
  });

  it("applies conditional softDeleteFilter(target) in loadOneToMany SQL — both simple and window-function paths, OR predicate wrapped in parens", () => {
    const fn = extractFn(output, "loadOneToMany", "loadManyToMany");
    const occurrences = fn.split('(${where})${includeSoftDeleted ? "" : softDeleteFilter(target)}').length - 1;
    expect(occurrences).toBe(2); // simple path + window-function inner WHERE
  });

  it("applies conditional softDeleteFilter in loadManyToMany — JOIN path uses aliased 't', simple path does not; both OR predicates wrapped in parens", () => {
    const fn = extractFn(output, "loadManyToMany");
    expect(fn).toContain('(${whereVia})${includeSoftDeleted ? "" : softDeleteFilter(target, "t")}'); // JOIN path
    expect(fn).toContain('(${whereT})${includeSoftDeleted ? "" : softDeleteFilter(target)}');        // simple path
  });

  it("loadIncludes signature includes includeSoftDeleted parameter defaulting to false", () => {
    expect(output).toContain("includeSoftDeleted: boolean = false");
  });

  it("emits empty SOFT_DELETE_COLS and inert helper when no softDeleteCols provided", () => {
    const noSdOutput = emitIncludeLoader(model, 2, {});
    expect(noSdOutput).toContain("SOFT_DELETE_COLS: Record<string, string | null> = {}");
    // helper still emitted; callers get "" at runtime — no SQL change
    const helper = extractFn(noSdOutput, "softDeleteFilter", "buildOrAndPredicate");
    expect(helper).toContain("if (!col) return");
  });
});
