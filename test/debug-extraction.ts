#!/usr/bin/env bun

import { extractConfigFields } from "../src/cli-config-utils";

const configWithTests = `export default {
  connectionString: process.env.DATABASE_URL || "postgres://test:test@localhost:5432/testdb",
  tests: {
    generate: true,
    output: "./api-generated",
    framework: "bun", // or "jest" or "bun"
  },
  schema: "public",
};`;

console.log("Debug: Config content:");
console.log(configWithTests);
console.log("\nDebug: Looking for tests block...");

// Test the regex manually
const testsRegex = /^\s*(\/\/)?\s*tests:\s*\{/m;
const match = configWithTests.match(testsRegex);
console.log("Regex match:", match);

// Test extraction
const fields = extractConfigFields(configWithTests);
console.log("\nExtracted fields:");
fields.forEach(field => {
  console.log(`  ${field.key}: ${field.value}`);
});