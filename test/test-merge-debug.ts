#!/usr/bin/env bun

import { extractConfigFields, generateMergedConfig } from "../src/cli-config-utils";

// Test config content
const existingConfig = `export default {
  connectionString: process.env.CUSTOM_DB || "postgres://custom:custom@localhost:5432/customdb",
  schema: "custom_schema",
  outDir: { server: "./custom/server", client: "./custom/client" },
  softDeleteColumn: "archived_at",
  serverFramework: "hono",
};`;

console.log("Testing config field extraction and merge...\n");

// Extract fields
const fields = extractConfigFields(existingConfig);
console.log("Extracted fields:");
fields.forEach(field => {
  console.log(`  ${field.key}: ${field.value} (commented: ${field.isCommented})`);
});

console.log("\n=== Testing keep-existing strategy ===");
const keepExistingConfig = generateMergedConfig(fields, "keep-existing");

// Check for issues
const lines = keepExistingConfig.split('\n');
const connectionLine = lines.find(l => l.includes('connectionString:'));
console.log("Connection string line:", connectionLine);

// Check if fields are properly uncommented
['schema', 'outDir', 'softDeleteColumn', 'serverFramework'].forEach(key => {
  // Find the actual field line (not comment lines)
  const line = lines.find(l => {
    const trimmed = l.trim();
    return trimmed.startsWith(`${key}:`) || (trimmed.startsWith('//') && trimmed.substring(2).trim().startsWith(`${key}:`));
  });
  if (line) {
    const isCommented = line.trim().startsWith('//');
    console.log(`${key}: "${line.trim()}" (commented: ${isCommented})`);
  }
});

console.log("\n=== Testing interactive strategy with 'keep' choices ===");
const userChoices = new Map();
userChoices.set("connectionString", "keep");
userChoices.set("schema", "keep");
userChoices.set("outDir", "keep");
userChoices.set("softDeleteColumn", "keep");
userChoices.set("serverFramework", "keep");

const interactiveConfig = generateMergedConfig(fields, "interactive", userChoices);
const interactiveLines = interactiveConfig.split('\n');
const interactiveConnectionLine = interactiveLines.find(l => l.includes('connectionString:'));
console.log("Interactive connection string line:", interactiveConnectionLine);

// Check each field
['schema', 'outDir', 'softDeleteColumn', 'serverFramework'].forEach(key => {
  // Find the actual field line (not comment lines)
  const line = interactiveLines.find(l => {
    const trimmed = l.trim();
    return trimmed.startsWith(`${key}:`) || (trimmed.startsWith('//') && trimmed.substring(2).trim().startsWith(`${key}:`));
  });
  if (line) {
    const isCommented = line.trim().startsWith('//');
    console.log(`${key}: "${line.trim()}" (commented: ${isCommented})`);
  }
});

// ========== TEST MIGRATION FROM OLD FORMAT ==========
console.log("\n=== Testing migration from old outServer/outClient format ===");
const oldConfig = `export default {
  connectionString: process.env.DATABASE_URL || "postgres://localhost/mydb",
  outServer: "./old/server",
  outClient: "./old/client",
};`;

const oldFields = extractConfigFields(oldConfig);
console.log("Extracted fields from old config:");
oldFields.forEach(field => {
  console.log(`  ${field.key}: ${field.value}`);
});

const migratedConfig = generateMergedConfig(oldFields, "keep-existing");
const migratedLines = migratedConfig.split('\n');
const migratedOutDir = migratedLines.find(l => {
  const trimmed = l.trim();
  return trimmed.startsWith('outDir:');
});

console.log("Migrated outDir line:", migratedOutDir);
if (migratedOutDir && migratedOutDir.includes('{ server: "./old/server", client: "./old/client" }')) {
  console.log("✅ MIGRATION SUCCESS: Old config properly migrated to new outDir format");
} else {
  console.log("❌ MIGRATION FAILED: Old config not properly migrated");
}