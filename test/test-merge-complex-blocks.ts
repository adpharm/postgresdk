#!/usr/bin/env bun

import { extractConfigFields, generateMergedConfig } from "../src/cli-config-utils";

// Test config with complex blocks that should be preserved
const configWithComplexBlocks = `export default {
  connectionString: process.env.DATABASE_URL || "postgres://test:test@localhost:5432/testdb",
  schema: "public",
  tests: {
    generate: true,
    output: "./api-generated",
    framework: "bun", // or "jest" or "bun"
  },
  auth: {
    strategy: "api-key",
    apiKeys: [
      process.env.API_KEY_1,
      process.env.API_KEY_2,
    ],
  },
  pull: {
    from: "https://api.myapp.com",
    output: "./src/sdk",
    token: process.env.API_TOKEN,
  },
};`;

console.log("Testing complex block preservation...\n");

// Extract fields
const fields = extractConfigFields(configWithComplexBlocks);
console.log("Extracted fields:");
fields.forEach(field => {
  console.log(`  ${field.key}: ${field.value} (commented: ${field.isCommented})`);
});

console.log("\n=== Testing keep-existing strategy ===");
const keepExistingConfig = generateMergedConfig(fields, "keep-existing");

// Check if complex blocks are preserved
const hasCompleteTestsBlock = keepExistingConfig.includes('generate: true') && 
                              keepExistingConfig.includes('output: "./api-generated"') && 
                              keepExistingConfig.includes('framework: "bun"');

const hasCompleteAuthBlock = keepExistingConfig.includes('strategy: "api-key"') && 
                             keepExistingConfig.includes('process.env.API_KEY_1');

const hasCompletePullBlock = keepExistingConfig.includes('from: "https://api.myapp.com"') && 
                             keepExistingConfig.includes('process.env.API_TOKEN');

console.log("Complex block preservation test results:");
console.log(`  Tests block complete: ${hasCompleteTestsBlock}`);
console.log(`  Auth block complete: ${hasCompleteAuthBlock}`);
console.log(`  Pull block complete: ${hasCompletePullBlock}`);

if (!hasCompleteTestsBlock || !hasCompleteAuthBlock || !hasCompletePullBlock) {
  console.log("\n❌ FAILURE: Complex blocks were not preserved properly");
  console.log("\nGenerated config:");
  console.log(keepExistingConfig);
  process.exit(1);
} else {
  console.log("\n✅ SUCCESS: All complex blocks preserved correctly");
}