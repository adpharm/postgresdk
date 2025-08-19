#!/usr/bin/env bun
/**
 * End-to-end test for Drizzle schema -> PostgreSDK generation -> Test execution
 * 
 * This test:
 * 1. Ensures PostgreSQL is running
 * 2. Creates a new database for Drizzle
 * 3. Pushes the Drizzle schema to the database
 * 4. Generates API with PostgreSDK
 * 5. Runs the generated tests to verify everything works
 */

import { execSync, exec } from "node:child_process";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { Client } from "pg";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const CONTAINER_NAME = "postgresdk-test-db";
const DB_NAME = "drizzle_test";
const ADMIN_URL = "postgres://user:pass@localhost:5432/testdb";
const TEST_URL = `postgres://user:pass@localhost:5432/${DB_NAME}`;
const OUTPUT_DIR = "test/.drizzle-e2e-results";

async function isContainerRunning(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`docker ps --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`);
    return stdout.trim() === CONTAINER_NAME;
  } catch {
    return false;
  }
}

async function startPostgres(): Promise<void> {
  console.log("🐳 Ensuring PostgreSQL container is running...");
  
  // Check if container exists but is stopped
  try {
    const { stdout } = await execAsync(`docker ps -a --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`);
    if (stdout.trim() === CONTAINER_NAME) {
      console.log("  → Container exists, starting it...");
      await execAsync(`docker start ${CONTAINER_NAME}`);
    } else {
      console.log("  → Creating new container...");
      await execAsync(
        `docker run -d --name ${CONTAINER_NAME} \
        -e POSTGRES_PASSWORD=pass \
        -e POSTGRES_USER=user \
        -e POSTGRES_DB=testdb \
        -p 5432:5432 \
        postgres:17-alpine`
      );
    }
    
    // Wait for PostgreSQL to be ready
    console.log("  → Waiting for PostgreSQL to be ready...");
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Test connection
    for (let i = 0; i < 10; i++) {
      try {
        execSync(`docker exec ${CONTAINER_NAME} pg_isready -U user`, { stdio: 'ignore' });
        console.log("  ✓ PostgreSQL is ready!");
        return;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error("PostgreSQL failed to start");
  } catch (error) {
    console.error("Failed to start PostgreSQL:", error);
    throw error;
  }
}

async function createDatabase() {
  console.log("📦 Creating test database...");
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  
  try {
    // Drop if exists and create fresh
    await client.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    await client.query(`CREATE DATABASE ${DB_NAME}`);
    console.log("  ✓ Database created");
  } finally {
    await client.end();
  }
}

async function pushDrizzleSchema() {
  console.log("\n🚀 Pushing Drizzle schema to database...");
  
  // Set the DATABASE_URL for drizzle-kit
  process.env.DATABASE_URL = TEST_URL;
  
  try {
    // Use drizzle-kit push to apply schema directly (no migrations needed for test)
    // Use --force to skip confirmation prompt
    execSync("bunx drizzle-kit push --config=test/drizzle-e2e/drizzle.config.ts --force", {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: TEST_URL }
    });
    console.log("  ✓ Schema pushed successfully");
  } catch (error) {
    console.error("  ❌ Failed to push schema:", error);
    throw error;
  }
}

async function generatePostgreSDK() {
  console.log("\n🔧 Generating PostgreSDK API...");
  
  // Clean output directory
  if (existsSync(OUTPUT_DIR)) {
    rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });
  
  // Create config for PostgreSDK with include methods generation
  const config = `export default {
  connectionString: "${TEST_URL}",
  outServer: "${OUTPUT_DIR}/server",
  outClient: "${OUTPUT_DIR}/client",
  includeMethodsDepth: 2,  // Enable include methods generation
  skipJunctionTables: true,
  tests: {
    generate: true,
    output: "${OUTPUT_DIR}/tests",
    framework: "vitest"
  }
};`;
  
  const configPath = `${OUTPUT_DIR}/postgresdk.config.ts`;
  require("fs").writeFileSync(configPath, config);
  
  try {
    execSync(`bun src/cli.ts generate -c ${configPath}`, {
      stdio: "inherit"
    });
    console.log("  ✓ API generated successfully");
  } catch (error) {
    console.error("  ❌ Failed to generate API:", error);
    throw error;
  }
}

