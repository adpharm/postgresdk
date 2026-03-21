import { describe, it, expect } from "bun:test";
import { resolveSoftDeleteColumn, resolveExposeHardDelete } from "../src/index";
import { emitCoreOperations } from "../src/emit-core-operations";
import { emitHonoRoutes } from "../src/emit-routes-hono";
import { emitClient } from "../src/emit-client";
import type { Table } from "../src/introspect";

describe("resolveSoftDeleteColumn", () => {
  it("returns global column when no overrides defined", () => {
    expect(resolveSoftDeleteColumn({ delete: { softDeleteColumn: "deleted_at" } }, "users")).toBe("deleted_at");
  });

  it("returns null when no delete config", () => {
    expect(resolveSoftDeleteColumn({}, "users")).toBeNull();
  });

  it("returns null when config is empty object", () => {
    expect(resolveSoftDeleteColumn({ delete: {} }, "users")).toBeNull();
  });

  it("returns per-table override column, ignoring global", () => {
    expect(
      resolveSoftDeleteColumn(
        { delete: { softDeleteColumn: "deleted_at", softDeleteColumnOverrides: { captures: "hidden_at" } } },
        "captures"
      )
    ).toBe("hidden_at");
  });

  it("falls back to global for tables not present in overrides", () => {
    expect(
      resolveSoftDeleteColumn(
        { delete: { softDeleteColumn: "deleted_at", softDeleteColumnOverrides: { captures: "hidden_at" } } },
        "users"
      )
    ).toBe("deleted_at");
  });

  it("null override disables soft delete for a specific table even when global column is set", () => {
    expect(
      resolveSoftDeleteColumn(
        { delete: { softDeleteColumn: "deleted_at", softDeleteColumnOverrides: { audit_logs: null } } },
        "audit_logs"
      )
    ).toBeNull();
  });

  it("null override on one table does not affect other tables", () => {
    const cfg = { delete: { softDeleteColumn: "deleted_at", softDeleteColumnOverrides: { audit_logs: null } } };
    expect(resolveSoftDeleteColumn(cfg, "users")).toBe("deleted_at");
  });
});

