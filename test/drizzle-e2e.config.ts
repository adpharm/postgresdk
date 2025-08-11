import type { Config } from "../src/types";

const config: Config = {
  dbUrl: "postgres://user:pass@localhost:5432/drizzle_test",
  outputDir: "test/.drizzle-e2e-results",
  generateTests: true,
  auth: {
    strategy: "none",
  },
};

export default config;