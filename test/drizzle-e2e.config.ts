import type { Config } from "../src/types";

const config: Config = {
  connectionString: "postgres://user:pass@localhost:5432/drizzle_test",
  outServer: "test/.drizzle-e2e-results/server",
  outClient: "test/.drizzle-e2e-results/client",
  tests: {
    generate: true,
    output: "test/.drizzle-e2e-results/tests",
    framework: "vitest"
  },
  auth: {
    strategy: "none",
  },
};

export default config;