describe("resolveExposeHardDelete", () => {
  it("defaults to true when no delete config", () => {
    expect(resolveExposeHardDelete({})).toBe(true);
  });

  it("defaults to true when exposeHardDelete not set", () => {
    expect(resolveExposeHardDelete({ delete: { softDeleteColumn: "deleted_at" } })).toBe(true);
  });

  it("returns false when explicitly set to false", () => {
    expect(resolveExposeHardDelete({ delete: { exposeHardDelete: false } })).toBe(false);
  });

  it("returns true when explicitly set to true", () => {
    expect(resolveExposeHardDelete({ delete: { exposeHardDelete: true } })).toBe(true);
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

describe("emitCoreOperations — deleteRecord hard param", () => {
  it("deleteRecord template accepts opts.hard parameter", () => {
    const output = emitCoreOperations();
    expect(output).toContain('opts?.hard');
  });

  it("uses soft delete UPDATE when softDeleteColumn set and hard not set", () => {
    const output = emitCoreOperations();
    expect(output).toContain('ctx.softDeleteColumn && !opts?.hard');
  });
});

// Minimal table fixture used by emitHonoRoutes and emitClient tests
const mockTable: Table = {
  name: "posts",
  columns: [
    { name: "id", pgType: "uuid", nullable: false, hasDefault: true },
    { name: "title", pgType: "text", nullable: false, hasDefault: false },
    { name: "deleted_at", pgType: "timestamptz", nullable: true, hasDefault: false },
  ],
  pk: ["id"],
  uniques: [],
  fks: [],
};

const mockGraph = { nodes: {}, edges: [] } as any;

const baseOpts = {
  includeMethodsDepth: 2,
  authStrategy: "none" as const,
  apiPathPrefix: "/v1",
};

describe("emitHonoRoutes — delete route hard param", () => {
  it("includes hard query param parsing when exposeHardDelete true and softDel set", () => {
    const output = emitHonoRoutes(mockTable, mockGraph, {
      softDeleteColumn: "deleted_at",
      exposeHardDelete: true,
      ...baseOpts,
    });
    expect(output).toContain('hard: z.boolean().optional()');
    expect(output).toContain('queryData.hard');
  });

  it("omits hard query param when exposeHardDelete false", () => {
    const output = emitHonoRoutes(mockTable, mockGraph, {
      softDeleteColumn: "deleted_at",
      exposeHardDelete: false,
      ...baseOpts,
    });
    expect(output).not.toContain('hard: z.boolean().optional()');
    expect(output).not.toContain('queryData.hard');
  });

  it("omits hard query param when no softDeleteColumn", () => {
    const output = emitHonoRoutes(mockTable, mockGraph, {
      softDeleteColumn: null,
      exposeHardDelete: true,
      ...baseOpts,
    });
    expect(output).not.toContain('hard: z.boolean().optional()');
    expect(output).not.toContain('queryData.hard');
  });
});

describe("emitClient — delete method naming", () => {
  const clientBase = { includeMethodsDepth: 2, skipJunctionTables: true };

  it("emits only hardDelete when no softDeleteColumn", () => {
    const output = emitClient(mockTable, mockGraph, {
      softDeleteColumn: null,
      exposeHardDelete: true,
      ...clientBase,
    });
    expect(output).toContain('async hardDelete(');
    expect(output).not.toContain('async softDelete(');
    expect(output).not.toContain('async delete(');
  });

  it("emits softDelete and hardDelete when softDeleteColumn set and exposeHardDelete true", () => {
    const output = emitClient(mockTable, mockGraph, {
      softDeleteColumn: "deleted_at",
      exposeHardDelete: true,
      ...clientBase,
    });
    expect(output).toContain('async softDelete(');
    expect(output).toContain('async hardDelete(');
    expect(output).not.toContain('async delete(');
  });

  it("emits only softDelete when exposeHardDelete false", () => {
    const output = emitClient(mockTable, mockGraph, {
      softDeleteColumn: "deleted_at",
      exposeHardDelete: false,
      ...clientBase,
    });
    expect(output).toContain('async softDelete(');
    expect(output).not.toContain('async hardDelete(');
    expect(output).not.toContain('async delete(');
  });

  it("hardDelete appends ?hard=true when softDeleteColumn is set", () => {
    const output = emitClient(mockTable, mockGraph, {
      softDeleteColumn: "deleted_at",
      exposeHardDelete: true,
      ...clientBase,
    });
    expect(output).toContain("queryParams.set('hard', 'true')");
  });

  it("hardDelete does not append hard=true when no softDeleteColumn", () => {
    const output = emitClient(mockTable, mockGraph, {
      softDeleteColumn: null,
      exposeHardDelete: true,
      ...clientBase,
    });
    // hardDelete is present but without hard=true
    expect(output).toContain('async hardDelete(');
    expect(output).not.toContain("queryParams.set('hard', 'true')");
  });
});

describe("emitClient — transaction $softDelete/$hardDelete methods", () => {
  const clientBase = { includeMethodsDepth: 2, skipJunctionTables: true };

  it("emits only $hardDelete when no softDeleteColumn", () => {
    const output = emitClient(mockTable, mockGraph, {
      softDeleteColumn: null,
      exposeHardDelete: true,
      ...clientBase,
    });
    expect(output).toContain('$hardDelete(');
    expect(output).not.toContain('$softDelete(');
    expect(output).not.toContain('$delete(');
  });

  it("emits $softDelete and $hardDelete when softDeleteColumn set and exposeHardDelete true", () => {
    const output = emitClient(mockTable, mockGraph, {
      softDeleteColumn: "deleted_at",
      exposeHardDelete: true,
      ...clientBase,
    });
    expect(output).toContain('$softDelete(');
    expect(output).toContain('$hardDelete(');
    expect(output).not.toContain('$delete(');
    // Verify correct _op values are emitted
    expect(output).toContain('_op: "softDelete"');
    expect(output).toContain('_op: "hardDelete"');
  });

  it("emits only $softDelete when exposeHardDelete false", () => {
    const output = emitClient(mockTable, mockGraph, {
      softDeleteColumn: "deleted_at",
      exposeHardDelete: false,
      ...clientBase,
    });
    expect(output).toContain('$softDelete(');
    expect(output).not.toContain('$hardDelete(');
    expect(output).not.toContain('$delete(');
  });
});
