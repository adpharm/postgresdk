#!/usr/bin/env bun
/**
 * Test the API contract generation and endpoints
 */

import { readFileSync, existsSync, rmSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const TEST_DIR = "test/.contract-test";
const CONFIG_PATH = join(TEST_DIR, "config.ts");

// Clean up from previous runs
if (existsSync(TEST_DIR)) {
  rmSync(TEST_DIR, { recursive: true });
}

// Create test config
execSync(`mkdir -p ${TEST_DIR}`);

const config = `export default {
  connectionString: "postgres://user:pass@localhost:5432/testdb",
  schema: "public",
  outServer: "${join(TEST_DIR, "server")}",
  outClient: "${join(TEST_DIR, "client")}",
  auth: {
    apiKey: "test-key-123"
  }
};`;

console.log("📝 Writing test config...");
execSync(`echo '${config}' > ${CONFIG_PATH}`);

// Run generator
console.log("🔨 Generating API with contract...");
try {
  execSync(`bun src/cli.ts generate -c ${CONFIG_PATH}`, { stdio: "inherit" });
} catch (e) {
  console.error("Generation failed - make sure test database is running");
  process.exit(1);
}

// Check that contract file was generated
const contractPath = join(TEST_DIR, "server", "api-contract.ts");
if (!existsSync(contractPath)) {
  console.error("❌ API contract file was not generated!");
  process.exit(1);
}

console.log("✅ API contract file generated");

// Read and validate contract content
const contractContent = readFileSync(contractPath, "utf-8");

// Check for expected content
const checks = [
  { name: "API contract export", pattern: /export const apiContract = / },
  { name: "Markdown export", pattern: /export const apiContractMarkdown = / },
  { name: "Contract helper function", pattern: /export function getApiContract/ },
  { name: "Version field", pattern: /"version":\s*"1\.0\.0"/ },
  { name: "Resources array", pattern: /"resources":\s*\[/ },
  { name: "Authentication info", pattern: /"authentication":\s*{/ },
  { name: "Endpoints description", pattern: /"endpoints":\s*\[/ },
];

let allPassed = true;
for (const check of checks) {
  if (contractContent.match(check.pattern)) {
    console.log(`✅ ${check.name} found`);
  } else {
    console.log(`❌ ${check.name} missing`);
    allPassed = false;
  }
}

// Check router includes contract endpoints
const routerPath = join(TEST_DIR, "server", "router.ts");
const routerContent = readFileSync(routerPath, "utf-8");

const routerChecks = [
  { name: "Contract import", pattern: /import { getApiContract }/ },
  { name: "JSON endpoint", pattern: /router\.get\("\/api\/contract\.json"/ },
  { name: "Markdown endpoint", pattern: /router\.get\("\/api\/contract\.md"/ },
  { name: "Flexible format endpoint", pattern: /router\.get\("\/api\/contract"/ },
];

for (const check of routerChecks) {
  if (routerContent.match(check.pattern)) {
    console.log(`✅ Router: ${check.name} found`);
  } else {
    console.log(`❌ Router: ${check.name} missing`);
    allPassed = false;
  }
}

// Clean up
console.log("\n🧹 Cleaning up test files...");
rmSync(TEST_DIR, { recursive: true });

if (allPassed) {
  console.log("\n🎉 All API contract tests passed!");
  process.exit(0);
} else {
  console.log("\n❌ Some API contract tests failed");
  process.exit(1);
}