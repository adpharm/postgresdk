#!/usr/bin/env bun
/**
 * Tests the SDK init merge functionality
 */

import { existsSync, rmSync, mkdirSync } from "fs";
import { readFile } from "fs/promises";
import { execSync } from "child_process";
import { join } from "path";

const TEST_DIR = "test/.init-merge-test";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function cleanup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

async function testKeepExistingStrategy() {
  console.log("\n📝 Testing keep-existing merge strategy...");

  const projectDir = join(TEST_DIR, "keep-existing");
  mkdirSync(projectDir, { recursive: true });

  // Create an existing config with custom values
  const existingConfig = `export default {
  connectionString: process.env.CUSTOM_DB || "postgres://custom:custom@localhost:5432/customdb",
  schema: "custom_schema",
  outServer: "./custom/server",
  outClient: "./custom/client",
  softDeleteColumn: "archived_at",
  serverFramework: "hono",
};`;

  await Bun.write(join(projectDir, "postgresdk.config.ts"), existingConfig);

  // Run init with keep-existing strategy (using arrow up key to select first option)
  const output = execSync(
    `cd ${projectDir} && printf "\\x1b[A\\n" | timeout 3 bun ${process.cwd()}/src/cli.ts init`,
    { encoding: "utf-8" }
  );

  // Read the resulting config
  const newConfig = await readFile(join(projectDir, "postgresdk.config.ts"), "utf-8");

  // Verify that custom values were kept
  assert(newConfig.includes('process.env.CUSTOM_DB || "postgres://custom:custom@localhost:5432/customdb"'), 
    "Should keep custom connection string");
  assert(newConfig.includes('schema: "custom_schema"'), "Should keep custom schema");
  assert(newConfig.includes('outServer: "./custom/server"'), "Should keep custom outServer");
  assert(newConfig.includes('outClient: "./custom/client"'), "Should keep custom outClient");
  assert(newConfig.includes('softDeleteColumn: "archived_at"'), "Should keep custom softDeleteColumn");
  assert(newConfig.includes('serverFramework: "hono"'), "Should keep serverFramework");
  
  // Should NOT have these as comments since they should be active
  assert(!newConfig.includes('// schema:'), "Schema should not be commented");
  assert(!newConfig.includes('// outServer:'), "outServer should not be commented");
  assert(!newConfig.includes('// outClient:'), "outClient should not be commented");
  assert(!newConfig.includes('// softDeleteColumn:'), "softDeleteColumn should not be commented");
  assert(!newConfig.includes('// serverFramework:'), "serverFramework should not be commented");

  // Verify backup was created
  const backupFiles = require("fs").readdirSync(projectDir).filter(f => f.startsWith("postgresdk.config.ts.backup"));
  assert(backupFiles.length === 1, "Should create exactly one backup file");

  console.log("  ✓ Keep-existing strategy preserves all custom values");
}

async function testReplaceWithDefaults() {
  console.log("\n📝 Testing replace with defaults strategy...");

  const projectDir = join(TEST_DIR, "replace-defaults");
  mkdirSync(projectDir, { recursive: true });

  // Create an existing config
  const existingConfig = `export default {
  connectionString: "postgres://old:old@localhost:5432/olddb",
  schema: "old_schema",
};`;

  await Bun.write(join(projectDir, "postgresdk.config.ts"), existingConfig);

  // Run init with replace strategy (down arrow twice to select third option)
  const output = execSync(
    `cd ${projectDir} && printf "\\x1b[B\\x1b[B\\n" | timeout 3 bun ${process.cwd()}/src/cli.ts init`,
    { encoding: "utf-8" }
  );

  // Read the resulting config
  const newConfig = await readFile(join(projectDir, "postgresdk.config.ts"), "utf-8");

  // Verify that defaults were used
  assert(newConfig.includes('process.env.DATABASE_URL || "postgres://user:password@localhost:5432/mydb"'), 
    "Should use default connection string");
  assert(newConfig.includes('// schema: "public"'), "Should have commented default schema");
  assert(!newConfig.includes('schema: "old_schema"'), "Should not keep old schema");

  console.log("  ✓ Replace strategy uses fresh defaults");
}

async function testCancelOption() {
  console.log("\n📝 Testing cancel option...");

  const projectDir = join(TEST_DIR, "cancel");
  mkdirSync(projectDir, { recursive: true });

  const originalConfig = `export default { test: true };`;
  await Bun.write(join(projectDir, "postgresdk.config.ts"), originalConfig);

  // Run init and select cancel (down arrow 3 times)
  try {
    execSync(
      `cd ${projectDir} && printf "\\x1b[B\\x1b[B\\x1b[B\\n" | timeout 3 bun ${process.cwd()}/src/cli.ts init`,
      { encoding: "utf-8", stdio: "pipe" }
    );
  } catch (e) {
    // Expected to exit
  }

  // Verify config wasn't changed
  const config = await readFile(join(projectDir, "postgresdk.config.ts"), "utf-8");
  assert(config === originalConfig, "Config should remain unchanged when cancelled");

  // Verify no backup was created
  const backupFiles = require("fs").readdirSync(projectDir).filter(f => f.startsWith("postgresdk.config.ts.backup"));
  assert(backupFiles.length === 0, "Should not create backup when cancelled");

  console.log("  ✓ Cancel option leaves config unchanged");
}

async function testInteractiveMode() {
  console.log("\n📝 Testing interactive merge mode...");

  const projectDir = join(TEST_DIR, "interactive");
  mkdirSync(projectDir, { recursive: true });

  // Create config with mixed values
  const existingConfig = `export default {
  connectionString: process.env.CUSTOM_DB || "postgres://custom:custom@localhost:5432/customdb",
  schema: "my_schema",
  outServer: "./my/server",
};`;

  await Bun.write(join(projectDir, "postgresdk.config.ts"), existingConfig);

  // Select interactive mode (down arrow once), then keep all existing values
  // For each field, select "Keep current value" (which is the default, so just Enter)
  const inputs = [
    "\\x1b[B\\n",  // Select interactive mode
    "\\n",         // Keep connectionString
    "\\n",         // Keep schema
    "\\n",         // Keep outServer
    "n\\n",        // Don't add tests
    "n\\n",        // Don't add auth
    "n\\n"         // Don't add pull
  ].join("");

  const output = execSync(
    `cd ${projectDir} && printf "${inputs}" | timeout 5 bun ${process.cwd()}/src/cli.ts init`,
    { encoding: "utf-8" }
  );

  const newConfig = await readFile(join(projectDir, "postgresdk.config.ts"), "utf-8");

  // Verify kept values
  assert(newConfig.includes('process.env.CUSTOM_DB || "postgres://custom:custom@localhost:5432/customdb"'),
    "Should keep custom connection string in interactive mode");
  assert(newConfig.includes('schema: "my_schema"'), "Should keep custom schema in interactive mode");
  assert(newConfig.includes('outServer: "./my/server"'), "Should keep custom outServer in interactive mode");

  console.log("  ✓ Interactive mode allows field-by-field control");
}

async function main() {
  console.log("🧪 Testing SDK init merge functionality");
  console.log("=" + "=".repeat(49));

  try {
    await cleanup();

    // Run test suites
    await testKeepExistingStrategy();
    await testReplaceWithDefaults();
    await testCancelOption();
    await testInteractiveMode();

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("✅ All init merge tests passed!");
    console.log("=".repeat(50));

    await cleanup();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Init merge test failed:", error);
    await cleanup();
    process.exit(1);
  }
}

main().catch(console.error);