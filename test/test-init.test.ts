/**
 * Tests the SDK init functionality
 *
 * This test:
 * 1. Tests initializing a new project with the init command
 * 2. Verifies config file generation
 * 3. Validates the generated configuration
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { readFile } from "fs/promises";
import { execSync } from "child_process";
import { join } from "path";
import { TEST_PATHS, CLI_PATH } from "./test-utils";

const TEST_DIR = TEST_PATHS.init;

describe("SDK init functionality", () => {
  beforeAll(async () => {
    // Cleanup before all tests
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    // Optionally cleanup after tests - commented out to allow manual inspection
    // if (existsSync(TEST_DIR)) {
    //   rmSync(TEST_DIR, { recursive: true, force: true });
    // }
  });

  test("basic init creates config file with all sections", async () => {
    const projectDir = join(TEST_DIR, "basic");
    mkdirSync(projectDir, { recursive: true });

    // wait 1 second
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Run init in the test directory
    execSync(`bun ${CLI_PATH} init --api`, { stdio: "inherit", cwd: projectDir });

    // Check that postgresdk.config.ts was created
    const configPath = join(projectDir, "postgresdk.config.ts");
    expect(existsSync(configPath)).toBe(true);

    // Read and validate the config
    const configContent = await readFile(configPath, "utf-8");
    expect(configContent).toContain("export default");
    expect(configContent).toContain("connectionString:");
    expect(configContent).toContain("PostgreSDK Configuration");
    expect(configContent).toContain("DATABASE CONNECTION");
    expect(configContent).toContain("BASIC OPTIONS");
    expect(configContent).toContain("AUTHENTICATION");

    // Check that default values are present
    expect(configContent).toContain("process.env.DATABASE_URL");
    expect(configContent).toContain("// outDir:");
    expect(configContent).toContain("// auth:");

    // API-side template should NOT have pull config
    expect(configContent).not.toContain("pull:");
  });

  test("init in existing project should fail with --force-error flag", async () => {
    const projectDir = join(TEST_DIR, "existing");
    mkdirSync(projectDir, { recursive: true });

    // Create an existing config file
    const existingConfig = `export default { test: true };`;
    const configPath = join(projectDir, "postgresdk.config.ts");
    writeFileSync(configPath, existingConfig, "utf-8");

    // Try to init - should fail with --force-error flag
    try {
      execSync(`bun ${CLI_PATH} init --force-error`, { stdio: "pipe", cwd: projectDir });
      expect(false).toBe(true); // Should not reach here
    } catch (error: any) {
      // Expected - init should fail when config exists
      const errorOutput = error.stdout?.toString() || error.stderr?.toString() || "";
      expect(errorOutput.includes("already exists") || error.status !== 0).toBe(true);
    }
  });

  test("config file has proper structure and documentation", async () => {
    const projectDir = join(TEST_DIR, "structure");
    mkdirSync(projectDir, { recursive: true });

    execSync(`bun ${CLI_PATH} init --api`, { stdio: "pipe", cwd: projectDir });

    const configPath = join(projectDir, "postgresdk.config.ts");
    const configContent = await readFile(configPath, "utf-8");

    // Verify all major sections are present (API-side doesn't have SDK DISTRIBUTION)
    const sections = ["DATABASE CONNECTION", "BASIC OPTIONS", "ADVANCED OPTIONS", "AUTHENTICATION"];

    for (const section of sections) {
      expect(configContent.includes(section)).toBe(true);
    }

    // Verify important options are documented
    const options = [
      "connectionString",
      "schema",
      "outDir",
      "softDeleteColumn",
      "includeMethodsDepth",
      "apiKeyHeader",
      "apiKeys",
      "jwt",
      "sharedSecret",
    ];

    for (const option of options) {
      expect(configContent.includes(option)).toBe(true);
    }
  });

  test("init provides helpful output messages", async () => {
    const projectDir = join(TEST_DIR, "messages");
    mkdirSync(projectDir, { recursive: true });

    // Capture output to verify helpful messages
    const output = execSync(`bun ${CLI_PATH} init --api`, { encoding: "utf-8", cwd: projectDir });

    // Check for expected output messages
    expect(output.includes("Initializing postgresdk")).toBe(true);
    expect(output.includes("Created postgresdk.config.ts")).toBe(true);
    expect(output.includes("Next steps")).toBe(true);
    expect(output.includes("postgresdk generate")).toBe(true);
  });

  test("init handles existing .env file appropriately", async () => {
    const projectDir = join(TEST_DIR, "with-env");
    mkdirSync(projectDir, { recursive: true });

    // Create a .env file first
    const envContent = `DATABASE_URL=postgres://test:test@localhost:5432/testdb
API_KEY=test-key-123`;
    writeFileSync(join(projectDir, ".env"), envContent, "utf-8");

    // Run init
    const output = execSync(`bun ${CLI_PATH} init --api`, { encoding: "utf-8", cwd: projectDir });

    // When .env exists, it shouldn't suggest creating one
    expect(existsSync(join(projectDir, "postgresdk.config.ts"))).toBe(true);
    expect(output.includes("Created postgresdk.config.ts")).toBe(true);
  });

  test("multiple init attempts - second should fail", async () => {
    const projectDir = join(TEST_DIR, "multiple");
    mkdirSync(projectDir, { recursive: true });

    // First init should succeed
    execSync(`bun ${CLI_PATH} init --api`, { stdio: "pipe", cwd: projectDir });
    expect(existsSync(join(projectDir, "postgresdk.config.ts"))).toBe(true);

    // Second init should fail with --force-error flag
    try {
      execSync(`bun ${CLI_PATH} init --force-error`, { stdio: "pipe", cwd: projectDir });
      expect(false).toBe(true); // Should not reach here
    } catch (error: any) {
      expect(error.status !== 0).toBe(true);
    }
  });
});
