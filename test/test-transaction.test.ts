#!/usr/bin/env bun

/**
 * Unit tests for executeTransaction in core/operations.
 *
 * Tests atomicity guarantees (BEGIN/COMMIT/ROLLBACK), Pool vs Client detection,
 * the onBegin callback, and error/rollback paths.
 *
 * No Docker or real Postgres needed — the pg client is mocked.
 */

import { test, expect, beforeAll } from "bun:test";
import { mkdirSync, writeFileSync } from "fs";
import { emitCoreOperations } from "../src/emit-core-operations";

const OUTPUT_DIR = `${process.cwd()}/test/.transaction-test`;

let executeTransaction: (
  pg: any,
  ops: any[],
  metadata: Record<string, any>,
  onBegin?: (txClient: any) => Promise<void>
) => Promise<{ ok: true; results: Array<{ data: unknown }> } | { ok: false; error: string; failedAt: number }>;

beforeAll(async () => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(`${OUTPUT_DIR}/operations.ts`, emitCoreOperations());
  const mod = await import(`${OUTPUT_DIR}/operations.ts`);
  executeTransaction = mod.executeTransaction;
});

/** Creates a mock pg Client (no connect/release — simulates pg.Client).
 *  Each call consumes one entry from rowsByCall; pass Error to make that call throw. */
function makeClientMock(rowsByCall: Array<any[] | Error> = []) {
  const queries: { text: string; params?: any[] }[] = [];
  let callIndex = 0;
  const pg = {
    query: async (text: string, params?: any[]) => {
      queries.push({ text, params });
      const result = rowsByCall[callIndex++] ?? [{ id: "1", name: "test" }];
      if (result instanceof Error) throw result;
      return { rows: result };
    },
  };
  return { pg, queries };
}

/** Shared metadata for a single "users" table */
const usersMetadata = {
  users: {
    table: "users",
    pkColumns: ["id"],
    softDeleteColumn: null,
    allColumnNames: ["id", "name"],
    vectorColumns: [],
    jsonbColumns: [],
    includeMethodsDepth: 0,
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Test 1: Success path with Client (no connect/release)
// ──────────────────────────────────────────────────────────────────────────────
test("executeTransaction: BEGIN first, COMMIT last, returns results", async () => {
  // rowsByCall: BEGIN (no rows), INSERT returns row, COMMIT (no rows)
  const { pg, queries } = makeClientMock([[], [{ id: "1", name: "alice" }], []]);

  const result = await executeTransaction(
    pg,
    [{ op: "create", table: "users", data: { name: "alice" } }],
    usersMetadata
  );

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unreachable");
  expect(result.results).toHaveLength(1);
  expect(result.results[0]!.data).toMatchObject({ id: "1", name: "alice" });

  const texts = queries.map(q => q.text.trim().toUpperCase());
  expect(texts[0]).toBe("BEGIN");
  expect(texts[texts.length - 1]).toBe("COMMIT");
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 2: Exception during op → ROLLBACK, ok: false + failedAt
// ──────────────────────────────────────────────────────────────────────────────
test("executeTransaction: exception in op triggers ROLLBACK and returns ok: false", async () => {
  // rowsByCall: BEGIN ok, INSERT throws, ROLLBACK ok
  const { pg, queries } = makeClientMock([[], new Error("db error"), []]);

  const result = await executeTransaction(
    pg,
    [{ op: "create", table: "users", data: { name: "bob" } }],
    usersMetadata
  );

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.error).toContain("db error");
  expect(result.failedAt).toBe(0);

  const texts = queries.map(q => q.text.trim().toUpperCase());
  expect(texts[0]).toBe("BEGIN");
  expect(texts).toContain("ROLLBACK");
  expect(texts).not.toContain("COMMIT");
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 3: status 404 (empty rows on update) → ROLLBACK, ok: false
// ──────────────────────────────────────────────────────────────────────────────
test("executeTransaction: 404 from updateRecord triggers ROLLBACK", async () => {
  // rowsByCall: BEGIN, UPDATE returns no rows (→ 404), ROLLBACK
  const { pg, queries } = makeClientMock([[], [], []]);

  const result = await executeTransaction(
    pg,
    [{ op: "update", table: "users", pk: "999", data: { name: "ghost" } }],
    usersMetadata
  );

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.failedAt).toBe(0);

  const texts = queries.map(q => q.text.trim().toUpperCase());
  expect(texts[0]).toBe("BEGIN");
  expect(texts).toContain("ROLLBACK");
  expect(texts).not.toContain("COMMIT");
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 4: failedAt reflects the correct op index in a multi-op transaction
// ──────────────────────────────────────────────────────────────────────────────
test("executeTransaction: failedAt is the index of the failing op, not always 0", async () => {
  // 3 ops: op 0 succeeds (INSERT), op 1 fails (UPDATE finds nothing → 404), op 2 never runs
  // rowsByCall: BEGIN, INSERT ok, UPDATE empty, ROLLBACK
  const { pg, queries } = makeClientMock([[], [{ id: "1" }], [], []]);

  const result = await executeTransaction(
    pg,
    [
      { op: "create", table: "users", data: { name: "first" } },
      { op: "update", table: "users", pk: "999", data: { name: "ghost" } },
      { op: "create", table: "users", data: { name: "third" } }, // never reached
    ],
    usersMetadata
  );

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.failedAt).toBe(1); // second op (index 1) failed

  const texts = queries.map(q => q.text.trim().toUpperCase());
  expect(texts[0]).toBe("BEGIN");
  expect(texts).toContain("ROLLBACK");
  expect(texts).not.toContain("COMMIT");
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 5: Pool detection — connect() called; release() called after commit
// ──────────────────────────────────────────────────────────────────────────────
test("executeTransaction: Pool — calls connect() and release() around transaction", async () => {
  let releaseCalled = false;
  const innerQueries: string[] = [];

  const innerClient = {
    query: async (text: string) => {
      innerQueries.push(text.trim().toUpperCase());
      return { rows: [{ id: "1", name: "carol" }] };
    },
    release: () => { releaseCalled = true; },
  };

  // Pool: has a connect() method
  const pool = {
    connect: async () => innerClient,
    query: async (_text: string) => { throw new Error("should not call pool.query directly"); },
  };

  const result = await executeTransaction(
    pool,
    [{ op: "create", table: "users", data: { name: "carol" } }],
    usersMetadata
  );

  expect(result.ok).toBe(true);
  expect(releaseCalled).toBe(true);
  expect(innerQueries[0]).toBe("BEGIN");
  expect(innerQueries[innerQueries.length - 1]).toBe("COMMIT");
});

// ──────────────────────────────────────────────────────────────────────────────
// Test 6: onBegin callback — called after BEGIN, receives tx client
// ──────────────────────────────────────────────────────────────────────────────
test("executeTransaction: onBegin called after BEGIN with the transaction client", async () => {
  const { pg, queries } = makeClientMock([[], [{ id: "1", name: "dave" }], []]);

  let onBeginCalledWith: any = null;
  let onBeginCalledAfterBegin = false;

  const onBegin = async (txClient: any) => {
    onBeginCalledWith = txClient;
    onBeginCalledAfterBegin = queries.some(q => q.text.trim().toUpperCase() === "BEGIN");
  };

  const result = await executeTransaction(
    pg,
    [{ op: "create", table: "users", data: { name: "dave" } }],
    usersMetadata,
    onBegin
  );

  expect(result.ok).toBe(true);
  expect(onBeginCalledWith).toBe(pg);
  expect(onBeginCalledAfterBegin).toBe(true);
});
