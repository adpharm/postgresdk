/**
 * PostgreSDK Example Configuration
 *
 * This file demonstrates all available configuration options for postgresdk.
 * Copy this file to your project as 'postgresdk.config.ts' and customize as needed.
 *
 * Environment variables are automatically loaded from .env files when using Node.js.
 * For Bun, environment variables are loaded automatically without dotenv.
 */

import type { Config } from "./src/types";

export default {
  // ========== DATABASE CONNECTION (Required) ==========

  /**
   * PostgreSQL connection string
   * Format: postgres://user:password@host:port/database
   *
   * This is the only required configuration option.
   */
  connectionString: process.env.DATABASE_URL || "postgres://user:password@localhost:5432/mydb",

  // ========== BASIC OPTIONS ==========

  /**
   * Database schema to introspect
   * @default "public"
   */
  schema: "public",

  /**
   * Output directory for generated code
   *
   * Simple usage (same directory for both):
   *   outDir: "./api"
   *
   * Separate directories for client and server:
   *   outDir: { client: "./sdk", server: "./api" }
   *
   * Note: If client and server paths are the same,
   * the client SDK will be placed in an 'sdk' subdirectory.
   *
   * @default { client: "./api/client", server: "./api/server" }
   */
  outDir: { client: "./api/client", server: "./api/server" },

  // ========== ADVANCED OPTIONS ==========

  /**
   * Column name for soft deletes. When set, DELETE operations will update
   * this column with the current timestamp instead of removing rows.
   * The column must exist in your tables and be of timestamp/datetime type.
   *
   * Soft-deleted rows are automatically excluded from GET and LIST operations.
   * @default null (hard deletes)
   * @example "deleted_at"
   * @example "deleted"
   */
  softDeleteColumn: null,

  /**
   * Maximum depth for generating typed include methods to prevent infinite loops
   * and control code generation complexity. 
   *
   * With depth 2, you get methods like:
   *   - listWithAuthor()
   *   - listWithBooksAndTags()
   *   - getByPkWithAuthor()
   * 
   * Higher depths generate more methods but can lead to very large type files.
   *
   * @default 2
   */
  includeMethodsDepth: 2,

  /**
   * Whether to skip junction tables when generating include methods.
   * Junction tables (many-to-many relationship tables) are often not needed
   * in include methods since they're just linking tables.
   *
   * @default true
   */
  skipJunctionTables: true,

  /**
   * How to handle date/timestamp columns in TypeScript
   * - "date": Use JavaScript Date objects (better for manipulation)
   * - "string": Use ISO 8601 strings (better for JSON serialization)
   *
   * This affects both server and client TypeScript types.
   * @default "date"
   */
  dateType: "date",

  /**
   * Server framework for generated API routes
   *
   * Currently supported:
   * - "hono" - Lightweight, edge-compatible web framework (default)
   *
   * Planned support:
   * - "express" - Traditional Node.js framework
   * - "fastify" - High-performance Node.js framework
   *
   * @default "hono"
   */
  serverFramework: "hono",

  /**
   * API path prefix for all table routes
   *
   * Controls the URL prefix for data endpoints. For example:
   * - "/v1" → /v1/users, /v1/posts (default)
   * - "" → /users, /posts (no prefix)
   * - "/api/v2" → /api/v2/users, /api/v2/posts (custom prefix)
   *
   * Note: Special endpoints (SDK distribution, contract) are always at /_psdk/*
   * regardless of this setting.
   *
   * @default "/v1"
   */
  apiPathPrefix: "/v1",

  /**
   * Use .js extensions in server-side imports for compatibility with runtimes
   * that require explicit file extensions (e.g., Vercel Edge, Deno).
   *
   * When true, server imports will be:
   *   import { something } from "./module.js"
   * Instead of:
   *   import { something } from "./module"
   *
   * Note: This is particularly useful when serverFramework is "hono" and
   * deploying to Vercel Edge or similar platforms.
   *
   * @default false
   */
  useJsExtensions: false,

  /**
   * Use .js extensions in client SDK imports. Most bundlers (Webpack, Vite, etc.)
   * handle module resolution automatically, so this is rarely needed.
   *
   * Enable this if your client environment requires explicit extensions.
   *
   * @default false
   */
  useJsExtensionsClient: false,

  // ========== TEST GENERATION ==========

  /**
   * Test generation configuration
   *
   * Generates basic SDK tests to get you started quickly.
   * These tests demonstrate CRUD operations for each table.
   * Add your own business logic tests in separate files.
   */
  tests: {
    /**
     * Generate test files
     * @default false
     */
    generate: false,

    /**
     * Output directory for tests
     * Note: If same as server or client directory, tests will be placed in a 'tests' subdirectory.
     * @default "./api/tests"
     */
    output: "./api/tests",

    /**
     * Test framework to use
     * - "vitest": Modern, Vite-based test runner (recommended)
     * - "jest": Traditional test runner
     * - "bun": Bun's built-in test runner
     * @default "vitest"
     */
    framework: "vitest",
  },

  // ========== AUTHENTICATION ==========

  /**
   * Authentication configuration for your API
   *
   * Three strategies are supported:
   * 1. "none" - No authentication (default)
   * 2. "api-key" - API key authentication via header
   * 3. "jwt-hs256" - JWT authentication with HS256 algorithm
   *
   * === Simple syntax examples ===
   *
   * Single API key:
   *   auth: { apiKey: process.env.API_KEY }
   *
   * Multiple API keys:
   *   auth: { apiKeys: [process.env.KEY1, process.env.KEY2] }
   *
   * JWT with just a secret:
   *   auth: { jwt: process.env.JWT_SECRET }
   *
   * === Full syntax for advanced options ===
   */
  auth: {
    // ===== For API Key authentication =====

    /**
     * HTTP header name where the API key is expected
     * @default "x-api-key"
     */
    apiKeyHeader: "x-api-key",

    /**
     * List of valid API keys. Can include:
     * - Direct string values
     * - Environment variable references with "env:" prefix
     *
     * Example with env reference:
     *   apiKeys: ["env:API_KEY_LIST"]
     * Where API_KEY_LIST="key1,key2,key3" (comma-separated)
     */
    apiKeys: [
      process.env.API_KEY_1!,
      process.env.API_KEY_2!,
      "hardcoded-key-for-testing",
      // "env:API_KEY_LIST"  // Reads comma-separated keys from env var
    ],

    // ===== For JWT (HS256) authentication =====

    /**
     * JWT configuration for multi-service token validation
     *
     * Each service is identified by its issuer claim and has its own secret.
     * This allows multiple services to authenticate with different credentials.
     *
     * Secrets can use "env:" prefix to read from environment variables.
     */
    jwt: {
      /**
       * Array of services that can authenticate with this API
       * Each service must include an 'iss' claim in its JWT matching the issuer
       */
      services: [
        {
          issuer: "web-app",
          secret: "env:WEB_APP_JWT_SECRET",  // REQUIRED: Use "env:" prefix
        },
        {
          issuer: "lambda-service",
          secret: "env:LAMBDA_JWT_SECRET",  // Generator converts to: process.env.LAMBDA_JWT_SECRET
        },
        {
          issuer: "mobile-app",
          secret: "env:MOBILE_JWT_SECRET",  // DO NOT use process.env.X in config - it hardcodes!
        },
      ],

      /**
       * Expected audience claim ('aud') in the JWT
       * Applied to all services. Tokens with different audience will be rejected.
       * @optional
       */
      audience: "my-api",
    },
  },

  // ========== SDK ENDPOINT PROTECTION ==========

  /**
   * Authentication token for protecting /_psdk/* endpoints (SDK distribution and contract endpoints)
   *
   * When set, all /_psdk/* routes require this token via Authorization header.
   * If not set, /_psdk/* endpoints are publicly accessible.
   *
   * Use "env:" prefix to read from environment variables:
   *   pullToken: "env:POSTGRESDK_PULL_TOKEN"
   *
   * This is separate from the main auth strategy (JWT/API key) used for CRUD operations.
   *
   * @optional
   */
  pullToken: "env:POSTGRESDK_PULL_TOKEN",

  // ========== SDK DISTRIBUTION (Pull Configuration) ==========

  /**
   * Configuration for pulling SDK from a remote API
   * Used when running 'postgresdk pull' command in client applications
   *
   * This allows you to:
   * 1. Generate SDK on your server
   * 2. Serve it via your API at /sdk endpoint
   * 3. Pull it into client apps with 'postgresdk pull'
   */
  pull: {
    /**
     * API URL to pull SDK from
     * Your API should serve the SDK at {from}/sdk endpoint
     */
    from: "https://api.myapp.com",

    /**
     * Local directory where pulled SDK will be saved
     * @default "./src/sdk"
     */
    output: "./src/sdk",

    /**
     * Authentication token for pulling SDK from protected endpoints
     * The token will be sent as 'Authorization: Bearer {pullToken}' header
     *
     * Should match the server's root-level pullToken configuration.
     *
     * Use "env:" prefix to read from environment variables:
     *   pullToken: "env:POSTGRESDK_PULL_TOKEN"
     *
     * @optional
     */
    pullToken: "env:POSTGRESDK_PULL_TOKEN",
  },
} satisfies Config;

