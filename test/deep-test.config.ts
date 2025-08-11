import type { PostgreSDKConfig } from "../src/config";

const config: PostgreSDKConfig = {
  database: {
    url: process.env.TEST_DATABASE_URL || "postgres://testuser:testpass@localhost:5432/testdb",
  },
  output: {
    server: "./test/deep/nested/server",
    client: "./test/deep/nested/client",
  },
  tests: {
    generate: true,
    output: "./test/deep/nested/tests",
    framework: "vitest",
  },
};

export default config;