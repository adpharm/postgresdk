export default {
  connectionString: "postgres://user:pass@localhost:5432/testdb",
  schema: "public",
  outServer: "./test/.results-with-tests/server",
  outClient: "./test/.results-with-tests/client",
  tests: {
    generate: true,
    output: "./test/.results-with-tests/tests",
    framework: "vitest"
  }
};