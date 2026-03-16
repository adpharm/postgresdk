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
  it("bakes SOFT_DELETE_COLS constant with correct per-table values into emitted code", () => {
    const output = emitIncludeLoader(model, 2, { softDeleteCols });
    expect(output).toContain('"authors": "deleted_at"');
    expect(output).toContain('"books": null');
    expect(output).toContain('"book_tags": null');
    expect(output).toContain('"tags": "deleted_at"');
  });

  it("emits softDeleteFilter helper that returns IS NULL clause with optional alias", () => {
    const output = emitIncludeLoader(model, 2, { softDeleteCols });
    const helper = extractFn(output, "softDeleteFilter", "buildOrAndPredicate");
    expect(helper).toContain("IS NULL");
    expect(helper).toContain("alias");
  });

  it("applies softDeleteFilter(target) in loadBelongsTo SQL", () => {
    const output = emitIncludeLoader(model, 2, { softDeleteCols });
    const fn = extractFn(output, "loadBelongsTo", "loadHasOne");
    expect(fn).toContain("softDeleteFilter(target)");
  });

  it("applies softDeleteFilter(target) in loadHasOne SQL", () => {
    const output = emitIncludeLoader(model, 2, { softDeleteCols });
    const fn = extractFn(output, "loadHasOne", "loadOneToMany");
    expect(fn).toContain("softDeleteFilter(target)");
  });

  it("applies softDeleteFilter(target) in loadOneToMany SQL — both simple and window-function paths", () => {
    const output = emitIncludeLoader(model, 2, { softDeleteCols });
    const fn = extractFn(output, "loadOneToMany", "loadManyToMany");
    const occurrences = fn.split("softDeleteFilter(target)").length - 1;
    expect(occurrences).toBe(2); // simple path + window-function inner WHERE
  });

  it("applies softDeleteFilter(target, 't') in loadManyToMany JOIN path", () => {
    const output = emitIncludeLoader(model, 2, { softDeleteCols });
    const fn = extractFn(output, "loadManyToMany");
    expect(fn).toContain('softDeleteFilter(target, "t")');
  });

  it("applies softDeleteFilter(target) (no alias) in loadManyToMany simple path", () => {
    const output = emitIncludeLoader(model, 2, { softDeleteCols });
    const fn = extractFn(output, "loadManyToMany");
    // Simple path uses no alias; JOIN path uses "t" alias — both must be present
    expect(fn).toContain("softDeleteFilter(target)");
    expect(fn).toContain('softDeleteFilter(target, "t")');
  });

  it("emits empty SOFT_DELETE_COLS and inert helper when no softDeleteCols provided", () => {
    const output = emitIncludeLoader(model, 2, {});
    expect(output).toContain("SOFT_DELETE_COLS: Record<string, string | null> = {}");
    // helper still emitted; callers get "" at runtime — no SQL change
    const helper = extractFn(output, "softDeleteFilter", "buildOrAndPredicate");
    expect(helper).toContain("if (!col) return");
  });
});
