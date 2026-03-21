export default {
  connectionString: "postgres://user:pass@localhost:5432/testdb",
  schema: "public",
  outDir: { server: "test/.results/server", client: "test/.results/client" },
  includeMethodsDepth: 3,
  tests: {
    generate: true,
    output: "test/.results/tests",
    framework: "vitest"
  }
};