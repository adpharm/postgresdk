import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run tests sequentially to avoid port conflicts and shared database issues
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    sequence: {
      shuffle: false,
    },
    // Timeout for long-running tests (generation, docker startup, etc.)
    testTimeout: 120000,
    hookTimeout: 30000,
    // Show more detailed output
    reporters: ["verbose"],
    // Include test files
    include: ["test/**/*.test.ts"],
    // Setup file for global test utilities
    setupFiles: ["./test/setup.ts"],
  },
});
