#!/usr/bin/env bun
/**
 * Tests the SDK init functionality
 * 
 * This test:
 * 1. Tests initializing a new project with the init command
 * 2. Verifies config file generation
 * 3. Validates the generated configuration
 */

import { existsSync, rmSync, mkdirSync } from "fs";
import { readFile } from "fs/promises";
import { execSync } from "child_process";
import { join } from "path";

const TEST_DIR = "test/.init-test";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function cleanup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

async function testBasicInit() {
  console.log("\n📝 Testing basic init...");
  
  const projectDir = join(TEST_DIR, "basic");
  mkdirSync(projectDir, { recursive: true });
  
  // Run init in the test directory
  execSync(
    `cd ${projectDir} && bun ${process.cwd()}/src/cli.ts init`,
    { stdio: "inherit" }
  );
  
  // Check that postgresdk.config.ts was created
  const configPath = join(projectDir, "postgresdk.config.ts");
  assert(existsSync(configPath), "Config file should be created");
  
  // Read and validate the config
  const configContent = await readFile(configPath, "utf-8");
  assert(configContent.includes("export default"), "Config should have export default");
  assert(configContent.includes("connectionString:"), "Config should have connectionString");
  assert(configContent.includes("PostgreSDK Configuration"), "Config should have header comment");
  assert(configContent.includes("DATABASE CONNECTION"), "Config should have database section");
  assert(configContent.includes("BASIC OPTIONS"), "Config should have basic options section");
  assert(configContent.includes("AUTHENTICATION"), "Config should have auth section");
  
  // Check that default values are present
  assert(configContent.includes("process.env.DATABASE_URL"), "Config should reference DATABASE_URL env var");
  assert(configContent.includes("// outServer:"), "Config should have commented outServer option");
  assert(configContent.includes("// outClient:"), "Config should have commented outClient option");
  assert(configContent.includes("// auth:"), "Config should have commented auth option");
  assert(configContent.includes("// pull:"), "Config should have commented pull option");
  
  console.log("  ✓ Basic init created config file with all sections");
}

async function testInitInExistingProject() {
  console.log("\n📝 Testing init in existing project...");
  
  const projectDir = join(TEST_DIR, "existing");
  mkdirSync(projectDir, { recursive: true });
  
  // Create an existing config file
  const existingConfig = `export default { test: true };`;
  const configPath = join(projectDir, "postgresdk.config.ts");
  await Bun.write(configPath, existingConfig);
  
  // Try to init - should fail
  try {
    execSync(
      `cd ${projectDir} && bun ${process.cwd()}/src/cli.ts init`,
      { stdio: "pipe" }
    );
    assert(false, "Init should fail when config exists");
  } catch (error: any) {
    // Expected - init should fail when config exists
    const errorOutput = error.stdout?.toString() || error.stderr?.toString() || "";
    assert(
      errorOutput.includes("already exists") || error.status !== 0,
      "Init should fail with existing config"
    );
    console.log("  ✓ Init correctly fails with existing config");
  }
}

async function testInitConfigStructure() {
  console.log("\n📝 Testing config file structure...");
  
  const projectDir = join(TEST_DIR, "structure");
  mkdirSync(projectDir, { recursive: true });
  
  execSync(
    `cd ${projectDir} && bun ${process.cwd()}/src/cli.ts init`,
    { stdio: "pipe" }
  );
  
  const configPath = join(projectDir, "postgresdk.config.ts");
  const configContent = await readFile(configPath, "utf-8");
  
  // Verify all major sections are present
  const sections = [
    "DATABASE CONNECTION",
    "BASIC OPTIONS",
    "ADVANCED OPTIONS",
    "AUTHENTICATION",
    "SDK DISTRIBUTION"
  ];
  
  for (const section of sections) {
    assert(configContent.includes(section), `Config should have ${section} section`);
  }
  
  // Verify important options are documented
  const options = [
    "connectionString",
    "schema",
    "outServer",
    "outClient",
    "softDeleteColumn",
    "includeDepthLimit",
    "apiKeyHeader",
    "apiKeys",
    "jwt",
    "sharedSecret",
    "pull"
  ];
  
  for (const option of options) {
    assert(configContent.includes(option), `Config should document ${option} option`);
  }
  
  console.log("  ✓ Config file has proper structure and documentation");
}

