export interface AuthConfig {
  /** Header to read the API key from. @default "x-api-key" */
  apiKeyHeader?: string;
  /** Accepted API keys. A value may use the `"env:MY_KEY_LIST"` form to read a comma-separated list from the environment. */
  apiKeys?: string[];
  /** JWT (HS256) verification config. Its presence selects the JWT auth strategy. */
  jwt?: {
    services: Array<{
      /** Identifies the calling service. Must match the JWT `iss` claim. */
      issuer: string;
      /**
       * Signing secret. MUST use the `"env:VAR_NAME"` form (e.g. `"env:JWT_SECRET"`).
       *
       * SECURITY: never inline `process.env.X` or a literal secret here. The generator
       * rewrites `"env:JWT_SECRET"` to `process.env.JWT_SECRET` in the generated code.
       */
      secret: string;
    }>;
    /** When set, validates the JWT `aud` claim. */
    audience?: string;
  };
}

// Helper to infer auth strategy from config
export function getAuthStrategy(auth: AuthConfig | undefined): "none" | "api-key" | "jwt-hs256" {
  if (!auth) return "none";
  if (auth.jwt) return "jwt-hs256";
  if (auth.apiKeys && auth.apiKeys.length > 0) return "api-key";
  return "none";
}

/**
 * Simplified auth syntax. Either a full {@link AuthConfig}, or an API-key shorthand
 * (`{ apiKey: "..." }`) that is normalized to a full config by {@link normalizeAuthConfig}.
 */
export type AuthConfigInput = AuthConfig | {
  /** Shorthand for a single API key. Merged into `apiKeys`. */
  apiKey?: string;
  /** Additional accepted API keys. */
  apiKeys?: string[];
  /** Header to read the API key from. @default "x-api-key" */
  apiKeyHeader?: string;
}

export interface DeleteConfig {
  /** Column name for soft deletes (e.g. `"deleted_at"`). Absence means hard deletes only. */
  softDeleteColumn?: string;
  /** Whether to also expose `hardDelete` when soft delete is configured. @default true */
  exposeHardDelete?: boolean;
  /** Per-table overrides. Use `null` to disable soft delete for a specific table. */
  softDeleteColumnOverrides?: Record<string, string | null>;
}

export interface Config {
  /**
   * Postgres connection string used to introspect the schema
   * (e.g. `"postgres://user:pass@host:5432/db"`). Read it from an env var in real configs.
   */
  connectionString: string;

  /** Postgres schema to introspect. @default "public" */
  schema?: string;

  /**
   * Where generated code is written. A single string is used for both server and client
   * (the client SDK lands in an `sdk/` subdirectory); an object sets each separately.
   * @default { client: "./api/client", server: "./api/server" }
   */
  outDir?: string | { client: string; server: string };

  /** Soft/hard delete behavior. */
  delete?: DeleteConfig;

  /**
   * How numeric columns are typed. `"auto"` maps `int2`/`int4` → `number`
   * and `int8`/`numeric` → `string` (to avoid precision loss). @default "auto"
   */
  numericMode?: "string" | "number" | "auto";

  /** How deep to generate eager-loading `include` helper methods. @default 2 */
  includeMethodsDepth?: number;

  /** Skip junction (M:N) tables when generating include methods. @default true */
  skipJunctionTables?: boolean;

  /**
   * Server framework for the generated routes. Only `"hono"` is implemented today;
   * `"express"`/`"fastify"` are reserved. @default "hono"
   */
  serverFramework?: "hono" | "express" | "fastify";

  /** Path prefix for the generated table routes. @default "/v1" */
  apiPathPrefix?: string;

  /** Maximum allowed value for the `limit` parameter in list operations. Set to `0` to disable the cap. @default 1000 */
  maxLimit?: number;

  /** API authentication. Omit for no auth. Accepts the API-key shorthand or a full {@link AuthConfig}. */
  auth?: AuthConfigInput;

  /**
   * Token protecting the `/_psdk/*` SDK-distribution endpoints. Use the `"env:VAR_NAME"` form.
   * If unset, those endpoints are public.
   */
  pullToken?: string;

  /** Pull configuration for client repos that consume a generated SDK over HTTP. */
  pull?: PullConfig;

  /** Emit `.js` import extensions in generated server code (needed for Vercel Edge). @default false */
  useJsExtensions?: boolean;

  /** Emit `.js` import extensions in generated client SDK code (for certain bundlers/runtimes). @default false */
  useJsExtensionsClient?: boolean;

  /** Delete generated files for tables/items no longer present in the schema. @default true */
  clean?: boolean;

  /** Generated test-suite configuration. */
  tests?: {
    /** Generate test files. @default false */
    generate?: boolean;
    /** Output directory for generated tests. @default "./api/tests" */
    output?: string;
    /** Test framework for the generated tests. @default "vitest" */
    framework?: "vitest" | "jest" | "bun";
  };
}

export interface PullConfig {
  /** API URL to pull the SDK from. */
  from: string;
  /** Output directory for the pulled SDK. @default "./src/sdk" */
  output?: string;
  /** Auth token for the `/_psdk/*` endpoints. Use the `"env:VAR_NAME"` form. */
  pullToken?: string;
}

// Normalize simplified auth syntax to full AuthConfig
export function normalizeAuthConfig(input: AuthConfigInput | undefined): AuthConfig | undefined {
  if (!input) return undefined;

  // If it already looks like a full AuthConfig (has jwt or apiKeys), return as-is
  if ('jwt' in input || 'apiKeys' in input) {
    return input as AuthConfig;
  }

  // Handle shorthand syntax
  if ('apiKey' in input && input.apiKey) {
    return {
      apiKeyHeader: input.apiKeyHeader,
      apiKeys: [input.apiKey, ...(input.apiKeys || [])]
    };
  }

  // No recognizable auth config
  return undefined;
}
