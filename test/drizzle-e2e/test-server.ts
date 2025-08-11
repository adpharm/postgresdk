#!/usr/bin/env bun
/**
 * Test API server for Drizzle E2E tests
 * 
 * This server uses the generated routes from PostgreSDK
 * and serves them for testing purposes.
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Client } from "pg";
import { cors } from "hono/cors";

// Parse command line args
const args = process.argv.slice(2);
const serverDir = args[0] || "test/.drizzle-e2e-results/server";
const port = parseInt(args[1] || "3555");
const dbUrl = args[2] || "postgres://user:pass@localhost:5432/drizzle_test";

async function startServer() {
  console.log("🚀 Starting test API server...");
  console.log(`  Server dir: ${serverDir}`);
  console.log(`  Port: ${port}`);
  console.log(`  Database: ${dbUrl}`);
  
  // Import the generated router
  const { registerAllRoutes } = await import(`../../${serverDir}/router.ts`);
  
  // Create Hono app
  const app = new Hono();
  
  // Add CORS for testing
  app.use("*", cors());
  
  // Add health check endpoint
  app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));
  
  // Create PostgreSQL client
  const pg = new Client({ connectionString: dbUrl });
  await pg.connect();
  console.log("  ✓ Connected to database");
  
  // Register all generated routes
  registerAllRoutes(app, { pg });
  console.log("  ✓ Routes registered");
  
  // Start server
  const server = serve({
    fetch: app.fetch,
    port,
  });
  
  console.log(`  ✓ Server running on http://localhost:${port}`);
  console.log("  Press Ctrl+C to stop");
  
  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n  Shutting down...");
    server.close();
    await pg.end();
    process.exit(0);
  });
  
  process.on("SIGTERM", async () => {
    server.close();
    await pg.end();
    process.exit(0);
  });
}

// Start the server
startServer().catch((error) => {
  console.error("❌ Failed to start server:", error);
  process.exit(1);
});