async function waitForServer(url: string, maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) {
        return true;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

async function verifyIncludeMethods() {
  console.log("\n🔍 Verifying include methods generation...");
  
  const fs = require("fs");
  
  // Check if Select schemas are generated
  const zodPath = `${OUTPUT_DIR}/server/zod/contacts.ts`;
  if (existsSync(zodPath)) {
    const zodContent = fs.readFileSync(zodPath, "utf-8");
    if (zodContent.includes("SelectContactsSchema")) {
      console.log("  ✓ Select schemas are generated");
    } else {
      console.error("  ❌ Select schemas not found");
      return false;
    }
  }
  
  // Check if include methods are generated in client
  const clientPath = `${OUTPUT_DIR}/client/contacts.ts`;
  if (existsSync(clientPath)) {
    const clientContent = fs.readFileSync(clientPath, "utf-8");
    const methods = clientContent.match(/async (list|getByPk)With[A-Z]\w+/g) || [];
    
    if (methods.length > 0) {
      console.log("  ✓ Include methods are generated");
      console.log(`  → Generated ${methods.length} include methods:`);
      methods.slice(0, 5).forEach(m => console.log(`    - ${m.replace('async ', '')}`));
      if (methods.length > 5) {
        console.log(`    ... and ${methods.length - 5} more`);
      }
    } else {
      console.error("  ❌ Include methods not found");
      console.log("  → Client content preview:");
      console.log(clientContent.split('\n').slice(40, 50).join('\n'));
      return false;
    }
  }
  
  return true;
}

async function runGeneratedTests() {
  console.log("\n🧪 Running generated tests...");
  
  const PORT = 3555;
  const SERVER_URL = `http://localhost:${PORT}`;
  
  // Start the API server
  console.log("  → Starting API server...");
  
  const { spawn } = require("child_process");
  const serverProcess = spawn("bun", [
    "test/drizzle-e2e/test-server.ts",
    OUTPUT_DIR + "/server",
    PORT.toString(),
    TEST_URL
  ], {
    stdio: ["pipe", "pipe", "pipe"]
  });
  
  // Capture server output for debugging
  serverProcess.stdout.on("data", (data: Buffer) => {
    const output = data.toString();
    if (output.includes("Server running")) {
      console.log("  ✓ Server started successfully");
    }
  });
  
  serverProcess.stderr.on("data", (data: Buffer) => {
    console.error("  Server error:", data.toString());
  });
  
  // Wait for server to be ready
  console.log("  → Waiting for server to be ready...");
  const isReady = await waitForServer(SERVER_URL);
  
  if (!isReady) {
    console.error("  ❌ Server failed to start");
    serverProcess.kill();
    throw new Error("Server did not start in time");
  }
  
  console.log("  ✓ Server is ready");
  console.log("  → Running tests...");
  
  let testsPassed = false;
  
  try {
    // Run the generated tests
    execSync(`cd ${OUTPUT_DIR}/tests && API_URL=${SERVER_URL} bunx vitest run`, {
      stdio: "inherit",
      env: { ...process.env, API_URL: SERVER_URL }
    });
    console.log("  ✓ Tests completed successfully");
    testsPassed = true;
  } catch (error) {
    console.error("  ❌ Tests failed");
    // Don't throw here, we want to see the results
  } finally {
    // Clean up server process
    console.log("  → Stopping server...");
    serverProcess.kill("SIGTERM");
    
    // Give it a moment to shut down gracefully
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Force kill if still running
    try {
      serverProcess.kill("SIGKILL");
    } catch {}
  }
  
  return testsPassed;
}

async function main() {
  console.log("🎯 Drizzle End-to-End Test");
  console.log("=" + "=".repeat(49));
  
  try {
    // Step 0: Ensure PostgreSQL is running
    const isRunning = await isContainerRunning();
    if (!isRunning) {
      console.log("⚠️  PostgreSQL container is not running");
      await startPostgres();
    } else {
      console.log("✓ PostgreSQL container is already running");
    }
    
    // Step 1: Create database
    await createDatabase();
    
    // Step 2: Push Drizzle schema
    await pushDrizzleSchema();
    
    // Step 3: Generate PostgreSDK API
    await generatePostgreSDK();
    
    // Step 4: Verify include methods were generated
    const includeMethodsValid = await verifyIncludeMethods();
    if (!includeMethodsValid) {
      throw new Error("Include methods generation failed");
    }
    
    // Step 5: Show what was generated
    console.log("\n📁 Generated files:");
    execSync(`find ${OUTPUT_DIR} -type f -name "*.ts" | head -20`, { stdio: "inherit" });
    
    console.log("\n" + "=".repeat(50));
    console.log("✅ E2E Test Setup Complete!");
    
    // Now run the tests
    const testsPassed = await runGeneratedTests();
    
    console.log("\n" + "=".repeat(50));
    if (testsPassed) {
      console.log("✅ All E2E tests passed!");
    } else {
      console.log("❌ Some tests failed");
      console.log("\n📁 Check the test results above for details");
      process.exit(1);
    }
    
  } catch (error) {
    console.error("\n❌ E2E test failed:", error);
    process.exit(1);
  }
}

// Run the test
main().catch(console.error);