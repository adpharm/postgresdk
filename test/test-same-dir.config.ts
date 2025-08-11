export default {
  connectionString: "postgres://user:pass@localhost:5432/testdb",
  schema: "public",
  outServer: "./test/.results-same-dir/api",
  outClient: "./test/.results-same-dir/api",  // Same as server
  tests: {
    generate: true,
    output: "./test/.results-same-dir/api",  // Same as server/client
    framework: "vitest"
  }
};