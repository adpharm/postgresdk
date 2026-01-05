import type { Config } from "../src/types";

const config: Config = {
  connectionString: "postgres://user:pass@localhost:5432/drizzle_test",
  outDir: {
    server: "test/.drizzle-e2e-results/server",
    client: "test/.drizzle-e2e-results/client"
  },
  tests: {
    generate: true,
    output: "test/.drizzle-e2e-results/tests",
    framework: "vitest"
  },
};

export default config;