import { describe, test, expect } from "vitest";
import { extractConfigFields, generateMergedConfig } from "../src/cli-config-utils";

describe("User config preservation tests", () => {
  test("preserves user's custom config when using keep-existing strategy", () => {
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
    fields.forEach((field) => {
      console.log(`  ${field.key}: ${field.value.includes("\n") ? "[complex block]" : field.value}`);
    });

    // Test keep-existing strategy (what user would choose)
    const mergedConfig = generateMergedConfig(fields, "keep-existing");

    // Check if the user's tests config is preserved exactly
    const hasUserTestsConfig =
      mergedConfig.includes("generate: true") &&
      mergedConfig.includes('output: "./api-generated"') &&
      mergedConfig.includes('framework: "bun"');

    console.log(`\nUser's tests config preserved: ${hasUserTestsConfig}`);

    expect(hasUserTestsConfig).toBe(true);

    if (!hasUserTestsConfig) {
      console.log(
        "\nGenerated config contains:",
        mergedConfig.slice(mergedConfig.indexOf("tests:"), mergedConfig.indexOf("tests:") + 200)
      );
    } else {
      console.log("\nSUCCESS: User's config is preserved exactly as they had it!");
    }
  });

  test("extracts all config fields correctly", () => {
    const userConfig = `export default {
  connectionString: "postgres://localhost/db",
  schema: "public",
  outServer: "./server",
  outClient: "./client",
};`;

    const fields = extractConfigFields(userConfig);

    expect(fields.length).toBeGreaterThan(0);
    expect(fields.some((f) => f.key === "connectionString")).toBe(true);
    expect(fields.some((f) => f.key === "schema")).toBe(true);
    expect(fields.some((f) => f.key === "outServer" || f.key === "outClient")).toBe(true);
  });

  test("handles complex nested objects", () => {
    const userConfig = `export default {
  auth: {
    strategy: "api-key",
    apiKeys: ["key1", "key2"]
  },
};`;

    const fields = extractConfigFields(userConfig);

    expect(fields.some((f) => f.key === "auth")).toBe(true);

    const mergedConfig = generateMergedConfig(fields, "keep-existing");
    expect(mergedConfig.includes('strategy: "api-key"')).toBe(true);
    expect(mergedConfig.includes("apiKeys:")).toBe(true);
  });
});
