export default {
  connectionString: "postgres://user:pass@localhost:5432/testdb",
  schema: "public",
  outDir: {
    server: "test/.results-enums/server",
    client: "test/.results-enums/client"
  },
  softDeleteColumn: null,
  includeMethodsDepth: 2
};