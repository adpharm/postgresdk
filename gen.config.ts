export default {
  connectionString: "postgres://user:pass@localhost:5432/testdb",
  schema: "public",
  outServer: "test/.results-jwt/server",
  outClient: "test/.results-jwt/client",
  softDeleteColumn: null,
  includeDepthLimit: 3,
  dateType: "date",
  auth: {
    strategy: "jwt-hs256",
    jwt: {
      sharedSecret: "test-secret-key-for-jwt",
      issuer: "test-app",
      audience: "test-client"
    }
  }
};