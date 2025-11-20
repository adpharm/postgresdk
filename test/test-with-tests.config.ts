export default {
  connectionString: "postgres://user:pass@localhost:5432/testdb",
  schema: "public",
  outDir: {
    server: "./test/.results-with-tests/server",
    client: "./test/.results-with-tests/client"
  },
  tests: {
    generate: true,
    output: "./test/.results-with-tests/tests",
    framework: "vitest"
  }
};