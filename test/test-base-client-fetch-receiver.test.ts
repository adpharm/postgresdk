#!/usr/bin/env bun

/**
 * Regression test for the "Illegal invocation" bug:
 *
 * BaseClient stores `fetch` as `this.fetchFn` and calls it as a method
 * (`this.fetchFn(...)`). Without rebinding, the receiver is the client
 * instance — browsers reject any fetch call whose `this` is not
 * `Window`/`WorkerGlobalScope` with `TypeError: Illegal invocation`.
 *
 * The fix rebinds `fetchFn` to an arrow in the constructor body, so the
 * captured `this` inside the user-provided fetch is `undefined`
 * (strict-mode module call), not the BaseClient instance.
 */

import { test, expect, beforeAll } from "bun:test";
import { mkdirSync, writeFileSync } from "fs";
import { emitBaseClient } from "../src/emit-base-client";

const OUTPUT_DIR = `${process.cwd()}/test/.fetch-receiver-test`;

type BaseClientCtor = new (
  baseUrl: string,
  fetchFn?: typeof fetch,
  auth?: unknown
) => { fetchFn: typeof fetch };

let BaseClient: BaseClientCtor;

beforeAll(async () => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(`${OUTPUT_DIR}/base-client.ts`, emitBaseClient());
  const mod = await import(`${OUTPUT_DIR}/base-client.ts`);
  BaseClient = mod.BaseClient;
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

test("fetchFn is called with a receiver that is not the BaseClient instance", async () => {
  let capturedThis: unknown = "untouched";

  // Plain `function` so `this` reflects whatever the caller binds.
  const customFetch = function (this: unknown, _url: any, _init?: any) {
    capturedThis = this;
    return Promise.resolve(jsonResponse({ ok: true }));
  } as unknown as typeof fetch;

  class TestClient extends BaseClient {
    callGet(path: string) {
      return (this as any).get(path);
    }
  }

  const client = new TestClient("https://example.test", customFetch);
  await client.callGet("/ping");

  expect(capturedThis).not.toBe(client);
  // Arrow wrapper invokes the inner fn as a free call → `this` is undefined in module/strict mode.
  expect(capturedThis).toBeUndefined();
});

test("default fetchFn (no override) is also rebound away from the client receiver", async () => {
  // Replace globalThis.fetch with a spy so the *default* path goes through us too.
  const original = globalThis.fetch;
  let capturedThis: unknown = "untouched";
  const spy = function (this: unknown, _url: any, _init?: any) {
    capturedThis = this;
    return Promise.resolve(jsonResponse({ ok: true }));
  } as unknown as typeof fetch;
  globalThis.fetch = spy;

  try {
    class TestClient extends BaseClient {
      callGet(path: string) {
        return (this as any).get(path);
      }
    }
    const client = new TestClient("https://example.test"); // no fetch arg → default
    await client.callGet("/ping");
    expect(capturedThis).not.toBe(client);
    expect(capturedThis).toBeUndefined();
  } finally {
    globalThis.fetch = original;
  }
});
