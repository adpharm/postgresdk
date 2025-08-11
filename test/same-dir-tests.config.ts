import type { PostgreSDKConfig } from "../src/config";

const config: PostgreSDKConfig = {
  database: {
    url: process.env.TEST_DATABASE_URL || "postgres://testuser:testpass@localhost:5432/testdb",
  },
  output: {
    server: "./test/.same-dir-test",
    client: "./test/.same-dir-test",
  },
  tests: {
    generate: true,
    output: "./test/.same-dir-test",
    framework: "vitest",
  },
};

export default config;