/**
 * === Configuration Examples ===
 *
 * 1. Minimal configuration (just database):
 *
 * export default {
 *   connectionString: process.env.DATABASE_URL
 * };
 *
 *
 * 2. API with simple API key auth:
 *
 * export default {
 *   connectionString: process.env.DATABASE_URL,
 *   auth: { apiKey: process.env.API_KEY }
 * };
 *
 *
 * 3. Full-featured configuration with JWT:
 *
 * export default {
 *   connectionString: process.env.DATABASE_URL,
 *   schema: "app",
 *   outDir: { client: "./src/generated/client", server: "./src/generated/server" },
 *   softDeleteColumn: "deleted_at",
 *   includeMethodsDepth: 2,
 *   dateType: "string",
 *   auth: {
 *     jwt: {
 *       services: [
 *         { issuer: "my-saas-app", secret: "env:JWT_SECRET" }
 *       ],
 *       audience: "customers"
 *     }
 *   }
 * };
 *
 *
 * 4. Vercel Edge deployment:
 *
 * export default {
 *   connectionString: process.env.DATABASE_URL,
 *   serverFramework: "hono",  // Hono works great on edge
 *   useJsExtensions: true,    // Required for Vercel Edge
 *   dateType: "string",       // Better for JSON serialization
 *   auth: { apiKey: process.env.API_KEY }
 * };
 *
 *
 * 5. Configuration with test generation:
 *
 * export default {
 *   connectionString: process.env.DATABASE_URL,
 *   tests: {
 *     generate: true,
 *     output: "./tests/generated",
 *     framework: "vitest"
 *   }
 * };
 *
 *
 * 6. Client-side configuration (for pulling SDK):
 *
 * export default {
 *   pull: {
 *     from: "https://api.myapp.com",
 *     output: "./src/sdk",
 *     pullToken: "env:POSTGRESDK_PULL_TOKEN"  // Use "env:" prefix for env vars
 *   }
 * };
 */
