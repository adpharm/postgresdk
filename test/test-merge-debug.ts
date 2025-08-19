#!/usr/bin/env bun

import { extractConfigFields, generateMergedConfig } from "../src/cli-config-utils";

// Test config content
const existingConfig = `export default {
  connectionString: process.env.CUSTOM_DB || "postgres://custom:custom@localhost:5432/customdb",
  schema: "custom_schema",
  outServer: "./custom/server",
  outClient: "./custom/client",
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
['schema', 'outServer', 'outClient', 'softDeleteColumn', 'serverFramework'].forEach(key => {
  const line = lines.find(l => l.includes(`${key}:`));
  if (line) {
    const isCommented = line.trim().startsWith('//');
    console.log(`${key}: "${line.trim()}" (commented: ${isCommented})`);
  }
});

console.log("\n=== Testing interactive strategy with 'keep' choices ===");
const userChoices = new Map();
userChoices.set("connectionString", "keep");
userChoices.set("schema", "keep");
userChoices.set("outServer", "keep");
userChoices.set("outClient", "keep");
userChoices.set("softDeleteColumn", "keep");
userChoices.set("serverFramework", "keep");

const interactiveConfig = generateMergedConfig(fields, "interactive", userChoices);
const interactiveLines = interactiveConfig.split('\n');
const interactiveConnectionLine = interactiveLines.find(l => l.includes('connectionString:'));
console.log("Interactive connection string line:", interactiveConnectionLine);

// Check each field
['schema', 'outServer', 'outClient', 'softDeleteColumn', 'serverFramework'].forEach(key => {
  const line = interactiveLines.find(l => l.includes(`${key}:`));
  if (line) {
    const isCommented = line.trim().startsWith('//');
    console.log(`${key}: "${line.trim()}" (commented: ${isCommented})`);
  }
});