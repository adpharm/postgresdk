#!/usr/bin/env bun
/**
 * Test that the generator correctly generates tests alongside the SDK
 */

import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { promisify } from "node:util";
import { exec } from "node:child_process";

const execAsync = promisify(exec);
const CONTAINER_NAME = "postgresdk-test-db";

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

async function main() {
  console.log("📝 Testing test generation functionality...");
  console.log("==================================================\n");
  
  // Ensure database is running
  const isRunning = await isContainerRunning();
  if (!isRunning) {
    console.log("⚠️  PostgreSQL container is not running");
    await startPostgres();
  } else {
    console.log("✓ PostgreSQL container is already running");
  }

  // Clean up test results directory before running tests
  const outputDir = "test/.results-with-tests";
  if (existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }

  console.log("\n📦 Running generator with test generation enabled...");

  try {
    // Run the generator with test generation
    execSync("bun src/cli.ts generate -c test/test-with-tests.config.ts", {
      stdio: "inherit",
      cwd: process.cwd()
    });
    
    // Verify test files were created
    console.log("\n🔍 Verifying generated test files...");
    
    const expectedTestFiles = [
      "test/.results-with-tests/tests/setup.ts",
      "test/.results-with-tests/tests/docker-compose.yml",
      "test/.results-with-tests/tests/run-tests.sh",
      "test/.results-with-tests/tests/vitest.config.ts",
      "test/.results-with-tests/tests/.gitignore"
    ];
    
    let allFilesExist = true;
    for (const file of expectedTestFiles) {
      if (existsSync(file)) {
        console.log(`  ✓ ${file}`);
      } else {
        console.log(`  ✗ ${file} - MISSING`);
        allFilesExist = false;
      }
    }
    
    if (!allFilesExist) {
      console.error("\n❌ Some test files were not generated!");
      process.exit(1);
    }
    
    // Check for table test files
    console.log("\n🔍 Checking for table-specific test files...");
    const testDir = "test/.results-with-tests/tests";
    if (existsSync(testDir)) {
      const files = execSync(`ls ${testDir}/*.test.ts 2>/dev/null || true`, { encoding: 'utf-8' });
      const testFiles = files.trim().split('\n').filter(f => f);
      if (testFiles.length > 0 && testFiles[0] !== '') {
        console.log(`  ✓ Found ${testFiles.length} table test files`);
        testFiles.slice(0, 3).forEach(f => console.log(`    • ${f}`));
        if (testFiles.length > 3) {
          console.log(`    • ... and ${testFiles.length - 3} more`);
        }
      } else {
        console.log("  ⚠️  No table test files found");
      }
    }
    
    // Check that migration requirement is in place
    console.log("\n🔍 Verifying migration requirement in test script...");
    const scriptContent = existsSync("test/.results-with-tests/tests/run-tests.sh") 
      ? execSync("cat test/.results-with-tests/tests/run-tests.sh", { encoding: 'utf-8' })
      : "";
    
    if (scriptContent.includes("MIGRATION_COMMAND") && scriptContent.includes("SKIP_MIGRATIONS")) {
      console.log("  ✓ Migration requirement is properly configured");
    } else {
      console.log("  ⚠️  Migration requirement not found in test script");
    }
    
    console.log("\n==================================================");
    console.log("✅ Test generation completed successfully!");
    console.log("==================================================\n");
    
    console.log("📁 Generated test files in:");
    console.log("   • test/.results-with-tests/tests/");
    console.log("\n💡 To run the generated tests:");
    console.log("   1. chmod +x test/.results-with-tests/tests/run-tests.sh");
    console.log("   2. Configure migrations in the script");
    console.log("   3. ./test/.results-with-tests/tests/run-tests.sh");
    
  } catch (error) {
    console.error("\n❌ Test generation failed!");
    console.error(error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});