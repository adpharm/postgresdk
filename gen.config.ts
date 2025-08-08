export default {
  connectionString: "postgres://user:pass@localhost:5432/testdb",
  schema: "public",
  outServer: "test/.results/server",
  outClient: "test/.results/client",
  softDeleteColumn: null,
  includeDepthLimit: 3,
  dateType: "date"
};