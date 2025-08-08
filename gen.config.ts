export default {
  connectionString: "postgres://user:pass@localhost:5432/testdb",
  schema: "public",
  outServer: "gen/generated/server",
  outClient: "gen/generated/client",
  softDeleteColumn: null,
  includeDepthLimit: 3,
  dateType: "date"
};