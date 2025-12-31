// This config is used by test-gen-with-tests.test.ts
export default {
  connectionString: "postgres://user:pass@localhost:5432/testdb",
  schema: "public",
  outDir: {
    server: "./test/.test-output/gen-with-tests/server",
    client: "./test/.test-output/gen-with-tests/client"
  },
  tests: {
    generate: true,
    output: "./test/.test-output/gen-with-tests/tests",
    framework: "vitest"
  }
};