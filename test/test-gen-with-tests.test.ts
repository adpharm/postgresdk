import { describe, test, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { TEST_PATHS, CLI_PATH, ensurePostgresRunning } from "./test-utils";

describe("Test generation functionality", () => {
  beforeAll(async () => {
    await ensurePostgresRunning();

    // Clean up test results directory before running tests
    const outputDir = TEST_PATHS.genWithTests;
    if (existsSync(outputDir)) {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  test("generates SDK with test files", async () => {
    console.log("Running generator with test generation enabled...");

    const configPath = join(__dirname, "test-with-tests.config.ts");
    execSync(`bun ${CLI_PATH} generate -c ${configPath}`, {
      stdio: "inherit",
      cwd: process.cwd()
    });

    // Verify test files were created
    console.log("Verifying generated test files...");

    const expectedTestFiles = [
      `${TEST_PATHS.genWithTests}/tests/setup.ts`,
      `${TEST_PATHS.genWithTests}/tests/docker-compose.yml`,
      `${TEST_PATHS.genWithTests}/tests/run-tests.sh`,
      `${TEST_PATHS.genWithTests}/tests/vitest.config.ts`,
      `${TEST_PATHS.genWithTests}/tests/.gitignore`
    ];

    for (const file of expectedTestFiles) {
      expect(existsSync(file)).toBe(true);
    }

    // Check for table test files
    const testDir = `${TEST_PATHS.genWithTests}/tests`;
    if (existsSync(testDir)) {
      const files = execSync(`ls ${testDir}/*.test.ts 2>/dev/null || true`, { encoding: 'utf-8' });
      const testFiles = files.trim().split('\n').filter(f => f);
      if (testFiles.length > 0 && testFiles[0] !== '') {
        console.log(`Found ${testFiles.length} table test files`);
      }
    }

    // Check that migration requirement is in place
    const scriptContent = existsSync(`${TEST_PATHS.genWithTests}/tests/run-tests.sh`)
      ? execSync(`cat ${TEST_PATHS.genWithTests}/tests/run-tests.sh`, { encoding: 'utf-8' })
      : "";

    expect(scriptContent.includes("MIGRATION_COMMAND")).toBe(true);
    expect(scriptContent.includes("SKIP_MIGRATIONS")).toBe(true);

  }, 60000);
});