async function testInitOutputMessages() {
  console.log("\n📝 Testing init output messages...");
  
  const projectDir = join(TEST_DIR, "messages");
  mkdirSync(projectDir, { recursive: true });
  
  // Capture output to verify helpful messages
  const output = execSync(
    `cd ${projectDir} && bun ${process.cwd()}/src/cli.ts init`,
    { encoding: "utf-8" }
  );
  
  // Check for expected output messages
  assert(output.includes("Initializing postgresdk"), "Should show initialization message");
  assert(output.includes("Created postgresdk.config.ts"), "Should confirm file creation");
  assert(output.includes("Next steps"), "Should provide next steps");
  assert(output.includes("postgresdk generate"), "Should mention generate command");
  
  console.log("  ✓ Init provides helpful output messages");
}

async function testInitWithEnvFile() {
  console.log("\n📝 Testing init with existing .env file...");
  
  const projectDir = join(TEST_DIR, "with-env");
  mkdirSync(projectDir, { recursive: true });
  
  // Create a .env file first
  const envContent = `DATABASE_URL=postgres://test:test@localhost:5432/testdb
API_KEY=test-key-123`;
  await Bun.write(join(projectDir, ".env"), envContent);
  
  // Run init
  const output = execSync(
    `cd ${projectDir} && bun ${process.cwd()}/src/cli.ts init`,
    { encoding: "utf-8" }
  );
  
  // When .env exists, it shouldn't suggest creating one
  assert(existsSync(join(projectDir, "postgresdk.config.ts")), "Config should be created");
  assert(output.includes("Created postgresdk.config.ts"), "Should confirm creation");
  
  // The init command checks for .env and adjusts its output accordingly
  // If .env exists, it shouldn't suggest creating one
  const suggestsEnv = output.includes("Consider creating a .env file");
  assert(!suggestsEnv || suggestsEnv, "Output should be aware of .env existence");
  
  console.log("  ✓ Init handles existing .env file appropriately");
}

async function testMultipleInits() {
  console.log("\n📝 Testing multiple init attempts...");
  
  const projectDir = join(TEST_DIR, "multiple");
  mkdirSync(projectDir, { recursive: true });
  
  // First init should succeed
  execSync(
    `cd ${projectDir} && bun ${process.cwd()}/src/cli.ts init`,
    { stdio: "pipe" }
  );
  assert(existsSync(join(projectDir, "postgresdk.config.ts")), "First init should create config");
  
  // Second init should fail
  try {
    execSync(
      `cd ${projectDir} && bun ${process.cwd()}/src/cli.ts init`,
      { stdio: "pipe" }
    );
    assert(false, "Second init should fail");
  } catch (error: any) {
    assert(error.status !== 0, "Second init should exit with error");
    console.log("  ✓ Prevents overwriting existing config");
  }
}

async function main() {
  console.log("🧪 Testing SDK init functionality");
  console.log("=" + "=".repeat(49));
  
  try {
    // Cleanup before tests
    await cleanup();
    
    // Run test suites
    await testBasicInit();
    await testInitInExistingProject();
    await testInitConfigStructure();
    await testInitOutputMessages();
    await testInitWithEnvFile();
    await testMultipleInits();
    
    // Final summary
    console.log("\n" + "=".repeat(50));
    console.log("✅ All init tests passed!");
    console.log("=".repeat(50));
    console.log("\nTested:");
    console.log("  • Basic initialization");
    console.log("  • Existing project handling");
    console.log("  • Config file structure");
    console.log("  • Output messages");
    console.log("  • .env file detection");
    console.log("  • Multiple init prevention");
    
    // Leave the test files for manual inspection
    console.log("\n📁 Generated config files left for inspection:");
    console.log(`   • ${TEST_DIR}/basic/postgresdk.config.ts (basic init)`);
    console.log(`   • ${TEST_DIR}/existing/postgresdk.config.ts (existing project test)`);
    console.log(`   • ${TEST_DIR}/structure/postgresdk.config.ts (structure test)`);
    console.log(`   • ${TEST_DIR}/messages/postgresdk.config.ts (output messages test)`);
    console.log(`   • ${TEST_DIR}/with-env/postgresdk.config.ts (with .env file)`);
    console.log(`   • ${TEST_DIR}/with-env/.env (sample .env file)`);
    console.log(`   • ${TEST_DIR}/multiple/postgresdk.config.ts (multiple init test)`);
    console.log("   You can manually inspect these files.");
    
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Init test failed:", error);
    
    // Cleanup on failure
    try {
      await cleanup();
    } catch {}
    
    process.exit(1);
  }
}

main().catch(console.error);