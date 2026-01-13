#!/usr/bin/env bun

import { test, expect } from "bun:test";
import { extractConfigFields, generateMergedConfig } from "../src/cli-config-utils";

test("extractConfigFields extracts pullToken", () => {
  const configContent = `
export default {
  connectionString: process.env.DATABASE_URL,
  pullToken: "env:POSTGRESDK_PULL_TOKEN",
};
  `;

  const fields = extractConfigFields(configContent);
  const pullTokenField = fields.find(f => f.key === "pullToken");

  expect(pullTokenField).toBeDefined();
  expect(pullTokenField?.value).toBe('"env:POSTGRESDK_PULL_TOKEN"');
  expect(pullTokenField?.isCommented).toBe(false);
});

test("extractConfigFields extracts commented pullToken", () => {
  const configContent = `
export default {
  connectionString: process.env.DATABASE_URL,
  // pullToken: "env:POSTGRESDK_PULL_TOKEN",
};
  `;

  const fields = extractConfigFields(configContent);
  const pullTokenField = fields.find(f => f.key === "pullToken");

  expect(pullTokenField).toBeDefined();
  expect(pullTokenField?.isCommented).toBe(true);
});

test("generateMergedConfig includes pullToken in template", () => {
  const existingFields = [
    {
      key: "connectionString",
      value: 'process.env.DATABASE_URL',
      description: "PostgreSQL connection string",
      isRequired: true,
      isCommented: false
    }
  ];

  const merged = generateMergedConfig(existingFields, "keep-existing");

  // Should contain pullToken in the generated config
  expect(merged).toContain("pullToken");
  expect(merged).toContain("SDK ENDPOINT PROTECTION");
  expect(merged).toContain("env:POSTGRESDK_PULL_TOKEN");
});

test("generateMergedConfig keeps existing pullToken value", () => {
  const existingFields = [
    {
      key: "connectionString",
      value: 'process.env.DATABASE_URL',
      description: "PostgreSQL connection string",
      isRequired: true,
      isCommented: false
    },
    {
      key: "pullToken",
      value: '"env:MY_CUSTOM_TOKEN"',
      description: "Token for protecting /_psdk/* endpoints",
      isCommented: false
    }
  ];

  const merged = generateMergedConfig(existingFields, "keep-existing");

  // Should preserve the custom value
  expect(merged).toContain('pullToken: "env:MY_CUSTOM_TOKEN"');
});

test("pull block default uses pullToken not token", () => {
  const existingFields = [
    {
      key: "connectionString",
      value: 'process.env.DATABASE_URL',
      description: "PostgreSQL connection string",
      isRequired: true,
      isCommented: false
    }
  ];

  const merged = generateMergedConfig(existingFields, "use-defaults");

  // Should have pullToken in pull block, not token
  expect(merged).toContain("pullToken:");
  expect(merged).not.toContain("token: process.env.API_TOKEN");
});
