#!/usr/bin/env bun

/**
 * Unit tests for JSONB vs native array serialization in prepareParams.
 *
 * Before the fix, any `typeof p === 'object'` value was JSON.stringify'd,
 * which broke native JS arrays passed to text[]/int[] columns.
 * After the fix, only values whose column is listed in jsonbColumns are stringified.
 *
 * No Docker or real Postgres needed — the pg client is mocked.
 */

import { test, expect, beforeAll } from "bun:test";
import { mkdirSync, writeFileSync } from "fs";
import { emitCoreOperations } from "../src/emit-core-operations";

const OUTPUT_DIR = `${process.cwd()}/test/.jsonb-serialization-test`;

let createRecord: (ctx: any, data: Record<string, any>) => Promise<any>;
let updateRecord: (ctx: any, pkValues: any[], data: Record<string, any>) => Promise<any>;

beforeAll(async () => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(`${OUTPUT_DIR}/operations.ts`, emitCoreOperations());
  const mod = await import(`${OUTPUT_DIR}/operations.ts`);
  createRecord = mod.createRecord;
  updateRecord = mod.updateRecord;
});

// Minimal pg mock that captures params passed to query
function makePgMock(returnRow: any = { id: 1 }) {
  const calls: { text: string; params: any[] }[] = [];
  const pg = {
    query: async (text: string, params: any[] = []) => {
      calls.push({ text, params });
      return { rows: [returnRow] };
    },
  };
  return { pg, calls };
}

const baseCtx = {
  table: "items",
  pkColumns: ["id"],
  softDeleteColumn: null,
  includeMethodsDepth: 0,
  allColumnNames: ["id", "tags", "meta", "embedding"],
  jsonbColumns: ["meta"],      // "meta" is jsonb; "tags" is text[]
  vectorColumns: ["embedding"], // "embedding" is halfvec/vector
};

// --- createRecord ---

test("createRecord: text[] column is passed as native array (not stringified)", async () => {
  const { pg, calls } = makePgMock({ id: 1, tags: ["a", "b"], meta: {} });
  await createRecord({ ...baseCtx, pg }, { tags: ["a", "b"], meta: {} });
  expect(calls.length).toBeGreaterThan(0);
  const tagsParam = calls[0]!.params[0]; // first placeholder = tags
  expect(Array.isArray(tagsParam)).toBe(true);
  expect(typeof tagsParam).not.toBe("string");
});

test("createRecord: jsonb column is stringified", async () => {
  const { pg, calls } = makePgMock({ id: 1, tags: ["a"], meta: { x: 1 } });
  await createRecord({ ...baseCtx, pg }, { tags: ["a"], meta: { x: 1 } });
  expect(calls.length).toBeGreaterThan(0);
  const metaParam = calls[0]!.params[1]; // second placeholder = meta
  expect(typeof metaParam).toBe("string");
  expect(JSON.parse(metaParam)).toEqual({ x: 1 });
});

// --- updateRecord ---

test("updateRecord: text[] column is passed as native array", async () => {
  const { pg, calls } = makePgMock({ id: 1, tags: ["x"], meta: {} });
  await updateRecord({ ...baseCtx, pg }, [1], { tags: ["x"], meta: {} });
  // params layout: [pkValue, ...setCols] — tags is first set col
  expect(calls.length).toBeGreaterThan(0);
  const tagsParam = calls[0]!.params[1];
  expect(Array.isArray(tagsParam)).toBe(true);
});

test("updateRecord: jsonb column is stringified", async () => {
  const { pg, calls } = makePgMock({ id: 1, tags: ["x"], meta: { y: 2 } });
  await updateRecord({ ...baseCtx, pg }, [1], { tags: ["x"], meta: { y: 2 } });
  expect(calls.length).toBeGreaterThan(0);
  const metaParam = calls[0]!.params[2];
  expect(typeof metaParam).toBe("string");
  expect(JSON.parse(metaParam)).toEqual({ y: 2 });
});

// --- vector columns ---

test("createRecord: vector column is stringified (not passed as native array)", async () => {
  const embedding = [-0.013, 0.035, -0.009];
  const { pg, calls } = makePgMock({ id: 1, embedding });
  await createRecord({ ...baseCtx, pg }, { embedding });
  expect(calls.length).toBeGreaterThan(0);
  const embParam = calls[0]!.params[0];
  expect(typeof embParam).toBe("string");
  expect(JSON.parse(embParam)).toEqual(embedding);
});

test("updateRecord: vector column is stringified (not passed as native array)", async () => {
  const embedding = [-0.013, 0.035, -0.009];
  const { pg, calls } = makePgMock({ id: 1, embedding });
  await updateRecord({ ...baseCtx, pg }, [1], { embedding });
  expect(calls.length).toBeGreaterThan(0);
  const embParam = calls[0]!.params[1]; // params: [pkValue, embedding]
  expect(typeof embParam).toBe("string");
  expect(JSON.parse(embParam)).toEqual(embedding);
});
