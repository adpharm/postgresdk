#!/usr/bin/env bun
/**
 * Tests the SDK pull functionality
 * 
 * This test:
 * 1. Generates an SDK using test-gen first
 * 2. Starts a test server with the generated SDK
 * 3. Tests pulling the SDK from the server
 * 4. Validates the pulled SDK matches the original
 */

import { existsSync, rmSync } from "fs";
import { readFile } from "fs/promises";
import { execSync, spawn } from "child_process";
import { join } from "path";

const TEST_PORT = 3457;
const PULL_OUTPUT = "test/.pulled-sdk";
const SERVER_DIR = "test/.results/server";

async function main() {
  console.log("🧪 Testing SDK pull functionality\n");

  // Cleanup from previous runs
  if (existsSync(PULL_OUTPUT)) {
    rmSync(PULL_OUTPUT, { recursive: true, force: true });
  }

  try {
    // Step 1: Ensure SDK is generated (assumes test-gen was run before)
    console.log("1) Checking for generated SDK...");
    
    // If SDK doesn't exist, generate it
    if (!existsSync(join(SERVER_DIR, "router.ts"))) {
      console.log("SDK not found, generating...");
      execSync("bun src/cli.ts generate -c gen.config.ts", { stdio: "inherit" });
    } else {
      console.log("Using existing generated SDK");
    }
    
    // Verify server files exist
    if (!existsSync(join(SERVER_DIR, "router.ts"))) {
      throw new Error("Generated server files not found");
    }
    if (!existsSync(join(SERVER_DIR, "sdk-bundle.ts"))) {
      throw new Error("SDK bundle not found");
    }

    // Step 2: Start test server
    console.log("\n2) Starting test server...");
    const serverCode = `
      import { Hono } from "hono";
      import { serve } from "@hono/node-server";
      import { createRouter } from "${process.cwd()}/${SERVER_DIR}/router";

      const app = new Hono();
      const mockPg = { query: async () => ({ rows: [] }) };
      const router = createRouter({ pg: mockPg });
      app.route("/", router);

      const server = serve({
        fetch: app.fetch,
        port: ${TEST_PORT}
      });
      
      console.log("Test server ready on port ${TEST_PORT}");
    `;
    
    // Write and start server
    await Bun.write("/tmp/test-pull-server.ts", serverCode);
    const serverProc = spawn("bun", ["/tmp/test-pull-server.ts"], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    
    // Wait for server to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Server startup timeout")), 10000);
      serverProc.stdout?.on("data", (data) => {
        if (data.toString().includes("ready")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      serverProc.stderr?.on("data", (data) => {
        console.error("Server error:", data.toString());
      });
    });

    // Step 3: Test pull command with CLI args
    console.log("\n3) Testing pull with CLI arguments...");
    execSync(
      `bun src/cli.ts pull --from=http://localhost:${TEST_PORT} --output=${PULL_OUTPUT}`,
      { stdio: "inherit" }
    );
    
    // Verify pulled files
    if (!existsSync(PULL_OUTPUT)) {
      throw new Error("Pull output directory not created");
    }
    
    const pulledFiles = [
      "index.ts",
      "base-client.ts",
      "authors.ts",
      "books.ts",
      "tags.ts",
      "book_tags.ts",
      ".postgresdk.json"
    ];
    
    for (const file of pulledFiles) {
      if (!existsSync(join(PULL_OUTPUT, file))) {
        throw new Error(`Missing pulled file: ${file}`);
      }
    }
    console.log("✅ All expected files pulled");

    // Step 4: Test pull with config file
    console.log("\n4) Testing pull with config file...");
    
    // Move previous pull to a different location for comparison
    const PULL_OUTPUT_CONFIG = "test/.pulled-sdk-config";
    if (existsSync(PULL_OUTPUT_CONFIG)) {
      rmSync(PULL_OUTPUT_CONFIG, { recursive: true, force: true });
    }
    
    // Create test config
    const pullConfig = `
      export default {
        pull: {
          from: "http://localhost:${TEST_PORT}",
          output: "${PULL_OUTPUT_CONFIG}"
        }
      };
    `;
    await Bun.write("/tmp/test-pull.config.ts", pullConfig);
    
    // Run pull with config
    execSync(
      `bun ${process.cwd()}/src/cli.ts pull -c /tmp/test-pull.config.ts`,
      { stdio: "inherit" }
    );
    
    // Verify again
    if (!existsSync(PULL_OUTPUT_CONFIG)) {
      throw new Error("Pull with config failed");
    }
    console.log("✅ Pull with config file works");

    // Step 5: Verify pulled SDK metadata
    console.log("\n5) Verifying SDK metadata...");
    const metadata = JSON.parse(
      await readFile(join(PULL_OUTPUT_CONFIG, ".postgresdk.json"), "utf-8")
    );

    if (!metadata.version) throw new Error("Missing version in metadata");
    if (!metadata.pulledFrom) throw new Error("Missing pulledFrom URL");
    console.log("✅ SDK metadata valid");

    // Step 6: Compare pulled SDK with original
    console.log("\n6) Comparing pulled SDK with original...");
    const originalIndex = await readFile("test/.results/client/index.ts", "utf-8");
    const pulledIndex = await readFile(join(PULL_OUTPUT_CONFIG, "index.ts"), "utf-8");
    
    if (originalIndex !== pulledIndex) {
      throw new Error("Pulled SDK content doesn't match original");
    }
    console.log("✅ Pulled SDK matches original");

    // Step 7: Test authentication (if server requires it)
    console.log("\n7) Testing pull with authentication token...");
    const PULL_OUTPUT_TOKEN = "test/.pulled-sdk-with-token";
    if (existsSync(PULL_OUTPUT_TOKEN)) {
      rmSync(PULL_OUTPUT_TOKEN, { recursive: true, force: true });
    }
    
    execSync(
      `bun src/cli.ts pull --from=http://localhost:${TEST_PORT} --output=${PULL_OUTPUT_TOKEN} --token=test-token`,
      { stdio: "inherit" }
    );
    console.log("✅ Pull with token works");

    // Cleanup
    console.log("\n8) Cleaning up...");
    serverProc.kill();
    
    // Leave the pulled SDK files for manual inspection
    console.log("\n📁 Pulled SDK files left for inspection:");
    console.log(`   • ${PULL_OUTPUT} (CLI args pull)`);
    console.log(`   • ${PULL_OUTPUT_CONFIG} (config file pull)`);
    console.log(`   • ${PULL_OUTPUT_TOKEN} (with auth token)`);
    console.log("   You can manually inspect these files.");
    
    console.log("\n✅ All pull tests passed!");
    process.exit(0);

  } catch (error) {
    console.error("\n❌ Pull test failed:", error);
    process.exit(1);
  }
}

main().catch(console.error);