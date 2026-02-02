#!/usr/bin/env bun

import { test, expect } from "bun:test";
import { Hono } from "hono";
import { serve } from "@hono/node-server";

const PORT = 9876;

// Helper to create a mock router with pullToken middleware
function createMockRouter(pullToken?: string): Hono {
  const router = new Hono();

  // Mock SDK manifest
  const SDK_MANIFEST = {
    version: "1.0.0",
    generated: new Date().toISOString(),
    files: { "index.ts": "export const SDK = {};" }
  };

  // Apply pullToken middleware if configured
  if (pullToken) {
    router.use("/_psdk/*", async (c, next) => {
      const authHeader = c.req.header("Authorization");
      const expectedToken = pullToken;

      if (!expectedToken) {
        return c.json({ error: "SDK endpoints are protected but token not configured" }, 500);
      }

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return c.json({ error: "Missing or invalid Authorization header" }, 401);
      }

      const providedToken = authHeader.slice(7);

      if (providedToken !== expectedToken) {
        return c.json({ error: "Invalid pull token" }, 401);
      }

      await next();
    });
  }

  // SDK endpoints
  router.get("/_psdk/sdk/manifest", (c) => {
    return c.json({
      version: SDK_MANIFEST.version,
      files: Object.keys(SDK_MANIFEST.files)
    });
  });

  router.get("/_psdk/sdk/download", (c) => {
    return c.json(SDK_MANIFEST);
  });

  return router;
}

interface ManifestResponse {
  version: string;
  generated: string;
  files: string[];
}

interface ErrorResponse {
  error: string;
}

// Test 1: Public SDK endpoints (no pullToken)
test("SDK endpoints accessible without token when pullToken not set", async () => {
  const app = createMockRouter(); // No pullToken
  const server = serve({ fetch: app.fetch, port: PORT });

  // Request without Authorization header should succeed
  const res = await fetch(`http://localhost:${PORT}/_psdk/sdk/manifest`);
  expect(res.status).toBe(200);

  const data = await res.json() as ManifestResponse;
  expect(data).toHaveProperty("version");
  expect(data).toHaveProperty("files");

  server.close();
});

// Test 2: Protected SDK endpoints (with pullToken)
test("SDK endpoints require valid token when pullToken is set", async () => {
  const app = createMockRouter("secret-token-123");
  const server = serve({ fetch: app.fetch, port: PORT });

  // 1. Request without Authorization header should fail
  let res = await fetch(`http://localhost:${PORT}/_psdk/sdk/manifest`);
  expect(res.status).toBe(401);
  let data = await res.json() as ErrorResponse;
  expect(data.error).toContain("Missing or invalid Authorization header");

  // 2. Request with invalid token should fail
  res = await fetch(`http://localhost:${PORT}/_psdk/sdk/manifest`, {
    headers: { Authorization: "Bearer wrong-token" }
  });
  expect(res.status).toBe(401);
  data = await res.json() as ErrorResponse;
  expect(data.error).toContain("Invalid pull token");

  // 3. Request with valid token should succeed
  res = await fetch(`http://localhost:${PORT}/_psdk/sdk/manifest`, {
    headers: { Authorization: "Bearer secret-token-123" }
  });
  expect(res.status).toBe(200);
  const successData = await res.json() as ManifestResponse;
  expect(successData).toHaveProperty("version");

  server.close();
});

// Test 3: Download endpoint also protected
test("SDK download endpoint requires valid token", async () => {
  const app = createMockRouter("download-secret");
  const server = serve({ fetch: app.fetch, port: PORT });

  // Without token - should fail
  let res = await fetch(`http://localhost:${PORT}/_psdk/sdk/download`);
  expect(res.status).toBe(401);

  // With valid token - should succeed
  res = await fetch(`http://localhost:${PORT}/_psdk/sdk/download`, {
    headers: { Authorization: "Bearer download-secret" }
  });
  expect(res.status).toBe(200);
  const data = await res.json() as { files: Record<string, string> };
  expect(data).toHaveProperty("files");

  server.close();
});

// Test 4: Invalid Authorization header format
test("Rejects non-Bearer authorization schemes", async () => {
  const app = createMockRouter("secret");
  const server = serve({ fetch: app.fetch, port: PORT });

  // Basic auth instead of Bearer
  const res = await fetch(`http://localhost:${PORT}/_psdk/sdk/manifest`, {
    headers: { Authorization: "Basic dXNlcjpwYXNz" }
  });
  expect(res.status).toBe(401);
  const data = await res.json() as ErrorResponse;
  expect(data.error).toContain("Missing or invalid Authorization header");

  server.close();
});
