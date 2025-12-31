export default {
  connectionString: "postgres://user:pass@localhost:5432/testdb",
  schema: "public",
  outDir: {
    server: "test/.test-output/enums/server",
    client: "test/.test-output/enums/client"
  },
  softDeleteColumn: null,
  includeMethodsDepth: 2
};