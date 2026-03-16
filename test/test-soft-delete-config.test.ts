import { describe, it, expect } from "bun:test";
import { resolveSoftDeleteColumn } from "../src/index";
import { emitCoreOperations } from "../src/emit-core-operations";

describe("resolveSoftDeleteColumn", () => {
  it("returns global column when no overrides defined", () => {
    expect(resolveSoftDeleteColumn({ softDeleteColumn: "deleted_at" }, "users")).toBe("deleted_at");
  });

  it("returns null when global is null and no overrides", () => {
    expect(resolveSoftDeleteColumn({ softDeleteColumn: null }, "users")).toBeNull();
  });

  it("returns null when config is empty", () => {
    expect(resolveSoftDeleteColumn({}, "users")).toBeNull();
  });

  it("returns per-table override column, ignoring global", () => {
    expect(
      resolveSoftDeleteColumn(
        { softDeleteColumn: "deleted_at", softDeleteColumnOverrides: { captures: "hidden_at" } },
        "captures"
      )
    ).toBe("hidden_at");
  });

  it("falls back to global for tables not present in overrides", () => {
    expect(
      resolveSoftDeleteColumn(
        { softDeleteColumn: "deleted_at", softDeleteColumnOverrides: { captures: "hidden_at" } },
        "users"
      )
    ).toBe("deleted_at");
  });

  it("null override disables soft delete for a specific table even when global column is set", () => {
    expect(
      resolveSoftDeleteColumn(
        { softDeleteColumn: "deleted_at", softDeleteColumnOverrides: { audit_logs: null } },
        "audit_logs"
      )
    ).toBeNull();
  });

  it("null override on one table does not affect other tables", () => {
    const cfg = { softDeleteColumn: "deleted_at", softDeleteColumnOverrides: { audit_logs: null } };
    expect(resolveSoftDeleteColumn(cfg, "users")).toBe("deleted_at");
  });
});

describe("emitCoreOperations — getByPk soft delete filter", () => {
  /** Slice the named async function body out of the emitted string. */
  function extractFn(output: string, name: string, nextExport: string): string {
    const start = output.indexOf(`async function ${name}(`);
    const end = output.indexOf(`\nexport async function ${nextExport}(`, start);
    return output.slice(start, end);
  }

  it("getByPk skips IS NULL when includeSoftDeleted is set", () => {
    const output = emitCoreOperations();
    const body = extractFn(output, "getByPk", "listRecords");
    expect(body).toContain('ctx.softDeleteColumn && !opts?.includeSoftDeleted');
    expect(body).toContain('${softDeleteFilter}');
  });

  it("listRecords skips IS NULL when includeSoftDeleted is set", () => {
    const output = emitCoreOperations();
    const body = extractFn(output, "listRecords", "updateRecord");
    expect(body).toContain('ctx.softDeleteColumn && !includeSoftDeleted');
  });
});
