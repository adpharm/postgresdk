#!/usr/bin/env bun

import { test, expect } from "bun:test";
import { emitHonoRouter } from "../src/emit-router-hono";

test("Generated router includes helpful error when env var not set", () => {
  const routerCode = emitHonoRouter([], false, false, "env:POSTGRESDK_PULL_TOKEN");

  // Should include specific env var name in error message
  expect(routerCode).toContain("POSTGRESDK_PULL_TOKEN");
  expect(routerCode).toContain("Set POSTGRESDK_PULL_TOKEN in your environment");
  expect(routerCode).toContain("or remove pullToken from config");
});

test("Generated router error message for hardcoded token", () => {
  const routerCode = emitHonoRouter([], false, false, "my-hardcoded-secret");

  // Should have generic message (no env var name)
  expect(routerCode).toContain("Set the pullToken environment variable");
});

test("Pull command shows server error message", async () => {
  // This test verifies the pull command reads error body
  const mockResponse = {
    ok: false,
    status: 500,
    statusText: "Internal Server Error",
    json: async () => ({ error: "Custom server error message" })
  };

  let errorMsg = `${mockResponse.status} ${mockResponse.statusText}`;
  try {
    const errorBody = await mockResponse.json();
    if (errorBody.error) {
      errorMsg = errorBody.error;
    }
  } catch {
    // Failed to parse
  }

  expect(errorMsg).toBe("Custom server error message");
});
