#!/usr/bin/env bun

import { extractConfigFields, generateMergedConfig } from "../src/cli-config-utils";

// Simulate the user's exact config that was getting overwritten
const userConfig = `export default {
  connectionString: process.env.DATABASE_URL || "postgres://user:pass@localhost:5432/mydb",
  schema: "public",
  outServer: "./api/server",
  outClient: "./api/client",
  tests: {
    generate: true,
    output: "./api-generated",
    framework: "bun", // or "jest" or "bun"
  },
};`;

console.log("Testing user's config preservation...");

const fields = extractConfigFields(userConfig);
console.log("\nExtracted fields:");
fields.forEach(field => {
  console.log(`  ${field.key}: ${field.value.includes('\n') ? '[complex block]' : field.value}`);
});

// Test keep-existing strategy (what user would choose)
const mergedConfig = generateMergedConfig(fields, "keep-existing");

// Check if the user's tests config is preserved exactly
const hasUserTestsConfig = mergedConfig.includes('generate: true') && 
                          mergedConfig.includes('output: "./api-generated"') && 
                          mergedConfig.includes('framework: "bun"');

console.log(`\n✅ User's tests config preserved: ${hasUserTestsConfig}`);

if (!hasUserTestsConfig) {
  console.log("\n❌ FAILURE: User's config was overwritten");
  console.log("Generated config contains:", mergedConfig.slice(mergedConfig.indexOf('tests:'), mergedConfig.indexOf('tests:') + 200));
} else {
  console.log("\n🎉 SUCCESS: User's config is preserved exactly as they had it!");
}