#!/usr/bin/env bun

import { extractConfigFields, generateMergedConfig } from "../src/cli-config-utils";

// Test with a config that has trailing comma (common in real configs)
const configWithComma = `export default {
  connectionString: process.env.CUSTOM_DB || "postgres://custom:custom@localhost:5432/customdb",
  schema: "custom_schema",
};`;

console.log("Testing config with trailing comma:");
const fields = extractConfigFields(configWithComma);
const connField = fields.find(f => f.key === "connectionString");
console.log("Extracted connectionString value:", connField?.value);

// Test interactive mode
const userChoices = new Map();
userChoices.set("connectionString", "keep");
userChoices.set("schema", "keep");

const result = generateMergedConfig(fields, "interactive", userChoices);
const lines = result.split('\n');
const connLine = lines.find(l => l.includes('connectionString:') && !l.includes('*'));
console.log("\nGenerated connectionString line:", connLine);